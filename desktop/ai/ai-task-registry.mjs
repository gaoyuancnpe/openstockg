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
    messages: [
      {
        role: "system",
        content:
          "你是严谨的美股财报聊天分析助手。只允许基于提供的结构化数据做中文判断，不要编造公司新闻、行业故事或管理层表述。输出保持控制台风格，直接、量化、去宣传化。"
      },
      {
        role: "user",
        content:
          `请基于以下结构化财报数据，给出一份中文聊天式解读。\n` +
          `要求：\n` +
          `1. 先直接给一句判断，说明当前财报偏强、一般还是偏弱。\n` +
          `2. 再从优势、风险、后续跟踪三个角度展开，但不要求固定 JSON 或固定格式。\n` +
          `3. 尽量量化，避免空话。\n` +
          `4. 如果信息不足，直接指出缺口。\n` +
          `5. 不要输出 JSON，不要生成结构化表单建议。\n\n` +
          `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
      }
    ]
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
    messages: [
      {
        role: "system",
        content:
          "你是严谨的美股财报结构化生成助手。只允许基于提供的结构化数据输出可执行建议，不要编造外部信息。"
      },
      {
        role: "user",
        content:
          `请基于以下结构化财报数据，生成结构化分析结果，并在有把握时给出可用于自动填表的建议。\n` +
          `要求：\n` +
          `1. 输出必须是 JSON，不要输出额外文字。\n` +
          `2. 结论要明确，并保留优势、风险、后续跟踪三部分。\n` +
          `3. 只有在有把握时才生成 financialPreset 或 ruleDraft。\n\n` +
          `${buildSchemaPrompt("financial", mappingTargets)}\n` +
          `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
      }
    ]
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
    messages: [
      {
        role: "system",
        content:
          "你是严谨的美股筛选聊天分析助手。只能基于用户给出的量化字段做中文解释，不要补新闻、题材、管理层故事。输出要求直接、量化、可执行。"
      },
      {
        role: "user",
        content:
          `请基于以下筛选结果，给出聊天式分析，判断这只股票当前更像“可继续跟踪”“一般观察”还是“暂不优先”。\n` +
          `要求：\n` +
          `1. 先给一句结论。\n` +
          `2. 再从支持点、风险点、下一步动作三个角度展开，但不要求 JSON。\n` +
          `3. 每个小节最多 3 条，每条只说和当前结构化字段直接相关的内容。\n` +
          `4. 如果信息明显不足，直接指出缺口，不要脑补。\n` +
          `5. 不要输出 JSON，不要自动生成结构化表单建议。\n\n` +
          `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
      }
    ]
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
    messages: [
      {
        role: "system",
        content:
          "你是严谨的美股筛选结构化生成助手。只能基于量化字段生成结构化结论和可执行模板建议，不要补新闻、题材、管理层故事。"
      },
      {
        role: "user",
        content:
          `请基于以下筛选结果，输出结构化分析结果，并在有把握时生成 screenerPreset 或 ruleDraft。\n` +
          `要求：\n` +
          `1. 输出必须是 JSON，不要输出额外文字。\n` +
          `2. 如果不适合生成模板，就返回 formIntents: []。\n\n` +
          `${buildSchemaPrompt("screener", mappingTargets)}\n` +
          `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
      }
    ]
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
    messages: [
      {
        role: "system",
        content:
          "你是严谨的美股提醒规则聊天评审助手。只能基于给出的结构化规则配置做判断，不要编造外部背景。输出要指出规则用途、过宽或过窄风险，以及如何改得更稳。"
      },
      {
        role: "user",
        content:
          `请用聊天式方式评估这条提醒规则的质量。\n` +
          `要求：\n` +
          `1. 先给一句结论，说明它更像“实用”“一般”还是“有明显缺陷”。\n` +
          `2. 再从规则意图、主要问题、优化建议三个角度展开，不要求 JSON。\n` +
          `3. 只基于当前规则配置做判断，不能假设外部数据源一定完美。\n` +
          `4. 优化建议尽量具体到字段或阈值层面。\n` +
          `5. 不要输出 JSON，不要自动生成结构化草案。\n\n` +
          `规则配置：\n${JSON.stringify(metrics, null, 2)}`
      }
    ]
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
    messages: [
      {
        role: "system",
        content:
          "你是严谨的美股提醒规则结构化生成助手。只能基于给出的规则配置输出结构化评审结果和可执行规则草案，不要编造外部背景。"
      },
      {
        role: "user",
        content:
          `请评估这条提醒规则，并在有把握时给出更稳的规则草案。\n` +
          `要求：\n` +
          `1. 输出必须是 JSON，不要输出额外文字。\n` +
          `2. 如果不适合生成规则草案，就返回 formIntents: []。\n\n` +
          `${buildSchemaPrompt("rule", mappingTargets)}\n` +
          `规则配置：\n${JSON.stringify(metrics, null, 2)}`
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
  return taskMode === "builder" ? createRuleBuilderTask(targetPayload) : createRuleChatTask(targetPayload);
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

  return {
    ...common,
    taskKind,
    verdictEnum: ["practical", "average", "flawed"],
    recommendedSections: ["规则意图", "主要问题", "优化建议"],
    mappingTargets: ["ruleDraft"]
  };
}
