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
    weekdaysOnly: true,
    usMarketHoursOnly: false
  },
  defaultEmailTo: "",
  email: {
    provider: "gmail",
    user: "",
    pass: "",
    host: "",
    port: 0,
    secure: true
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
  marketAmv: {
    primaryIndex: "sp500",
    sampleLimit: 100,
    backfill: { concurrency: 3, delayMs: 200, maxPerIndex: 6000, defaultYears: 20 }
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

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function ensureEnum(allowed, value, fallback) {
  const v = String(value || "").toLowerCase();
  return allowed.includes(v) ? v : fallback;
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
  const marketAmvInput = input.marketAmv && typeof input.marketAmv === "object" ? input.marketAmv : {};
  const backfillInput = marketAmvInput.backfill && typeof marketAmvInput.backfill === "object" ? marketAmvInput.backfill : {};
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
      ...(input.scheduler && typeof input.scheduler === "object" ? input.scheduler : {}),
      usMarketHoursOnly: input?.scheduler?.usMarketHoursOnly ?? false
    },
    email: {
      ...defaults.email,
      ...(input.email && typeof input.email === "object" ? input.email : {}),
      host: String(input?.email?.host ?? "").trim(),
      port: Number(input?.email?.port) || 0,
      secure: input?.email?.secure ?? true
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
    },
    marketAmv: {
      ...defaults.marketAmv,
      ...marketAmvInput,
      primaryIndex: ensureEnum(["sp500", "nasdaq", "all"], marketAmvInput.primaryIndex, defaults.marketAmv.primaryIndex),
      sampleLimit: clampInt(marketAmvInput.sampleLimit, 1, 1000, defaults.marketAmv.sampleLimit),
      backfill: {
        ...defaults.marketAmv.backfill,
        ...backfillInput,
        concurrency: clampInt(backfillInput.concurrency, 1, 10, defaults.marketAmv.backfill.concurrency),
        delayMs: clampInt(backfillInput.delayMs, 0, 5000, defaults.marketAmv.backfill.delayMs),
        maxPerIndex: clampInt(backfillInput.maxPerIndex, 90, 20000, defaults.marketAmv.backfill.maxPerIndex),
        defaultYears: clampInt(backfillInput.defaultYears, 1, 40, defaults.marketAmv.backfill.defaultYears)
      }
    }
  };
}
