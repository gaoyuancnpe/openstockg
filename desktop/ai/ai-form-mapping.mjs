import { toNumber } from "../shared-runtime.mjs";

const RULE_CONDITION_TYPES = new Set([
  "price_above",
  "price_below",
  "change_above",
  "change_below",
  "cross_above_sma20",
  "cross_below_sma20",
  "rsi_above",
  "rsi_below",
  "volume_ratio_above",
  "market_cap_above",
  "turnover_m_above",
  "recent_5d_close_ath"
]);

function takeString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function takeNumber(value) {
  const num = toNumber(value);
  return Number.isFinite(num) ? num : null;
}

function takeBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function normalizeSymbols(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function normalizeConditionItem(item) {
  const type = String(item?.type || "").trim();
  if (!RULE_CONDITION_TYPES.has(type)) return null;
  if (type === "cross_above_sma20" || type === "cross_below_sma20" || type === "recent_5d_close_ath") {
    return { type, value: null };
  }
  const value = takeNumber(item?.value);
  if (value === null) return null;
  return { type, value };
}

function normalizeRuleUniverse(universe, warnings) {
  const input = universe && typeof universe === "object" ? universe : {};
  const type = String(input.type || "manual").trim().toLowerCase() === "us_all" ? "us_all" : "manual";
  if (type === "manual") return { type: "manual" };

  const maxScan = takeNumber(input.maxScan);
  const minPrice = takeNumber(input.minPrice);
  const minMarketCap = takeNumber(input.minMarketCap);
  const minTurnoverM = takeNumber(input.minTurnoverM);
  const minVolumeRatio = takeNumber(input.minVolumeRatio);
  const requireRecent5dCloseAth = takeBoolean(input.requireRecent5dCloseAth);

  if (maxScan === null) warnings.push("ruleDraft.universe.maxScan 缺失，已回退到 2000");

  return {
    type: "us_all",
    maxScan: maxScan === null ? 2000 : maxScan,
    minPrice,
    minMarketCap,
    minTurnoverM,
    requireRecent5dCloseAth: requireRecent5dCloseAth === null ? true : requireRecent5dCloseAth,
    minVolumeRatio
  };
}

function normalizeRuleDraft(fields, warnings) {
  const input = fields && typeof fields === "object" ? fields : {};
  const conditions = Array.isArray(input.conditions)
    ? input.conditions.map(normalizeConditionItem).filter(Boolean)
    : [];

  if (conditions.length === 0) {
    warnings.push("ruleDraft.conditions 缺失或无有效条件，已回退到默认价格条件");
    conditions.push({ type: "price_above", value: 0 });
  }

  return {
    enabled: takeBoolean(input.enabled) ?? true,
    name: takeString(input.name) || "AI 建议规则",
    symbols: normalizeSymbols(input.symbols),
    universe: normalizeRuleUniverse(input.universe, warnings),
    cooldownSec: takeNumber(input.cooldownSec) ?? 86400,
    notify: {
      ...(takeString(input?.notify?.email) ? { email: takeString(input.notify.email) } : {}),
      ...(takeString(input?.notify?.webhookUrl) ? { webhookUrl: takeString(input.notify.webhookUrl) } : {})
    },
    groupOp: String(input.groupOp || "and").trim().toLowerCase() === "or" ? "or" : "and",
    conditions
  };
}

function normalizeScreenerPreset(fields, warnings) {
  const input = fields && typeof fields === "object" ? fields : {};
  const universe = String(input.universe || "us_all").trim().toLowerCase() === "manual" ? "manual" : "us_all";
  const maxScan = takeNumber(input.maxScan);
  if (universe === "us_all" && maxScan === null) {
    warnings.push("screenerPreset.maxScan 缺失，已回退到 2000");
  }

  return {
    universe,
    symbols: universe === "manual" ? normalizeSymbols(input.symbols) : [],
    maxScan: universe === "us_all" ? (maxScan === null ? 2000 : maxScan) : null,
    minPrice: takeNumber(input.minPrice),
    minMarketCap: takeNumber(input.minMarketCap),
    minTurnoverM: takeNumber(input.minTurnoverM),
    requireRecent5dCloseAth: takeBoolean(input.requireRecent5dCloseAth),
    minVolumeRatio: takeNumber(input.minVolumeRatio)
  };
}

function normalizeFinancialPreset(fields, warnings) {
  const input = fields && typeof fields === "object" ? fields : {};
  const universe = String(input.universe || "us_all").trim().toLowerCase() === "manual" ? "manual" : "us_all";
  const maxScan = takeNumber(input.maxScan);
  if (universe === "us_all" && maxScan === null) {
    warnings.push("financialPreset.maxScan 缺失，已回退到 100");
  }

  const criteriaInput = input.criteria && typeof input.criteria === "object" ? input.criteria : {};
  return {
    universe,
    symbols: universe === "manual" ? normalizeSymbols(input.symbols) : [],
    maxScan: universe === "us_all" ? (maxScan === null ? 100 : maxScan) : null,
    criteria: {
      minMarketCap: takeNumber(criteriaInput.minMarketCap),
      minRevenueGrowthYoY: takeNumber(criteriaInput.minRevenueGrowthYoY),
      minGrossMargin: takeNumber(criteriaInput.minGrossMargin),
      minEbitdaGrowthYoY: takeNumber(criteriaInput.minEbitdaGrowthYoY),
      minEbitdaMargin: takeNumber(criteriaInput.minEbitdaMargin),
      minOperatingMargin: takeNumber(criteriaInput.minOperatingMargin),
      requirePositiveOperatingCashFlow: takeBoolean(criteriaInput.requirePositiveOperatingCashFlow),
      requirePositiveFreeCashFlow: takeBoolean(criteriaInput.requirePositiveFreeCashFlow),
      maxDebtToEquity: takeNumber(criteriaInput.maxDebtToEquity)
    }
  };
}

function normalizeFormIntent(intent) {
  const target = String(intent?.target || "").trim();
  const mode = String(intent?.mode || "patch").trim().toLowerCase();
  if (!target || mode !== "patch") return null;
  return {
    target,
    mode: "patch",
    reason: takeString(intent?.reason) || "",
    fields: intent?.fields && typeof intent.fields === "object" ? intent.fields : {}
  };
}

export function buildAiFormMapping({ structured }) {
  const intents = Array.isArray(structured?.formIntents) ? structured.formIntents.map(normalizeFormIntent).filter(Boolean) : [];
  const normalizedIntents = [];

  for (const intent of intents) {
    const warnings = [];
    let normalizedFields = null;
    if (intent.target === "ruleDraft") {
      normalizedFields = normalizeRuleDraft(intent.fields, warnings);
    } else if (intent.target === "screenerPreset") {
      normalizedFields = normalizeScreenerPreset(intent.fields, warnings);
    } else if (intent.target === "financialPreset") {
      normalizedFields = normalizeFinancialPreset(intent.fields, warnings);
    } else {
      continue;
    }

    normalizedIntents.push({
      target: intent.target,
      mode: intent.mode,
      reason: intent.reason,
      warnings,
      fields: normalizedFields
    });
  }

  return {
    availableTargets: Array.from(new Set(normalizedIntents.map((intent) => intent.target))),
    intents: normalizedIntents
  };
}
