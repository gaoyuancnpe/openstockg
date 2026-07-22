const DEFAULT_CONFIG_TEMPLATE = {
  dataProvider: "fmp",
  finnhubBaseUrl: "https://finnhub.io/api/v1",
  finnhubApiKey: "",
  fmpBaseUrl: "https://financialmodelingprep.com",
  fmpApiKey: "",
  ai: {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-v4-flash",
    thinkingEnabled: false,
    reasoningEffort: "high",
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
      schemaVersion: "openstock.desktop.ai.v1"
    }
  },
  pollIntervalSec: 60,
  scheduler: {
    mode: "interval",
    intervalSec: 60,
    dailyTime: "09:30",
    weekdaysOnly: true
  },
  defaultEmailTo: "",
  email: {
    provider: "gmail",
    user: "",
    pass: ""
  },
  feishu: {
    enabled: false,
    appId: "",
    appSecret: "",
    allowUserOpenIds: [],
    requireAllowlist: false,
    allowRemoteApply: false,
    confirmTtlSec: 300
  },
  defaultWebhookType: "generic",
  defaultWebhookUrl: ""
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG_TEMPLATE));
}

export function getDefaultDesktopConfig() {
  return cloneDefaults();
}

export function normalizeDesktopConfig(cfg) {
  const input = cfg && typeof cfg === "object" ? cfg : {};
  const defaults = cloneDefaults();
  const defaultWebhookUrl = String(input.defaultWebhookUrl ?? defaults.defaultWebhookUrl ?? "");
  const defaultWebhookType = String(input.defaultWebhookType || defaults.defaultWebhookType || "generic").toLowerCase() === "feishu"
    ? "feishu"
    : "generic";
  const feishuInput = input.feishu && typeof input.feishu === "object" ? input.feishu : {};
  const allowUserOpenIds = Array.isArray(feishuInput.allowUserOpenIds)
    ? Array.from(new Set(
      feishuInput.allowUserOpenIds
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    ))
    : [];
  const confirmTtlSec = Number.parseInt(String(feishuInput.confirmTtlSec ?? defaults.feishu.confirmTtlSec ?? "300"), 10);
  return {
    ...defaults,
    ...input,
    defaultWebhookType,
    defaultWebhookUrl,
    ai: {
      ...defaults.ai,
      ...(input.ai && typeof input.ai === "object" ? input.ai : {}),
      orchestration: {
        ...defaults.ai.orchestration,
        ...(input?.ai?.orchestration && typeof input.ai.orchestration === "object" ? input.ai.orchestration : {})
      },
      structuredOutput: {
        ...defaults.ai.structuredOutput,
        ...(input?.ai?.structuredOutput && typeof input.ai.structuredOutput === "object" ? input.ai.structuredOutput : {})
      }
    },
    scheduler: {
      ...defaults.scheduler,
      ...(input.scheduler && typeof input.scheduler === "object" ? input.scheduler : {})
    },
    email: {
      ...defaults.email,
      ...(input.email && typeof input.email === "object" ? input.email : {})
    },
    feishu: {
      ...defaults.feishu,
      ...feishuInput,
      enabled: Boolean(feishuInput.enabled),
      appId: String(feishuInput.appId || ""),
      appSecret: String(feishuInput.appSecret || ""),
      allowUserOpenIds,
      requireAllowlist: Boolean(feishuInput.requireAllowlist),
      allowRemoteApply: Boolean(feishuInput.allowRemoteApply),
      confirmTtlSec: Number.isFinite(confirmTtlSec) && confirmTtlSec > 0 ? confirmTtlSec : defaults.feishu.confirmTtlSec
    }
  };
}
