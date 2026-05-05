import { normalizeHttpBaseUrl } from "../shared-runtime.mjs";

const STRUCTURED_OUTPUT_SCHEMA_VERSION = "openstock.desktop.ai.v1";

export function normalizeDeepSeekModel(value) {
  const model = String(value || "").trim();
  return model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
}

export function normalizeReasoningEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "max") return "max";
  return "high";
}

export function normalizeAiTaskKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "financial" || kind === "screener" || kind === "rule") {
    return kind;
  }
  throw new Error(`不支持的 AI 解读类型：${kind || "unknown"}`);
}

export function normalizeAiTaskMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "builder" || mode === "structured") return "builder";
  return "chat";
}

export function normalizeAiRuntimeConfig(ai) {
  const input = ai && typeof ai === "object" ? ai : {};
  const provider = String(input.provider || "deepseek").trim().toLowerCase() || "deepseek";
  const thinkingEnabled = Boolean(input.thinkingEnabled);
  const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort);

  return {
    provider,
    baseUrl: normalizeHttpBaseUrl(input.baseUrl, "https://api.deepseek.com"),
    apiKey: String(input.apiKey || ""),
    model: normalizeDeepSeekModel(input.model),
    thinkingEnabled,
    reasoningEffort,
    orchestration: {
      mode: "single_task",
      planner: "passthrough",
      maxSteps: 1,
      fanOutEnabled: false
    },
    structuredOutput: {
      enabled: true,
      responseMode: "json_markdown",
      fallbackToText: true,
      schemaVersion: STRUCTURED_OUTPUT_SCHEMA_VERSION
    }
  };
}

export function extractOpenAIText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

export function sanitizeTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function clampSectionList(value, fallbackSections) {
  if (!Array.isArray(value)) return fallbackSections;
  const sections = value
    .map((section) => {
      const key = String(section?.key || "").trim();
      const title = String(section?.title || "").trim();
      const bullets = sanitizeTextList(section?.bullets).slice(0, 5);
      if (!title || bullets.length === 0) return null;
      return {
        key: key || title,
        title,
        bullets
      };
    })
    .filter(Boolean);
  return sections.length > 0 ? sections : fallbackSections;
}

export function tryParseStructuredAiOutput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const direct = tryParseJSON(raw);
  if (direct) return direct;

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = tryParseJSON(fencedMatch[1].trim());
    if (fenced) return fenced;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParseJSON(raw.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function tryParseJSON(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function getStructuredOutputSchemaVersion() {
  return STRUCTURED_OUTPUT_SCHEMA_VERSION;
}
