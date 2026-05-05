export const CONDITION_TYPE_OPTIONS = [
  { value: "price_above", label: "价格 ≥" },
  { value: "price_below", label: "价格 ≤" },
  { value: "change_above", label: "涨跌幅 ≥ (%)" },
  { value: "change_below", label: "涨跌幅 ≤ (%)" },
  { value: "cross_above_sma20", label: "上穿 SMA20" },
  { value: "cross_below_sma20", label: "下穿 SMA20" },
  { value: "rsi_above", label: "RSI14 >" },
  { value: "rsi_below", label: "RSI14 <" },
  { value: "volume_ratio_above", label: "成交量放大 ≥ (倍)" },
  { value: "market_cap_above", label: "市值 ≥ (百万美元)" },
  { value: "turnover_m_above", label: "最近成交日成交额 ≥ (百万美元)" },
  { value: "recent_5d_close_ath", label: "5个交易日内股价创历史新高" }
];

export function buildFmpDefaultRuleSeed() {
  return {
    enabled: true,
    name: "强势突破候选：百亿市值 + 5亿成交额 + 5日股价新高",
    symbols: [],
    universe: {
      type: "us_all",
      maxScan: 2000,
      minPrice: null,
      minMarketCap: 10000,
      minTurnoverM: 500,
      requireRecent5dCloseAth: true,
      minVolumeRatio: null
    },
    cooldownSec: 86400,
    notify: {},
    ui: {
      groupOp: "and",
      items: [
        { type: "market_cap_above", value: 10000 },
        { type: "turnover_m_above", value: 500 },
        { type: "recent_5d_close_ath", value: null }
      ]
    },
    condition: {
      op: "and",
      args: [
        { op: ">=", left: { var: "marketCap" }, right: 10000 },
        { op: ">=", left: { var: "turnoverM" }, right: 500 },
        { op: ">=", left: { var: "recent5dCloseAth" }, right: 1 }
      ]
    }
  };
}

export function conditionFromUI(type, value) {
  const v = Number(value);
  const num = Number.isFinite(v) ? v : 0;
  if (type === "price_above") return { op: ">=", left: { var: "price" }, right: num };
  if (type === "price_below") return { op: "<=", left: { var: "price" }, right: num };
  if (type === "change_above") return { op: ">=", left: { var: "changePercent" }, right: num };
  if (type === "change_below") return { op: "<=", left: { var: "changePercent" }, right: num };
  if (type === "cross_above_sma20") return { op: "crossesAbove", left: { var: "price" }, right: { var: "sma20" } };
  if (type === "cross_below_sma20") return { op: "crossesBelow", left: { var: "price" }, right: { var: "sma20" } };
  if (type === "rsi_above") return { op: ">", left: { var: "rsi14" }, right: num };
  if (type === "rsi_below") return { op: "<", left: { var: "rsi14" }, right: num };
  if (type === "volume_ratio_above") return { op: ">=", left: { var: "volumeRatio" }, right: num };
  if (type === "market_cap_above") return { op: ">=", left: { var: "marketCap" }, right: num };
  if (type === "turnover_m_above") return { op: ">=", left: { var: "turnoverM" }, right: num };
  if (type === "recent_5d_close_ath") return { op: ">=", left: { var: "recent5dCloseAth" }, right: 1 };
  return { op: ">=", left: { var: "price" }, right: num };
}

export function conditionTypeNeedsValue(type) {
  const normalizedType = String(type || "");
  return !(
    normalizedType === "cross_above_sma20" ||
    normalizedType === "cross_below_sma20" ||
    normalizedType === "recent_5d_close_ath"
  );
}

export function defaultConditionItem(isFmpProvider) {
  if (isFmpProvider) {
    return { type: "market_cap_above", value: 10000 };
  }
  return { type: "price_above", value: 100 };
}

function uiItemFromCondition(cond) {
  if (!cond || typeof cond !== "object") return null;
  const op = String(cond.op || "");

  if (op === "crossesAbove" || op === "crossesBelow") {
    const leftVar = cond.left?.var;
    const rightVar = cond.right?.var;
    if (leftVar === "price" && rightVar === "sma20") {
      return { type: op === "crossesAbove" ? "cross_above_sma20" : "cross_below_sma20", value: null };
    }
    return null;
  }

  const leftVar = cond.left?.var;
  const right = cond.right;
  const value = typeof right === "number" ? right : Number(right);
  if (!Number.isFinite(value)) return null;

  if (leftVar === "price") return { type: op === "<" || op === "<=" ? "price_below" : "price_above", value };
  if (leftVar === "changePercent") return { type: op === "<" || op === "<=" ? "change_below" : "change_above", value };
  if (leftVar === "rsi14") return { type: op === "<" || op === "<=" ? "rsi_below" : "rsi_above", value };
  if (leftVar === "volumeRatio") return { type: "volume_ratio_above", value };
  if (leftVar === "marketCap") return { type: "market_cap_above", value };
  if (leftVar === "turnoverM") return { type: "turnover_m_above", value };
  if (leftVar === "recent5dCloseAth") return { type: "recent_5d_close_ath", value: null };

  return null;
}

export function uiGroupFromConditionTree(condition, fallbackItem = defaultConditionItem(false)) {
  if (!condition || typeof condition !== "object") {
    return { groupOp: "and", items: [fallbackItem] };
  }

  const op = String(condition.op || "");
  if ((op === "and" || op === "or") && Array.isArray(condition.args)) {
    const items = condition.args.map(uiItemFromCondition).filter(Boolean);
    return { groupOp: op, items: items.length > 0 ? items : [fallbackItem] };
  }

  const single = uiItemFromCondition(condition);
  return { groupOp: "and", items: single ? [single] : [fallbackItem] };
}

export function usesFmpRuleFields(rule) {
  return Boolean(
    rule?.ui?.items?.some((it) => it?.type === "turnover_m_above" || it?.type === "recent_5d_close_ath") ||
    rule?.universe?.minTurnoverM !== undefined ||
    rule?.universe?.requireRecent5dCloseAth !== undefined
  );
}

export function summarizeConditionItem(item) {
  const type = String(item?.type || "");
  const value = item?.value;
  if (type === "price_above") return `价格 ≥ ${value}`;
  if (type === "price_below") return `价格 ≤ ${value}`;
  if (type === "change_above") return `涨跌幅 ≥ ${value}%`;
  if (type === "change_below") return `涨跌幅 ≤ ${value}%`;
  if (type === "cross_above_sma20") return "上穿 SMA20";
  if (type === "cross_below_sma20") return "下穿 SMA20";
  if (type === "rsi_above") return `RSI14 > ${value}`;
  if (type === "rsi_below") return `RSI14 < ${value}`;
  if (type === "volume_ratio_above") return `成交量放大 ≥ ${value} 倍`;
  if (type === "market_cap_above") return `市值 ≥ ${value} 百万美元`;
  if (type === "turnover_m_above") return `最近成交日成交额 ≥ ${value} 百万美元`;
  if (type === "recent_5d_close_ath") return "5个交易日内股价创历史新高";
  return "自定义条件";
}

export function summarizeRule(rule) {
  const ui = rule.ui || {};
  const items = Array.isArray(ui.items) ? ui.items : null;
  if (items && items.length > 0) {
    const joiner = String(ui.groupOp || "and").toLowerCase() === "or" ? " 或 " : " 且 ";
    const parts = items.map(summarizeConditionItem).filter(Boolean);
    return parts.length <= 1 ? (parts[0] || "自定义条件") : parts.join(joiner);
  }
  return summarizeConditionItem(ui);
}
