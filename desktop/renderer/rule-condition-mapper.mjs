import { conditionFromUI, conditionTypeNeedsValue } from "../rules/rule-condition-shared.mjs";
export { conditionFromUI, conditionTypeNeedsValue } from "../rules/rule-condition-shared.mjs";

const PROFIT_GROWTH_UI_VARS = new Set([
  "profitGrowthYoY",
  "profitGrowthRateYoY"
]);

const OPERATING_OUTLOOK_PROXY_UI_VARS = new Set([
  "operatingOutlookImprovedProxy",
  "operatingOutlookImproved",
  "operatingOutlookProxySignal",
  "guidanceImprovedProxySignal"
]);

const DEFAULT_RULE_TEMPLATE_KEY = "fmp_default";

const FMP_TEMPLATE_OPTIONS = [
  { value: "fmp_default", label: "原始模板" },
  { value: "innovation_high", label: "创新高" },
  { value: "earnings_day_surge", label: "财报日大涨" },
  { value: "earnings_momentum_alert", label: "财报异动提醒" }
];

const RULE_TEMPLATE_META = {
  fmp_default: {
    label: "原始模板",
    presetHint: "默认模板：收盘市值 >= 100 亿美元 + 最近成交日成交额 >= 5 亿美元 + 5 个交易日内股价创历史新高。",
    fieldHint: "说明：这是最早的 FMP 默认规则模板，适合先验证默认候选池、执行链路和邮件通知是否跑通。"
  },
  innovation_high: {
    label: "创新高",
    presetHint: "默认模板：250 个交易日收盘新高 + 成交额 >= 1 亿美元 + 收盘市值 >= 20 亿美元 + 当季收入增速 >= 15% + 当季 EBITDA > 2000 万美元 + 利润增速同比 >= 15%。",
    fieldHint: "说明：`利润增速同比` 优先使用 GAAP 净利润同比；缺失时按“营业利润同比 -> EBITDA 同比”回退，并在命中结果中展示实际采用口径。"
  },
  earnings_day_surge: {
    label: "财报日大涨",
    presetHint: "默认模板：财报时间为当日或上一个交易日 + 收盘涨幅 >= 8% + 成交额 >= 1 亿美元 + 收盘市值 >= 20 亿美元 + 当季收入增速 >= 10% + 当季 EBITDA > 0。",
    fieldHint: "说明：`财报时间为当日或上一个交易日` 基于最近两个交易日窗口判断，适合捕捉财报披露后的单日放量上涨。"
  },
  earnings_momentum_alert: {
    label: "财报异动提醒",
    presetHint: "默认模板：经营展望改善（代理信号） + 收入增速较上季度提升 >= 5pct + 成交额 >= 1 亿美元 + 收盘市值 >= 20 亿美元。",
    fieldHint: "说明：`经营展望改善（代理信号）` 由“收入增速显著回升 + 毛利率改善 + EBITDA 改善”组合判断，会在命中结果中明确标记为代理信号而非原始管理层指引。"
  },
  custom: {
    label: "自定义",
    presetHint: "自定义规则：按当前条件自由调整模板、阈值和标的范围。",
    fieldHint: "说明：若条件里使用 `利润增速同比` 或 `经营展望改善（代理信号）`，系统仍会在执行日志和通知中明确展示回退口径或代理说明。"
  }
};

const FMP_CONDITION_TYPES = new Set([
  "market_cap_above",
  "turnover_m_above",
  "active_chips_above",
  "amv_above",
  "market_0amv_above",
  "recent_5d_close_ath",
  "close_ath_250d",
  "close_change_percent_1d_above",
  "earnings_within_1_trading_day",
  "revenue_growth_yoy_above",
  "ebitda_m_above",
  "profit_growth_yoy_above",
  "revenue_growth_yoy_delta_vs_prev_quarter_above",
  "operating_outlook_improved_proxy"
]);

export const RULE_TEMPLATE_OPTIONS = [
  ...FMP_TEMPLATE_OPTIONS,
  { value: "custom", label: "自定义" }
];

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
  { value: "market_cap_above", label: "收盘市值 ≥ (百万美元)" },
  { value: "turnover_m_above", label: "最近成交日成交额 ≥ (百万美元)" },
  { value: "active_chips_above", label: "活筹 ActiveChips ≥ (百万股)" },
  { value: "amv_above", label: "活筹市值 AMV ≥ (百万美元)" },
  { value: "market_0amv_above", label: "全市场 0AMV ≥ (百万美元)" },
  { value: "recent_5d_close_ath", label: "5 个交易日内股价创历史新高" },
  { value: "close_ath_250d", label: "250 个交易日收盘新高" },
  { value: "close_change_percent_1d_above", label: "最近成交日收盘涨幅 ≥ (%)" },
  { value: "earnings_within_1_trading_day", label: "财报时间为当日或上一个交易日" },
  { value: "revenue_growth_yoy_above", label: "当季收入增速同比 ≥ (%)" },
  { value: "ebitda_m_above", label: "当季 EBITDA ≥ (百万美元)" },
  { value: "profit_growth_yoy_above", label: "利润增速同比 ≥ (%)" },
  { value: "revenue_growth_yoy_delta_vs_prev_quarter_above", label: "收入增速较上季度提升 ≥ (pct)" },
  { value: "operating_outlook_improved_proxy", label: "经营展望改善（代理信号）" }
];

function cloneRuleSeed(rule) {
  return JSON.parse(JSON.stringify(rule));
}

function buildFmpDefaultTemplateRuleSeed() {
  return {
    templateKey: "fmp_default",
    enabled: true,
    name: "原始模板：百亿市值 + 五亿成交额 + 5日股价新高",
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

function buildInnovationHighRuleSeed() {
  return {
    templateKey: "innovation_high",
    enabled: true,
    name: "创新高：250日收盘新高 + 基本面共振",
    symbols: [],
    universe: {
      type: "us_all",
      maxScan: 2000,
      minPrice: null,
      minMarketCap: 2000,
      minTurnoverM: 100,
      requireRecent5dCloseAth: false,
      minVolumeRatio: null
    },
    cooldownSec: 86400,
    notify: {},
    ui: {
      groupOp: "and",
      items: [
        { type: "close_ath_250d", value: null },
        { type: "turnover_m_above", value: 100 },
        { type: "market_cap_above", value: 2000 },
        { type: "revenue_growth_yoy_above", value: 15 },
        { type: "ebitda_m_above", value: 20 },
        { type: "profit_growth_yoy_above", value: 15 }
      ]
    },
    condition: {
      op: "and",
      args: [
        { op: ">=", left: { var: "closeAth250d" }, right: 1 },
        { op: ">=", left: { var: "turnoverM" }, right: 100 },
        { op: ">=", left: { var: "marketCap" }, right: 2000 },
        { op: ">=", left: { var: "revenueGrowthYoY" }, right: 15 },
        { op: ">=", left: { var: "ebitdaM" }, right: 20 },
        { op: ">=", left: { var: "profitGrowthYoY" }, right: 15 }
      ]
    }
  };
}

function buildEarningsDaySurgeRuleSeed() {
  return {
    templateKey: "earnings_day_surge",
    enabled: true,
    name: "财报日大涨：财报窗口 + 单日涨幅确认",
    symbols: [],
    universe: {
      type: "us_all",
      maxScan: 2000,
      minPrice: null,
      minMarketCap: 2000,
      minTurnoverM: 100,
      requireRecent5dCloseAth: false,
      minVolumeRatio: null
    },
    cooldownSec: 86400,
    notify: {},
    ui: {
      groupOp: "and",
      items: [
        { type: "earnings_within_1_trading_day", value: null },
        { type: "close_change_percent_1d_above", value: 8 },
        { type: "turnover_m_above", value: 100 },
        { type: "market_cap_above", value: 2000 },
        { type: "revenue_growth_yoy_above", value: 10 },
        { type: "ebitda_m_above", value: 0.01 }
      ]
    },
    condition: {
      op: "and",
      args: [
        { op: ">=", left: { var: "earningsWithin1TradingDay" }, right: 1 },
        { op: ">=", left: { var: "closeChangePercent1d" }, right: 8 },
        { op: ">=", left: { var: "turnoverM" }, right: 100 },
        { op: ">=", left: { var: "marketCap" }, right: 2000 },
        { op: ">=", left: { var: "revenueGrowthYoY" }, right: 10 },
        { op: ">=", left: { var: "ebitdaM" }, right: 0.01 }
      ]
    }
  };
}

function buildEarningsMomentumAlertRuleSeed() {
  return {
    templateKey: "earnings_momentum_alert",
    enabled: true,
    name: "财报异动提醒：增速加速 + 经营展望代理",
    symbols: [],
    universe: {
      type: "us_all",
      maxScan: 2000,
      minPrice: null,
      minMarketCap: 2000,
      minTurnoverM: 100,
      requireRecent5dCloseAth: false,
      minVolumeRatio: null
    },
    cooldownSec: 86400,
    notify: {},
    ui: {
      groupOp: "and",
      items: [
        { type: "operating_outlook_improved_proxy", value: null },
        { type: "revenue_growth_yoy_delta_vs_prev_quarter_above", value: 5 },
        { type: "turnover_m_above", value: 100 },
        { type: "market_cap_above", value: 2000 }
      ]
    },
    condition: {
      op: "and",
      args: [
        { op: ">=", left: { var: "operatingOutlookImprovedProxy" }, right: 1 },
        { op: ">=", left: { var: "revenueGrowthYoYDeltaVsPrevQuarter" }, right: 5 },
        { op: ">=", left: { var: "turnoverM" }, right: 100 },
        { op: ">=", left: { var: "marketCap" }, right: 2000 }
      ]
    }
  };
}

const TEMPLATE_BUILDERS = {
  fmp_default: buildFmpDefaultTemplateRuleSeed,
  innovation_high: buildInnovationHighRuleSeed,
  earnings_day_surge: buildEarningsDaySurgeRuleSeed,
  earnings_momentum_alert: buildEarningsMomentumAlertRuleSeed
};

export function buildRuleSeedFromTemplate(templateKey = DEFAULT_RULE_TEMPLATE_KEY) {
  const builder = TEMPLATE_BUILDERS[templateKey] || TEMPLATE_BUILDERS[DEFAULT_RULE_TEMPLATE_KEY];
  return cloneRuleSeed(builder());
}

export function buildTemplateRules() {
  return FMP_TEMPLATE_OPTIONS.map((item) => buildRuleSeedFromTemplate(item.value));
}

export function getRuleTemplatePresentation(rule) {
  const templateKey = RULE_TEMPLATE_META[rule?.templateKey] ? String(rule.templateKey) : "custom";
  const meta = RULE_TEMPLATE_META[templateKey] || RULE_TEMPLATE_META.custom;
  return {
    templateKey,
    label: meta.label,
    presetHint: meta.presetHint,
    fieldHint: meta.fieldHint
  };
}

export function buildFmpDefaultRuleSeed() {
  return buildRuleSeedFromTemplate(DEFAULT_RULE_TEMPLATE_KEY);
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
  if (leftVar === "activeChips") return { type: "active_chips_above", value };
  if (leftVar === "amv") return { type: "amv_above", value };
  if (leftVar === "market0amv") return { type: "market_0amv_above", value };
  if (leftVar === "recent5dCloseAth") return { type: "recent_5d_close_ath", value: null };
  if (leftVar === "closeAth250d") return { type: "close_ath_250d", value: null };
  if (leftVar === "closeChangePercent1d") return { type: "close_change_percent_1d_above", value };
  if (leftVar === "earningsWithin1TradingDay") return { type: "earnings_within_1_trading_day", value: null };
  if (leftVar === "revenueGrowthYoY") return { type: "revenue_growth_yoy_above", value };
  if (leftVar === "ebitdaM") return { type: "ebitda_m_above", value };
  if (PROFIT_GROWTH_UI_VARS.has(leftVar)) return { type: "profit_growth_yoy_above", value };
  if (leftVar === "revenueGrowthYoYDeltaVsPrevQuarter") {
    return { type: "revenue_growth_yoy_delta_vs_prev_quarter_above", value };
  }
  if (OPERATING_OUTLOOK_PROXY_UI_VARS.has(leftVar)) {
    return { type: "operating_outlook_improved_proxy", value: null };
  }

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
    (rule?.templateKey && rule.templateKey !== "custom") ||
    rule?.ui?.items?.some((it) => FMP_CONDITION_TYPES.has(String(it?.type || ""))) ||
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
  if (type === "market_cap_above") return `收盘市值 ≥ ${value} 百万美元`;
  if (type === "active_chips_above") return `活筹 ActiveChips ≥ ${value} 百万股`;
  if (type === "amv_above") return `活筹市值 AMV ≥ ${value} 百万美元`;
  if (type === "market_0amv_above") return `全市场 0AMV ≥ ${value} 百万美元`;
  if (type === "turnover_m_above") return `最近成交日成交额 ≥ ${value} 百万美元`;
  if (type === "recent_5d_close_ath") return "5 个交易日内股价创历史新高";
  if (type === "close_ath_250d") return "250 个交易日收盘新高";
  if (type === "close_change_percent_1d_above") return `最近成交日收盘涨幅 ≥ ${value}%`;
  if (type === "earnings_within_1_trading_day") return "财报时间为当日或上一个交易日";
  if (type === "revenue_growth_yoy_above") return `当季收入增速同比 ≥ ${value}%`;
  if (type === "ebitda_m_above") return `当季 EBITDA ≥ ${value} 百万美元`;
  if (type === "profit_growth_yoy_above") return `利润增速同比 ≥ ${value}%`;
  if (type === "revenue_growth_yoy_delta_vs_prev_quarter_above") return `收入增速较上季度提升 ≥ ${value}pct`;
  if (type === "operating_outlook_improved_proxy") return "经营展望改善（代理信号）";
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
