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
  return {
    ...defaults,
    ...input,
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
    }
  };
}
