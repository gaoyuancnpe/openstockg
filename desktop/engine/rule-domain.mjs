import { toNumber } from "../shared-runtime.mjs";
import { nowMs, stableStringify } from "./shared.mjs";

const PROFIT_GROWTH_FALLBACK_CHAIN = [
  { field: "netIncomeGrowthYoY", label: "GAAP净利润同比" },
  { field: "operatingIncomeGrowthYoY", label: "营业利润同比" },
  { field: "ebitdaGrowthYoY", label: "EBITDA同比" }
];

const PROFIT_GROWTH_ALIASES = new Set([
  "profitGrowthYoY",
  "profitGrowthRateYoY"
]);

const OPERATING_OUTLOOK_PROXY_ALIASES = new Set([
  "operatingOutlookImprovedProxy",
  "operatingOutlookImproved",
  "operatingOutlookProxySignal",
  "guidanceImprovedProxySignal"
]);

const FMP_SUPPORTED_VARS = new Set([
  "marketCap",
  "turnoverM",
  "amv",
  "market0amv",
  "market0amvSp500",
  "market0amvNasdaq",
  "activeChips",
  "recent5dCloseAth",
  "closeAth250d",
  "closeChangePercent1d",
  "earningsWithin1TradingDay",
  "revenueGrowthYoY",
  "revenueGrowthYoYPrevQuarter",
  "revenueGrowthYoYDeltaVsPrevQuarter",
  "grossMargin",
  "grossMarginYoYDelta",
  "grossMarginQoQDelta",
  "ebitda",
  "ebitdaM",
  "ebitdaGrowthYoY",
  "operatingIncome",
  "operatingIncomeGrowthYoY",
  "netIncome",
  "netIncomeGrowthYoY",
  ...PROFIT_GROWTH_ALIASES,
  ...OPERATING_OUTLOOK_PROXY_ALIASES
]);

const FIELD_LABELS = {
  price: "价格",
  marketCap: "收盘市值",
  turnoverM: "成交额",
  amv: "活筹市值",
  market0amv: "全市场 0AMV",
  market0amvSp500: "全市场 0AMV(S&P500)",
  market0amvNasdaq: "全市场 0AMV(Nasdaq)",
  activeChips: "活筹",
  recent5dCloseAth: "五日股价新高",
  closeAth250d: "250日收盘新高",
  closeChangePercent1d: "单日涨幅",
  earningsWithin1TradingDay: "财报时间为当日或上一个交易日",
  revenueGrowthYoY: "营收同比",
  revenueGrowthYoYPrevQuarter: "上季营收同比",
  revenueGrowthYoYDeltaVsPrevQuarter: "营收增速较上季度变化",
  grossMargin: "毛利率",
  grossMarginYoYDelta: "毛利率同比变化",
  grossMarginQoQDelta: "毛利率环比变化",
  ebitda: "EBITDA",
  ebitdaM: "EBITDA(百万美元)",
  ebitdaGrowthYoY: "EBITDA同比",
  operatingIncome: "营业利润",
  operatingIncomeGrowthYoY: "营业利润同比",
  netIncome: "GAAP净利润",
  netIncomeGrowthYoY: "GAAP净利润同比",
  profitGrowthYoY: "利润增速同比",
  profitGrowthRateYoY: "利润增速同比",
  operatingOutlookImprovedProxy: "经营展望改善",
  operatingOutlookImproved: "经营展望改善",
  operatingOutlookProxySignal: "经营展望改善",
  guidanceImprovedProxySignal: "经营展望改善"
};

const VALUE_COMPARISON_OPS = new Set([
  ">",
  ">=",
  "<",
  "<=",
  "==",
  "!=",
  "crossesAbove",
  "crossesBelow"
]);

export function buildRuleKey(rule) {
  const name = rule.name ? String(rule.name) : "";
  const condition = rule.condition ? stableStringify(rule.condition) : "";
  const symbols = Array.isArray(rule.symbols) ? rule.symbols.map(String).sort().join(",") : "";
  return stableStringify({ name, symbols, condition });
}

export function stateKey(ruleKey, symbol) {
  return `${ruleKey}:${symbol}`;
}

function toRuleNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}

function pushAdoptedField(collector, item) {
  if (!collector) return;
  const key = `${item.field}:${item.adoptedField}:${item.kind}`;
  if (!collector.has(key)) collector.set(key, item);
}

function getFieldMeta(ctx, field) {
  if (!ctx?.fieldMeta || typeof ctx.fieldMeta !== "object") return null;
  return ctx.fieldMeta[field] && typeof ctx.fieldMeta[field] === "object" ? ctx.fieldMeta[field] : null;
}

function getFieldLabel(field) {
  const name = String(field || "");
  return FIELD_LABELS[name] || name;
}

function formatRuleValue(value) {
  if (value === null || value === undefined || value === "") return "缺失";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function formatMetaSummary(meta) {
  if (!meta || typeof meta !== "object") return "";
  const parts = [];
  if (meta.source) parts.push(`来源=${meta.source}`);
  if (meta.reason) parts.push(`原因=${meta.reason}`);
  if (meta.currentQuarterDate) parts.push(`当前季度=${meta.currentQuarterDate}`);
  if (meta.compareQuarterDate) parts.push(`对比季度=${meta.compareQuarterDate}`);
  if (meta.previousQuarterDate) parts.push(`上季度=${meta.previousQuarterDate}`);
  if (meta.reportDate) parts.push(`报告期=${meta.reportDate}`);
  if (meta.latestTradingDate) parts.push(`最新交易日=${meta.latestTradingDate}`);
  if (meta.previousTradingDate) parts.push(`上个交易日=${meta.previousTradingDate}`);
  if (meta.lookbackTradingDays) parts.push(`回看=${meta.lookbackTradingDays}日`);
  return parts.join("，");
}

function findAdoptedField(collector, field) {
  if (!collector) return null;
  for (const item of collector.values()) {
    if (item?.field === field) return item;
  }
  return null;
}

function formatAdoptedFieldDetail(item) {
  if (!item || typeof item !== "object") return "";
  const requested = item.requestedLabel || getFieldLabel(item.field);
  const adopted = item.adoptedLabel || getFieldLabel(item.adoptedField);
  const suffix = item.kind === "fallback" ? "（回退）" : (item.kind === "proxy" ? "（代理）" : "");
  const parts = [`${requested} -> ${adopted}${suffix}`];
  if (item.value !== null && item.value !== undefined) parts.push(`值=${formatRuleValue(item.value)}`);
  if (item.source) parts.push(`来源=${item.source}`);
  if (Array.isArray(item.components) && item.components.length > 0) {
    parts.push(`明细=${item.components.join("；")}`);
  }
  return parts.join("，");
}

function buildMissingDetail({ label, adopted, meta, prev }) {
  const parts = [prev ? `${label}缺少前值` : `${label}缺失`];
  if (adopted) {
    parts.push(`实际口径=${adopted.adoptedLabel || getFieldLabel(adopted.adoptedField)}`);
    if (adopted.kind === "fallback") parts.push("类型=回退");
    if (adopted.kind === "proxy") parts.push("类型=代理");
    if (Array.isArray(adopted.components) && adopted.components.length > 0) {
      parts.push(`代理明细=${adopted.components.join("；")}`);
    }
  }
  const metaSummary = formatMetaSummary(meta);
  if (metaSummary) parts.push(metaSummary);
  return parts.join("，");
}

function resolveProfitGrowthValue(field, ctx, collector) {
  for (const [index, candidate] of PROFIT_GROWTH_FALLBACK_CHAIN.entries()) {
    const value = toRuleNumber(ctx?.[candidate.field]);
    if (value === null) continue;
    const meta = getFieldMeta(ctx, candidate.field);
    pushAdoptedField(collector, {
      field,
      requestedLabel: "利润增速同比",
      adoptedField: candidate.field,
      adoptedLabel: candidate.label,
      kind: index === 0 ? "exact" : "fallback",
      source: meta?.source || null,
      value
    });
    return value;
  }
  return null;
}

function buildOperatingOutlookComponents(ctx) {
  const revenueGrowthYoY = toRuleNumber(ctx?.revenueGrowthYoY);
  const revenueGrowthYoYPrevQuarter = toRuleNumber(ctx?.revenueGrowthYoYPrevQuarter);
  const grossMarginYoYDelta = toRuleNumber(ctx?.grossMarginYoYDelta);
  const grossMarginQoQDelta = toRuleNumber(ctx?.grossMarginQoQDelta);
  const ebitdaGrowthYoY = toRuleNumber(ctx?.ebitdaGrowthYoY);

  const revenueRecovered = revenueGrowthYoY !== null && revenueGrowthYoYPrevQuarter !== null
    ? revenueGrowthYoY >= 15 && revenueGrowthYoYPrevQuarter < 10
    : null;
  const grossMarginImproved = grossMarginYoYDelta !== null || grossMarginQoQDelta !== null
    ? ((grossMarginYoYDelta !== null && grossMarginYoYDelta >= 1) || (grossMarginQoQDelta !== null && grossMarginQoQDelta >= 1))
    : null;
  const ebitdaImproved = ebitdaGrowthYoY !== null ? ebitdaGrowthYoY > 0 : null;

  return [
    {
      key: "revenueRecovery",
      label: "收入增速显著回升",
      matched: revenueRecovered,
      detail: revenueGrowthYoY !== null && revenueGrowthYoYPrevQuarter !== null
        ? `本季 ${revenueGrowthYoY.toFixed(1)}%，上季 ${revenueGrowthYoYPrevQuarter.toFixed(1)}%`
        : "缺少收入增速序列"
    },
    {
      key: "grossMarginImprovement",
      label: "毛利率改善",
      matched: grossMarginImproved,
      detail: grossMarginYoYDelta !== null || grossMarginQoQDelta !== null
        ? `YoY ${grossMarginYoYDelta !== null ? `${grossMarginYoYDelta.toFixed(1)}pct` : "NA"}，QoQ ${grossMarginQoQDelta !== null ? `${grossMarginQoQDelta.toFixed(1)}pct` : "NA"}`
        : "缺少毛利率改善数据"
    },
    {
      key: "ebitdaImprovement",
      label: "EBITDA改善",
      matched: ebitdaImproved,
      detail: ebitdaGrowthYoY !== null ? `同比 ${ebitdaGrowthYoY.toFixed(1)}%` : "缺少 EBITDA 同比数据"
    }
  ];
}

function resolveOperatingOutlookProxyValue(field, ctx, collector) {
  const components = buildOperatingOutlookComponents(ctx);
  const hasMissingComponent = components.some((item) => item.matched === null);
  const value = hasMissingComponent ? null : (components.every((item) => item.matched === true) ? 1 : 0);
  pushAdoptedField(collector, {
    field,
    requestedLabel: "经营展望改善",
    adoptedField: "operatingOutlookImprovedProxy",
    adoptedLabel: "经营展望改善代理信号",
    kind: "proxy",
    value,
    components: components.map((item) => `${item.label}=${item.matched === null ? "缺失" : (item.matched ? "是" : "否")}（${item.detail}）`)
  });
  return value;
}

function resolveValue(field, ctx, collector) {
  const name = String(field || "");
  if (PROFIT_GROWTH_ALIASES.has(name)) {
    return resolveProfitGrowthValue(name, ctx, collector);
  }
  if (OPERATING_OUTLOOK_PROXY_ALIASES.has(name)) {
    return resolveOperatingOutlookProxyValue(name, ctx, collector);
  }
  return ctx?.[name];
}

function describeOperand(node, ctx, prevCtx, collector) {
  if (node?.var) {
    const field = String(node.var);
    const value = resolveValue(field, ctx, collector);
    const adopted = findAdoptedField(collector, field);
    const label = adopted?.requestedLabel || getFieldLabel(field);
    const actualField = adopted?.adoptedField || field;
    const meta = getFieldMeta(ctx, actualField) || getFieldMeta(ctx, field);
    return {
      kind: "field",
      value,
      label,
      display: `${label}=${formatRuleValue(value)}`,
      missingDetail: value === null ? buildMissingDetail({ label, adopted, meta, prev: false }) : "",
      adopted
    };
  }
  if (node?.prev?.var) {
    const field = String(node.prev.var);
    const label = `前值${getFieldLabel(field)}`;
    const value = prevCtx ? prevCtx[field] : null;
    const meta = prevCtx ? getFieldMeta(prevCtx, field) : null;
    return {
      kind: "prevField",
      value,
      label,
      display: `${label}=${formatRuleValue(value)}`,
      missingDetail: value === null ? buildMissingDetail({ label, meta, prev: true }) : "",
      adopted: null
    };
  }
  const value = evaluate(node, ctx, prevCtx, collector);
  return {
    kind: "expr",
    value,
    label: summarizeCondition(node),
    display: formatRuleValue(value),
    missingDetail: value === null ? `${summarizeCondition(node)} 缺失` : "",
    adopted: null
  };
}

function compareValues(op, leftValue, rightValue) {
  if (op === "crossesAbove" || op === "crossesBelow") return null;
  const ln = toRuleNumber(leftValue);
  const rn = toRuleNumber(rightValue);
  if (ln === null || rn === null) return false;
  if (op === ">") return ln > rn;
  if (op === ">=") return ln >= rn;
  if (op === "<") return ln < rn;
  if (op === "<=") return ln <= rn;
  if (op === "==") return ln === rn;
  if (op === "!=") return ln !== rn;
  return false;
}

function explainComparison(node, ctx, prevCtx, collector) {
  const left = describeOperand(node.left, ctx, prevCtx, collector);
  const right = describeOperand(node.right, ctx, prevCtx, collector);
  const passed = node.op === "crossesAbove" || node.op === "crossesBelow"
    ? Boolean(evaluate(node, ctx, prevCtx, collector))
    : compareValues(node.op, left.value, right.value);
  const missingDetails = [left.missingDetail, right.missingDetail].filter(Boolean);
  return {
    passed,
    summary: `${left.display} ${node.op} ${right.display}`,
    missingDetails
  };
}

function collectConditionEvidence(node, ctx, prevCtx, collector, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.op === "and" || node.op === "or") {
    for (const arg of Array.isArray(node.args) ? node.args : []) {
      collectConditionEvidence(arg, ctx, prevCtx, collector, out);
    }
    return out;
  }
  if (node.op === "not") {
    out.push({
      passed: Boolean(evaluate(node, ctx, prevCtx, collector)),
      summary: `NOT ${summarizeCondition(node.arg)}`,
      missingDetails: []
    });
    return out;
  }
  if (VALUE_COMPARISON_OPS.has(String(node.op || ""))) {
    out.push(explainComparison(node, ctx, prevCtx, collector));
    return out;
  }
  out.push({
    passed: Boolean(evaluate(node, ctx, prevCtx, collector)),
    summary: summarizeCondition(node),
    missingDetails: []
  });
  return out;
}

function buildEvaluationSummary({ condition, ctx, prevCtx, collector }) {
  const leafEvaluations = collectConditionEvidence(condition, ctx, prevCtx, collector, []);
  const missingFieldDetails = Array.from(
    new Set(leafEvaluations.flatMap((item) => item.missingDetails || []).filter(Boolean))
  );
  return {
    evidenceLines: leafEvaluations.filter((item) => item.passed).map((item) => item.summary),
    failedLines: leafEvaluations.filter((item) => !item.passed).map((item) => item.summary),
    missingFieldDetails,
    leafEvaluations
  };
}

export function evaluate(node, ctx, prevCtx, collector) {
  if (node === null || node === undefined) return null;
  if (typeof node === "number") return node;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;

  if (node.var) return resolveValue(node.var, ctx, collector);
  if (node.prev && node.prev.var) return prevCtx ? prevCtx[node.prev.var] : null;

  if (node.op) {
    const op = node.op;
    if (op === "and" || op === "or") {
      const args = Array.isArray(node.args) ? node.args : [];
      const vals = args.map((item) => Boolean(evaluate(item, ctx, prevCtx, collector)));
      return op === "and" ? vals.every(Boolean) : vals.some(Boolean);
    }
    if (op === "not") return !Boolean(evaluate(node.arg, ctx, prevCtx, collector));
    if (op === "crossesAbove" || op === "crossesBelow") {
      const leftNow = toRuleNumber(evaluate(node.left, ctx, prevCtx, collector));
      const rightNow = toRuleNumber(evaluate(node.right, ctx, prevCtx, collector));
      const leftPrev = prevCtx ? toRuleNumber(evaluate(node.left, prevCtx, null)) : null;
      const rightPrev = prevCtx ? toRuleNumber(evaluate(node.right, prevCtx, null)) : null;
      if (leftNow === null || rightNow === null || leftPrev === null || rightPrev === null) return false;
      if (op === "crossesAbove") return leftPrev <= rightPrev && leftNow > rightNow;
      return leftPrev >= rightPrev && leftNow < rightNow;
    }

    const ln = toRuleNumber(evaluate(node.left, ctx, prevCtx, collector));
    const rn = toRuleNumber(evaluate(node.right, ctx, prevCtx, collector));
    if (ln === null || rn === null) return false;
    if (op === ">") return ln > rn;
    if (op === ">=") return ln >= rn;
    if (op === "<") return ln < rn;
    if (op === "<=") return ln <= rn;
    if (op === "==") return ln === rn;
    if (op === "!=") return ln !== rn;
    return false;
  }

  return null;
}

export function summarizeCondition(node) {
  if (!node || typeof node !== "object") return String(node);
  if (node.var) return `{${node.var}}`;
  if (node.prev && node.prev.var) return `{prev.${node.prev.var}}`;
  if (node.op === "and" || node.op === "or") return `(${(node.args || []).map(summarizeCondition).join(node.op === "and" ? " AND " : " OR ")})`;
  if (node.op === "not") return `(NOT ${summarizeCondition(node.arg)})`;
  if (node.op) return `(${summarizeCondition(node.left)} ${node.op} ${summarizeCondition(node.right)})`;
  return stableStringify(node);
}

function collectVars(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.var) out.add(String(node.var));
  if (node.prev?.var) out.add(`prev.${String(node.prev.var)}`);
  if (Array.isArray(node.args)) {
    for (const arg of node.args) collectVars(arg, out);
  }
  if (node.left) collectVars(node.left, out);
  if (node.right) collectVars(node.right, out);
  if (node.arg) collectVars(node.arg, out);
  return out;
}

export function getFmpUnsupportedVars(rule) {
  const vars = Array.from(collectVars(rule?.condition));
  return vars.filter((name) => !FMP_SUPPORTED_VARS.has(name));
}

export function isFmpDefaultRuleCompatible(rule) {
  return getFmpUnsupportedVars(rule).length === 0;
}

export function formatAdoptedFieldSummary(adoptedFields) {
  if (!Array.isArray(adoptedFields) || adoptedFields.length === 0) return "";
  return adoptedFields
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const requested = item.requestedLabel || item.field || "字段";
      const adopted = item.adoptedLabel || item.adoptedField || "未知口径";
      if (item.kind === "fallback") return `${requested} -> ${adopted}（回退）`;
      if (item.kind === "proxy") return `${requested} -> ${adopted}（代理）`;
      return `${requested} -> ${adopted}`;
    })
    .filter(Boolean)
    .join("；");
}

export function formatAdoptedFieldDetails(adoptedFields) {
  if (!Array.isArray(adoptedFields) || adoptedFields.length === 0) return [];
  return adoptedFields.map(formatAdoptedFieldDetail).filter(Boolean);
}

export async function fireRuleAlert({
  rule,
  symbol,
  ctx,
  conditionText,
  dryRun,
  ignoreCooldown = false,
  state,
  ruleKey,
  cooldownSec,
  emitEvent,
  appendEventLine,
  notify,
  log
}) {
  const sk = stateKey(ruleKey, symbol);
  const prevCtx = state[sk]?.ctx || null;
  const lastFiredAt = state[sk]?.lastFiredAt ? Number(state[sk].lastFiredAt) : null;
  const cooldownBlocked = Boolean(lastFiredAt) && (nowMs() - lastFiredAt) < cooldownSec * 1000;
  const canFire = ignoreCooldown ? true : !cooldownBlocked;
  const adoptedFieldCollector = new Map();

  state[sk] = { ctx, lastFiredAt: lastFiredAt || null };

  const matched = Boolean(evaluate(rule.condition, ctx, prevCtx, adoptedFieldCollector));
  const adoptedFields = Array.from(adoptedFieldCollector.values());
  const evaluationSummary = buildEvaluationSummary({
    condition: rule.condition,
    ctx,
    prevCtx,
    collector: adoptedFieldCollector
  });
  if (!matched || !canFire) {
    if (log && matched && !canFire) {
      const evidenceText = evaluationSummary.evidenceLines.slice(0, 6).join("；");
      const adoptedSummary = formatAdoptedFieldSummary(adoptedFields);
      log(`MATCHED_COOLDOWN ${symbol} ${conditionText}${evidenceText ? ` | 命中依据: ${evidenceText}` : ""}${adoptedSummary ? ` | 采用口径: ${adoptedSummary}` : ""}`);
    }
    return { fired: false, matched, canFire, adoptedFields, evaluationSummary };
  }

  const event = {
    type: "alert",
    provider: String(rule.provider || ""),
    rule: { name: String(rule.name || ""), key: ruleKey, cooldownSec },
    symbol,
    conditionText,
    ctx,
    adoptedFields,
    evaluationSummary,
    matchedAt: new Date().toISOString()
  };
  if (ignoreCooldown && cooldownBlocked) {
    event.debug = {
      ignoreCooldown: true
    };
  }

  if (emitEvent) emitEvent(event);
  if (appendEventLine) await appendEventLine(event);
  if (notify) {
    await notify({
      event,
      rule,
      symbol,
      ctx,
      adoptedFields,
      evaluationSummary,
      conditionText,
      dryRun
    });
  }

  state[sk].lastFiredAt = nowMs();
  if (log) {
    const evidenceText = evaluationSummary.evidenceLines.slice(0, 6).join("；");
    const adoptedSummary = formatAdoptedFieldSummary(adoptedFields);
    const missingText = evaluationSummary.missingFieldDetails.slice(0, 3).join("；");
    log(`${dryRun ? "DRY_RUN FIRED" : "FIRED"} ${symbol} ${conditionText}${ignoreCooldown ? " | 调试模式=忽略冷却" : ""}${evidenceText ? ` | 命中依据: ${evidenceText}` : ""}${adoptedSummary ? ` | 采用口径: ${adoptedSummary}` : ""}${missingText ? ` | 缺字段: ${missingText}` : ""}`);
  }
  return { fired: true, matched, canFire, adoptedFields, evaluationSummary, event };
}
