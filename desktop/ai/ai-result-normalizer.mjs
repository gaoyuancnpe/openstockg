import {
  clampSectionList,
  getStructuredOutputSchemaVersion,
  sanitizeTextList,
  tryParseStructuredAiOutput
} from "./ai-shared.mjs";
import { getAiStructuredOutputSchema } from "./ai-task-registry.mjs";
import { buildAiFormMapping } from "./ai-form-mapping.mjs";

function fallbackSectionsForTask(taskKind, text) {
  const cleanText = String(text || "").trim();
  if (taskKind === "financial") {
    return [
      { key: "优势", title: "优势", bullets: cleanText ? [cleanText] : ["AI 未返回结构化摘要"] },
      { key: "风险", title: "风险", bullets: ["未提供结构化风险条目"] },
      { key: "后续跟踪", title: "后续跟踪", bullets: ["后续可补充结构化输出以支持自动填表"] }
    ];
  }
  if (taskKind === "screener") {
    return [
      { key: "支持点", title: "支持点", bullets: cleanText ? [cleanText] : ["AI 未返回结构化摘要"] },
      { key: "风险点", title: "风险点", bullets: ["未提供结构化风险条目"] },
      { key: "下一步动作", title: "下一步动作", bullets: ["后续可补充结构化输出以支持自动填表"] }
    ];
  }
  return [
    { key: "规则意图", title: "规则意图", bullets: cleanText ? [cleanText] : ["AI 未返回结构化摘要"] },
    { key: "主要问题", title: "主要问题", bullets: ["未提供结构化问题条目"] },
    { key: "优化建议", title: "优化建议", bullets: ["后续可补充结构化输出以支持自动填表"] }
  ];
}

function normalizeVerdict(taskKind, verdict) {
  const value = String(verdict || "").trim().toLowerCase();
  if (taskKind === "financial") {
    return value === "strong" || value === "weak" ? value : "neutral";
  }
  if (taskKind === "screener") {
    return value === "track" || value === "deprioritize" ? value : "watch";
  }
  return value === "practical" || value === "flawed" ? value : "average";
}

function normalizeConfidence(value) {
  const confidence = String(value || "").trim().toLowerCase();
  if (confidence === "high" || confidence === "low") return confidence;
  return "medium";
}

function buildSummaryMarkdown(structured, fallbackText) {
  const explicit = String(structured?.summaryMarkdown || "").trim();
  if (explicit) return explicit;

  const sections = Array.isArray(structured?.sections) ? structured.sections : [];
  if (sections.length > 0) {
    return sections
      .map((section) => {
        const bullets = Array.isArray(section.bullets) ? section.bullets : [];
        const body = bullets.map((item) => `- ${item}`).join("\n");
        return body ? `### ${section.title}\n${body}` : `### ${section.title}`;
      })
      .join("\n\n")
      .trim();
  }

  return String(fallbackText || "").trim() || "未返回内容";
}

function throwSchemaError(message) {
  throw new Error(`结构化生成失败：${message}`);
}

function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throwSchemaError("sections 不能为空");
  }
  sections.forEach((section, index) => {
    if (!section || typeof section !== "object") {
      throwSchemaError(`sections[${index}] 不是对象`);
    }
    if (!String(section.title || "").trim()) {
      throwSchemaError(`sections[${index}].title 不能为空`);
    }
    const bullets = Array.isArray(section.bullets) ? section.bullets.map((item) => String(item || "").trim()).filter(Boolean) : [];
    if (bullets.length === 0) {
      throwSchemaError(`sections[${index}].bullets 不能为空`);
    }
  });
}

function validateStructuredPayload({ task, structured }) {
  if (!structured || typeof structured !== "object") {
    throwSchemaError("未返回 JSON 对象");
  }
  if (String(structured.version || "").trim() !== getStructuredOutputSchemaVersion()) {
    throwSchemaError(`version 必须为 ${getStructuredOutputSchemaVersion()}`);
  }
  if (String(structured.taskKind || "").trim() !== task.kind) {
    throwSchemaError(`taskKind 必须为 ${task.kind}`);
  }
  if (!String(structured.subject || "").trim()) {
    throwSchemaError("subject 不能为空");
  }
  if (!String(structured.summaryMarkdown || "").trim()) {
    throwSchemaError("summaryMarkdown 不能为空");
  }

  const schema = getAiStructuredOutputSchema(task.kind);
  if (!schema.verdictEnum.includes(String(structured.verdict || "").trim().toLowerCase())) {
    throwSchemaError(`verdict 不在允许枚举内：${schema.verdictEnum.join("/")}`);
  }
  if (!["high", "medium", "low"].includes(String(structured.confidence || "").trim().toLowerCase())) {
    throwSchemaError("confidence 必须为 high/medium/low");
  }
  if (!Array.isArray(structured.suggestedActions)) {
    throwSchemaError("suggestedActions 必须为数组");
  }
  if (!Array.isArray(structured.missingData)) {
    throwSchemaError("missingData 必须为数组");
  }
  if (!Array.isArray(structured.formIntents)) {
    throwSchemaError("formIntents 必须为数组");
  }

  validateSections(structured.sections);
  const allowedTargets = new Set(Array.isArray(schema.mappingTargets) ? schema.mappingTargets : []);
  structured.formIntents.forEach((intent, index) => {
    if (!intent || typeof intent !== "object") {
      throwSchemaError(`formIntents[${index}] 不是对象`);
    }
    if (!allowedTargets.has(String(intent.target || "").trim())) {
      throwSchemaError(`formIntents[${index}].target 非法`);
    }
    if (String(intent.mode || "").trim().toLowerCase() !== "patch") {
      throwSchemaError(`formIntents[${index}].mode 必须为 patch`);
    }
    if (!intent.fields || typeof intent.fields !== "object") {
      throwSchemaError(`formIntents[${index}].fields 必须为对象`);
    }
  });
}

function normalizeStructuredPayload({ task, rawText, strict }) {
  const parsed = tryParseStructuredAiOutput(rawText);
  if (strict && !parsed) {
    throwSchemaError("模型未返回有效 JSON");
  }
  const fallbackSections = fallbackSectionsForTask(task.kind, rawText);
  const structured = parsed && typeof parsed === "object" ? parsed : {};
  if (strict) {
    validateStructuredPayload({ task, structured });
  }
  const sections = clampSectionList(structured.sections, fallbackSections);

  const normalized = {
    version: getStructuredOutputSchemaVersion(),
    taskKind: task.kind,
    subject: String(structured.subject || task.subject || "").trim() || task.subject || "-",
    summaryMarkdown: "",
    verdict: normalizeVerdict(task.kind, structured.verdict),
    sections,
    suggestedActions: sanitizeTextList(structured.suggestedActions),
    missingData: sanitizeTextList(structured.missingData),
    confidence: normalizeConfidence(structured.confidence),
    formIntents: Array.isArray(structured.formIntents) ? structured.formIntents : []
  };

  normalized.summaryMarkdown = strict
    ? String(structured.summaryMarkdown || "").trim()
    : buildSummaryMarkdown(normalized, rawText);
  return normalized;
}

export function normalizeAiTaskResult({ task, runtimeConfig, providerResult }) {
  const rawText = String(providerResult?.text || "").trim();
  if (!rawText) {
    throw new Error("DeepSeek 未返回可读内容");
  }

  if (task.mode !== "builder") {
    return {
      text: rawText,
      meta: {
        subject: task.subject,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
        thinkingEnabled: runtimeConfig.thinkingEnabled,
        reasoningEffort: runtimeConfig.thinkingEnabled ? runtimeConfig.reasoningEffort : null,
        taskKind: task.kind,
        taskId: task.id,
        taskMode: task.mode
      },
      structured: null,
      schema: null,
      formMapping: null,
      orchestration: {
        mode: runtimeConfig.orchestration.mode,
        planner: runtimeConfig.orchestration.planner,
        maxSteps: runtimeConfig.orchestration.maxSteps,
        plannedRoles: [task.orchestrationHints.role],
        nextExpansion: task.orchestrationHints.nextExpansion
      },
      raw: {
        text: rawText,
        providerPayload: providerResult?.raw || null
      }
    };
  }

  const structured = normalizeStructuredPayload({ task, rawText, strict: true });
  const formMapping = buildAiFormMapping({ structured });

  return {
    text: structured.summaryMarkdown,
    meta: {
      subject: task.subject,
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      thinkingEnabled: runtimeConfig.thinkingEnabled,
      reasoningEffort: runtimeConfig.thinkingEnabled ? runtimeConfig.reasoningEffort : null,
      taskKind: task.kind,
      taskId: task.id,
      taskMode: task.mode
    },
    structured,
    schema: getAiStructuredOutputSchema(task.kind),
    formMapping,
    orchestration: {
      mode: runtimeConfig.orchestration.mode,
      planner: runtimeConfig.orchestration.planner,
      maxSteps: runtimeConfig.orchestration.maxSteps,
      plannedRoles: [task.orchestrationHints.role],
      nextExpansion: task.orchestrationHints.nextExpansion
    },
    raw: {
      text: rawText,
      providerPayload: providerResult?.raw || null
    }
  };
}
