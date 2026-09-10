import { fetchJSON } from "../shared-runtime.mjs";
import { extractOpenAIText } from "./ai-shared.mjs";

export async function executeDeepSeekTask({ runtimeConfig, task, modelOverride = "", tools = null }) {
  if (!runtimeConfig.apiKey) {
    throw new Error("缺少 DeepSeek API Key，请先在配置页填写");
  }

  const model = String(modelOverride || "").trim() || runtimeConfig.model;
  const body = {
    model,
    messages: Array.isArray(task.messages) ? task.messages : [],
    stream: false
  };

  if (task?.mode === "builder") {
    body.response_format = { type: "json_object" };
    body.max_tokens = 2000;
  }

  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  if (runtimeConfig.thinkingEnabled) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = runtimeConfig.reasoningEffort;
  }

  const raw = await fetchJSON(`${runtimeConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtimeConfig.apiKey}`
    },
    body: JSON.stringify(body)
  });

  return {
    text: extractOpenAIText(raw),
    toolCalls: extractOpenAIToolCalls(raw),
    raw
  };
}

function extractOpenAIToolCalls(data) {
  const calls = data?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return [];
  return calls
    .map((call) => {
      const id = String(call?.id || "");
      const name = String(call?.function?.name || "");
      let args = {};
      try {
        args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      if (!id || !name) return null;
      return { id, name, arguments: args && typeof args === "object" ? args : {} };
    })
    .filter(Boolean);
}
