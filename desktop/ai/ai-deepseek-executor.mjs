import { fetchJSON } from "../shared-runtime.mjs";
import { extractOpenAIText } from "./ai-shared.mjs";

export async function executeDeepSeekTask({ runtimeConfig, task }) {
  if (!runtimeConfig.apiKey) {
    throw new Error("缺少 DeepSeek API Key，请先在配置页填写");
  }

  const body = {
    model: runtimeConfig.model,
    messages: Array.isArray(task.messages) ? task.messages : [],
    stream: false
  };

  if (task?.mode === "builder") {
    body.response_format = { type: "json_object" };
    body.max_tokens = 2000;
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
    raw
  };
}
