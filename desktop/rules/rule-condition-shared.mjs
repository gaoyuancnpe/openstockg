export function conditionFromUI(type, value) {
  const v = Number(value);
  const num = Number.isFinite(v) ? v : 0;
  if (type === "active_chips_above") return { op: ">=", left: { var: "activeChips" }, right: num };
  if (type === "amv_above") return { op: ">=", left: { var: "amv" }, right: num };
  if (type === "market_0amv_above") return { op: ">=", left: { var: "market0amv" }, right: num };
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
  if (type === "close_ath_250d") return { op: ">=", left: { var: "closeAth250d" }, right: 1 };
  if (type === "close_change_percent_1d_above") return { op: ">=", left: { var: "closeChangePercent1d" }, right: num };
  if (type === "earnings_within_1_trading_day") return { op: ">=", left: { var: "earningsWithin1TradingDay" }, right: 1 };
  if (type === "revenue_growth_yoy_above") return { op: ">=", left: { var: "revenueGrowthYoY" }, right: num };
  if (type === "ebitda_m_above") return { op: ">=", left: { var: "ebitdaM" }, right: num };
  if (type === "profit_growth_yoy_above") return { op: ">=", left: { var: "profitGrowthYoY" }, right: num };
  if (type === "revenue_growth_yoy_delta_vs_prev_quarter_above") return { op: ">=", left: { var: "revenueGrowthYoYDeltaVsPrevQuarter" }, right: num };
  if (type === "operating_outlook_improved_proxy") return { op: ">=", left: { var: "operatingOutlookImprovedProxy" }, right: 1 };
  return { op: ">=", left: { var: "price" }, right: num };
}

export function conditionTypeNeedsValue(type) {
  const normalizedType = String(type || "");
  return !(
    normalizedType === "cross_above_sma20" ||
    normalizedType === "cross_below_sma20" ||
    normalizedType === "recent_5d_close_ath" ||
    normalizedType === "close_ath_250d" ||
    normalizedType === "earnings_within_1_trading_day" ||
    normalizedType === "operating_outlook_improved_proxy"
  );
}
