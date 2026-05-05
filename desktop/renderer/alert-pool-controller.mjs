function buildFmpCandidatePoolRule(symbols) {
  return {
    enabled: true,
    name: "默认规则候选股票池",
    symbols,
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
    },
    universe: { type: "manual" }
  };
}

export function createAlertPoolController({
  el,
  state,
  appendLog,
  syncAdvancedJSON,
  renderRulesList
}) {
  async function addSymbolsToAlertPool(symbols, options = {}) {
    const incoming = Array.from(new Set((symbols || []).map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean)));
    if (incoming.length === 0) {
      appendLog("没有可加入提醒池的标的");
      return;
    }

    const isFmp = Boolean(options.forceFmp) || String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";
    const poolName = isFmp ? "默认规则候选股票池" : "候选股票池";
    const existingIndex = state.rules.findIndex((rule) => String(rule?.name || "") === poolName);
    const nextRule = existingIndex >= 0
      ? JSON.parse(JSON.stringify(state.rules[existingIndex]))
      : (isFmp ? buildFmpCandidatePoolRule([]) : null);

    if (!nextRule) {
      appendLog("当前仅在 FMP 模式下提供一键加入提醒池");
      return;
    }

    const mergedSymbols = Array.from(new Set([...(nextRule.symbols || []), ...incoming]));
    nextRule.symbols = mergedSymbols;

    if (existingIndex >= 0) state.rules[existingIndex] = nextRule;
    else state.rules.unshift(nextRule);

    await window.api.saveRules(state.rules);
    syncAdvancedJSON();
    renderRulesList();
    appendLog(`已加入提醒池：新增 ${incoming.length} 个，当前池内共 ${mergedSymbols.length} 个`);
  }

  return {
    addSymbolsToAlertPool
  };
}
