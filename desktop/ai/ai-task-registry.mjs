import { toNumber } from "../shared-runtime.mjs";
import { getStructuredOutputSchemaVersion, normalizeAiTaskKind, normalizeAiTaskMode } from "./ai-shared.mjs";

function buildSchemaPrompt(kind, mappingTargets) {
  const schemaVersion = getStructuredOutputSchemaVersion();
  const intentLines = mappingTargets.map((target) => `- ${target}`).join("\n");
  return (
    `请只返回一个 JSON 对象，不要输出 markdown 代码块，不要补充额外说明。\n` +
    `JSON 对象字段要求：\n` +
    `- version: 固定为 "${schemaVersion}"\n` +
    `- taskKind: 固定为 "${kind}"\n` +
    `- subject: 当前解读对象名称或 symbol\n` +
    `- summaryMarkdown: 供 UI 直接展示的中文 markdown 摘要\n` +
    `- verdict: 使用 task 语义内的枚举值\n` +
    `- sections: 数组，每项含 key/title/bullets，bullets 为中文短句数组\n` +
    `- suggestedActions: 数组，给出后续动作\n` +
    `- missingData: 数组，列出信息缺口，没有可传空数组\n` +
    `- confidence: "high" | "medium" | "low"\n` +
    `- formIntents: 数组，用于未来自动填表，当前可用 target 为：\n${intentLines}\n` +
    `- formIntents[*] 必须包含 target/mode/reason/fields 四个字段；mode 仅允许 "patch"\n` +
    `- 若当前没有可靠的表单建议，请返回 formIntents: []\n`
  );
}

function buildFinancialMetrics(payload) {
  return {
    symbol: String(payload.symbol || ""),
    companyName: String(payload.companyName || ""),
    reportDate: String(payload.reportDate || ""),
    filingDate: String(payload.filingDate || ""),
    marketCapM: toNumber(payload.marketCap),
    revenueM: toNumber(payload.revenueM),
    revenueGrowthYoY: toNumber(payload.revenueGrowthYoY),
    grossMargin: toNumber(payload.grossMargin),
    ebitdaM: toNumber(payload.ebitdaM),
    ebitdaGrowthYoY: toNumber(payload.ebitdaGrowthYoY),
    ebitdaMargin: toNumber(payload.ebitdaMargin),
    operatingMargin: toNumber(payload.operatingMargin),
    netMargin: toNumber(payload.netMargin),
    operatingCashFlowM: toNumber(payload.operatingCashFlowM),
    freeCashFlowM: toNumber(payload.freeCashFlowM),
    debtToEquity: toNumber(payload.debtToEquity),
    reasons: Array.isArray(payload.reasons) ? payload.reasons.map((item) => String(item)) : []
  };
}

function buildScreenerMetrics(payload) {
  return {
    symbol: String(payload.symbol || ""),
    price: toNumber(payload.price),
    changePercent: toNumber(payload.changePercent),
    marketCapM: toNumber(payload.marketCap),
    peTTM: toNumber(payload.peTTM),
    volumeRatio: toNumber(payload.volumeRatio),
    turnoverM: toNumber(payload.turnoverM),
    recent5dCloseAth:
      payload.recent5dCloseAth === null || payload.recent5dCloseAth === undefined
        ? null
        : Boolean(payload.recent5dCloseAth)
  };
}

function buildRuleMetrics(payload) {
  return {
    name: String(payload.name || ""),
    enabled: Boolean(payload.enabled),
    universeType: String(payload?.universe?.type || "manual"),
    universeMaxScan: toNumber(payload?.universe?.maxScan),
    minPrice: toNumber(payload?.universe?.minPrice),
    minMarketCap: toNumber(payload?.universe?.minMarketCap),
    minTurnoverM: toNumber(payload?.universe?.minTurnoverM),
    requireRecent5dCloseAth:
      payload?.universe?.requireRecent5dCloseAth === undefined ? null : Boolean(payload?.universe?.requireRecent5dCloseAth),
    minVolumeRatio: toNumber(payload?.universe?.minVolumeRatio),
    cooldownSec: toNumber(payload?.cooldownSec),
    symbolsCount: Array.isArray(payload?.symbols) ? payload.symbols.length : 0,
    symbolsPreview: Array.isArray(payload?.symbols) ? payload.symbols.slice(0, 20) : [],
    ui: payload?.ui || null,
    condition: payload?.condition || null
  };
}

function extractAiSessionContext(payload) {
  const ai = payload && typeof payload.__ai === "object" ? payload.__ai : null;
  const prompt = typeof ai?.prompt === "string" ? ai.prompt.trim() : "";
  const history = Array.isArray(ai?.history)
    ? ai.history
      .map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: String(item?.content || "").trim()
      }))
      .filter((item) => item.content)
      .slice(-12)
    : [];
  return {
    prompt,
    history
  };
}

function extractAssistantContext(payload) {
  const assistant = payload && typeof payload.__assistant === "object" ? payload.__assistant : null;
  const attachments = Array.isArray(assistant?.attachments)
    ? assistant.attachments
      .map((item) => {
        const type = String(item?.type || "").trim();
        const label = String(item?.label || "").trim();
        const content = item?.content;
        if (!type || !label || content === undefined) return null;
        return { type, label, content };
      })
      .filter(Boolean)
      .slice(0, 8)
    : [];
  return {
    attachments
  };
}

function buildAssistantContextMarkdown(payload) {
  const { attachments } = extractAssistantContext(payload);
  if (attachments.length === 0) {
    return "当前没有附加任何应用上下文。你只能基于用户问题和通用知识回答，不能假装已经看到了当前运行状态、规则列表或日志。";
  }

  return attachments
    .map((item, index) => {
      const body = typeof item.content === "string"
        ? item.content
        : JSON.stringify(item.content, null, 2);
      return `### 上下文 ${index + 1}: ${item.label}\n类型: ${item.type}\n内容:\n${body}`;
    })
    .join("\n\n");
}

function getAssistantSubject(payload) {
  const { prompt } = extractAiSessionContext(payload);
  const { attachments } = extractAssistantContext(payload);
  if (attachments[0]?.label) return attachments[0].label;
  if (prompt) return prompt.slice(0, 24);
  return "开放助手";
}

function buildChatMessages({ systemPrompt, initialPrompt, followupPrompt, metrics, payload }) {
  const { prompt, history } = extractAiSessionContext(payload);
  if (!prompt && history.length === 0) {
    return [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `${initialPrompt}\n\n结构化数据：\n${JSON.stringify(metrics, null, 2)}`
      }
    ];
  }

  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content:
        "以下是当前固定的结构化上下文。你后续的所有回答都只能基于这些字段判断，不能补充外部新闻、题材、管理层发言或未提供的数据。\n\n" +
        `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
    },
    ...history,
    {
      role: "user",
      content: `${followupPrompt}\n\n我的问题：${prompt}`
    }
  ];
}

function buildBuilderMessages({ systemPrompt, introPrompt, metrics, payload, schemaPrompt }) {
  const { prompt } = extractAiSessionContext(payload);
  const extraRequirement = prompt ? `\n补充要求：\n${prompt}\n` : "\n";
  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content:
        `${introPrompt}\n` +
        `要求：\n` +
        `1. 输出必须是 JSON，不要输出额外文字。\n` +
        `2. 只有在结构化依据充分时才给出表单建议。\n` +
        `${extraRequirement}\n` +
        `${schemaPrompt}\n` +
        `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
    }
  ];
}

function createFinancialChatTask(payload) {
  const metrics = buildFinancialMetrics(payload);
  const subject = String(payload.symbol || payload.companyName || "");
  return {
    id: `financial:chat:${subject || "unknown"}`,
    kind: "financial",
    mode: "chat",
    subject,
    payload,
    mappingTargets: [],
    schema: null,
    orchestrationHints: {
      role: "financial_chat_analyst",
      nextExpansion: ["planner", "financial_builder"]
    },
    messages: buildChatMessages({
      systemPrompt:
        "你是严谨的美股财报聊天分析助手。只允许基于提供的结构化数据做中文判断，不要编造公司新闻、行业故事或管理层表述。输出保持控制台风格，直接、量化、去宣传化。",
      initialPrompt:
        "请基于以下结构化财报数据，给出一份中文聊天式解读。\n" +
        "要求：\n" +
        "1. 先直接给一句判断，说明当前财报偏强、一般还是偏弱。\n" +
        "2. 再从优势、风险、后续跟踪三个角度展开，但不要求固定 JSON 或固定格式。\n" +
        "3. 尽量量化，避免空话。\n" +
        "4. 如果信息不足，直接指出缺口。\n" +
        "5. 不要输出 JSON，不要生成结构化表单建议。",
      followupPrompt:
        "请继续围绕这份财报做聊天式回答。回答应直接回应问题，必要时引用已有结构化字段，不足的信息要明确指出。",
      metrics,
      payload
    })
  };
}

function createFinancialBuilderTask(payload) {
  const metrics = buildFinancialMetrics(payload);
  const subject = String(payload.symbol || payload.companyName || "");
  const mappingTargets = ["financialPreset", "ruleDraft"];
  return {
    id: `financial:builder:${subject || "unknown"}`,
    kind: "financial",
    mode: "builder",
    subject,
    payload,
    mappingTargets,
    schema: getAiStructuredOutputSchema("financial"),
    orchestrationHints: {
      role: "financial_builder",
      nextExpansion: ["planner", "rule_designer"]
    },
    messages: buildBuilderMessages({
      systemPrompt:
        "你是严谨的美股财报结构化生成助手。只允许基于提供的结构化数据输出可执行建议，不要编造外部信息。",
      introPrompt:
        "请基于以下结构化财报数据，生成结构化分析结果，并在有把握时给出可用于自动填表的建议。\n" +
        "结论要明确，并保留优势、风险、后续跟踪三部分。只有在有把握时才生成 financialPreset 或 ruleDraft。",
      metrics,
      payload,
      schemaPrompt: buildSchemaPrompt("financial", mappingTargets)
    })
  };
}

function createScreenerChatTask(payload) {
  const metrics = buildScreenerMetrics(payload);
  const subject = String(payload.symbol || "");
  return {
    id: `screener:chat:${subject || "unknown"}`,
    kind: "screener",
    mode: "chat",
    subject,
    payload,
    mappingTargets: [],
    schema: null,
    orchestrationHints: {
      role: "screener_chat_analyst",
      nextExpansion: ["planner", "screener_builder"]
    },
    messages: buildChatMessages({
      systemPrompt:
        "你是严谨的美股筛选聊天分析助手。只能基于用户给出的量化字段做中文解释，不要补新闻、题材、管理层故事。输出要求直接、量化、可执行。",
      initialPrompt:
        "请基于以下筛选结果，给出聊天式分析，判断这只股票当前更像“可继续跟踪”“一般观察”还是“暂不优先”。\n" +
        "要求：\n" +
        "1. 先给一句结论。\n" +
        "2. 再从支持点、风险点、下一步动作三个角度展开，但不要求 JSON。\n" +
        "3. 每个小节最多 3 条，每条只说和当前结构化字段直接相关的内容。\n" +
        "4. 如果信息明显不足，直接指出缺口，不要脑补。\n" +
        "5. 不要输出 JSON，不要自动生成结构化表单建议。",
      followupPrompt:
        "请继续围绕这条筛选结果聊天回答。直接回应问题，并明确哪些判断是有数据支持的，哪些信息仍然缺失。",
      metrics,
      payload
    })
  };
}

function createScreenerBuilderTask(payload) {
  const metrics = buildScreenerMetrics(payload);
  const subject = String(payload.symbol || "");
  const mappingTargets = ["screenerPreset", "ruleDraft"];
  return {
    id: `screener:builder:${subject || "unknown"}`,
    kind: "screener",
    mode: "builder",
    subject,
    payload,
    mappingTargets,
    schema: getAiStructuredOutputSchema("screener"),
    orchestrationHints: {
      role: "screener_builder",
      nextExpansion: ["planner", "rule_designer"]
    },
    messages: buildBuilderMessages({
      systemPrompt:
        "你是严谨的美股筛选结构化生成助手。只能基于量化字段生成结构化结论和可执行规则建议，不要补新闻、题材、管理层故事。",
      introPrompt:
        "请基于以下筛选结果，输出结构化分析结果，并在有把握时生成 screenerPreset 或 ruleDraft。\n" +
        "如果不适合生成规则建议，就返回 formIntents: []。",
      metrics,
      payload,
      schemaPrompt: buildSchemaPrompt("screener", mappingTargets)
    })
  };
}

function createRuleChatTask(payload) {
  const metrics = buildRuleMetrics(payload);
  const subject = String(payload.name || "未命名规则");
  return {
    id: `rule:chat:${subject}`,
    kind: "rule",
    mode: "chat",
    subject,
    payload,
    mappingTargets: [],
    schema: null,
    orchestrationHints: {
      role: "rule_chat_reviewer",
      nextExpansion: ["planner", "rule_builder", "validator"]
    },
    messages: buildChatMessages({
      systemPrompt:
        "你是严谨的美股提醒规则聊天评审助手。只能基于给出的结构化规则配置做判断，不要编造外部背景。输出要指出规则用途、过宽或过窄风险，以及如何改得更稳。",
      initialPrompt:
        "请用聊天式方式评估这条提醒规则的质量。\n" +
        "要求：\n" +
        "1. 先给一句结论，说明它更像“实用”“一般”还是“有明显缺陷”。\n" +
        "2. 再从规则意图、主要问题、优化建议三个角度展开，不要求 JSON。\n" +
        "3. 只基于当前规则配置做判断，不能假设外部数据源一定完美。\n" +
        "4. 优化建议尽量具体到字段或阈值层面。\n" +
        "5. 不要输出 JSON，不要自动生成结构化草案。",
      followupPrompt:
        "请继续围绕这条规则配置聊天回答。判断必须具体到字段、阈值或作用范围，不要抽象空谈。",
      metrics,
      payload
    })
  };
}

function createRuleBuilderTask(payload) {
  const metrics = buildRuleMetrics(payload);
  const subject = String(payload.name || "未命名规则");
  const mappingTargets = ["ruleDraft"];
  return {
    id: `rule:builder:${subject}`,
    kind: "rule",
    mode: "builder",
    subject,
    payload,
    mappingTargets,
    schema: getAiStructuredOutputSchema("rule"),
    orchestrationHints: {
      role: "rule_builder",
      nextExpansion: ["planner", "validator"]
    },
    messages: buildBuilderMessages({
      systemPrompt:
        "你是严谨的美股提醒规则结构化生成助手。只能基于给出的规则配置输出结构化评审结果和可执行规则草案，不要编造外部背景。",
      introPrompt:
        "请评估这条提醒规则，并在有把握时给出更稳的规则草案。\n" +
        "如果不适合生成规则草案，就返回 formIntents: []。",
      metrics,
      payload,
      schemaPrompt: buildSchemaPrompt("rule", mappingTargets)
    })
  };
}

function createAssistantChatTask(payload) {
  const subject = getAssistantSubject(payload);
  const { prompt, history } = extractAiSessionContext(payload);
  const contextMarkdown = buildAssistantContextMarkdown(payload);
  const question = prompt || "请先告诉我你现在能帮我做什么。";
  return {
    id: `assistant:chat:${subject || "default"}`,
    kind: "assistant",
    mode: "chat",
    subject,
    payload,
    mappingTargets: [],
    schema: null,
    orchestrationHints: {
      role: "open_assistant",
      nextExpansion: ["planner", "rule_builder", "diagnostics_advisor"]
    },
    messages: [
      {
        role: "system",
        content:
          "你是 OpenStock 桌面端里的开放式 AI 助手。你可以进行开放聊天、规则设计、定时/通知排障、产品使用说明，以及一般性的投资研究思路讨论。\n" +
          "回答规则：\n" +
          "1. 先区分哪些结论来自用户附加的应用上下文，哪些只是通用知识或经验判断。\n" +
          "2. 没有附加上下文时，不要假装自己已经看到了规则、日志、配置或运行结果。\n" +
          "3. 允许使用通用知识回答，不必被现有规则对象限制住。\n" +
          "4. 如果用户要你基于当前应用现场做判断，但上下文不足，直接指出还缺什么上下文。\n" +
          "5. 输出保持中文、直接、控制台风格，优先给可执行建议。"
      },
      {
        role: "user",
        content: `当前可用的应用上下文如下：\n\n${contextMarkdown}`
      },
      ...history,
      {
        role: "user",
        content: question
      }
    ]
  };
}

function createAssistantBuilderTask(payload) {
  const subject = getAssistantSubject(payload);
  const mappingTargets = ["ruleDraft", "scheduleDraft"];
  const contextMarkdown = buildAssistantContextMarkdown(payload);
  const { prompt } = extractAiSessionContext(payload);
  return {
    id: `assistant:builder:${subject || "default"}`,
    kind: "assistant",
    mode: "builder",
    subject,
    payload,
    mappingTargets,
    schema: getAiStructuredOutputSchema("assistant"),
    orchestrationHints: {
      role: "open_assistant_builder",
      nextExpansion: ["planner", "rule_builder", "scheduler_designer", "validator"]
    },
    messages: [
      {
        role: "system",
        content:
          "你是 OpenStock 桌面端里的开放式 AI 助手，当前任务是把用户需求转成可执行规则草案或定时草案。\n" +
          "你可以结合用户问题、附加的应用上下文和通用规则设计知识生成建议。\n" +
          "只有在信息足够时才输出 ruleDraft 或 scheduleDraft；如果信息明显不足，必须返回 formIntents: []。"
      },
      {
        role: "user",
        content:
          "请根据下面的需求和上下文，输出结构化分析结果；只有在把握足够时才生成 ruleDraft 或 scheduleDraft。\n" +
          `用户要求：\n${prompt || "未提供额外补充要求，请先根据上下文理解用户意图。"}\n\n` +
          `当前可用的应用上下文：\n\n${contextMarkdown}\n\n` +
          `${buildSchemaPrompt("assistant", mappingTargets)}`
      }
    ]
  };
}

export function createAiTaskDefinition({ kind, mode, payload }) {
  const taskKind = normalizeAiTaskKind(kind);
  const taskMode = normalizeAiTaskMode(mode);
  const targetPayload = payload && typeof payload === "object" ? payload : null;
  if (!targetPayload) {
    throw new Error("缺少可解读的对象");
  }

  if (taskKind === "financial") {
    return taskMode === "builder" ? createFinancialBuilderTask(targetPayload) : createFinancialChatTask(targetPayload);
  }
  if (taskKind === "screener") {
    return taskMode === "builder" ? createScreenerBuilderTask(targetPayload) : createScreenerChatTask(targetPayload);
  }
  if (taskKind === "rule") {
    return taskMode === "builder" ? createRuleBuilderTask(targetPayload) : createRuleChatTask(targetPayload);
  }
  return taskMode === "builder" ? createAssistantBuilderTask(targetPayload) : createAssistantChatTask(targetPayload);
}

export function getAiStructuredOutputSchema(kind) {
  const taskKind = normalizeAiTaskKind(kind);
  const common = {
    version: getStructuredOutputSchemaVersion(),
    responseType: "structured_analysis",
    baseFields: [
      { key: "version", type: "string", required: true },
      { key: "taskKind", type: "string", required: true },
      { key: "subject", type: "string", required: true },
      { key: "summaryMarkdown", type: "string", required: true },
      { key: "verdict", type: "string", required: true },
      { key: "sections", type: "section[]", required: true },
      { key: "suggestedActions", type: "string[]", required: true },
      { key: "missingData", type: "string[]", required: true },
      { key: "confidence", type: "enum(high|medium|low)", required: true },
      { key: "formIntents", type: "formIntent[]", required: true }
    ]
  };

  if (taskKind === "financial") {
    return {
      ...common,
      taskKind,
      verdictEnum: ["strong", "neutral", "weak"],
      recommendedSections: ["优势", "风险", "后续跟踪"],
      mappingTargets: ["financialPreset", "ruleDraft"]
    };
  }

  if (taskKind === "screener") {
    return {
      ...common,
      taskKind,
      verdictEnum: ["track", "watch", "deprioritize"],
      recommendedSections: ["支持点", "风险点", "下一步动作"],
      mappingTargets: ["screenerPreset", "ruleDraft"]
    };
  }

  if (taskKind === "assistant") {
    return {
      ...common,
      taskKind,
      verdictEnum: ["actionable", "need_context", "not_recommended"],
      recommendedSections: ["需求理解", "可执行建议", "风险与缺口"],
      mappingTargets: ["ruleDraft", "scheduleDraft"]
    };
  }

  return {
    ...common,
    taskKind,
    verdictEnum: ["practical", "average", "flawed"],
    recommendedSections: ["规则意图", "主要问题", "优化建议"],
    mappingTargets: ["ruleDraft"]
  };
}
