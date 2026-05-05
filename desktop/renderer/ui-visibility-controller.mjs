export function createUiVisibilityController({ el, state, getIsFmpProvider }) {
  function updateUniverseUI() {
    const universeType = String(el.ruleUniverse.value || "manual");
    const isManual = universeType === "manual";
    const isFmp = Boolean(state.modalForceFmp) || Boolean(getIsFmpProvider());

    el.rowRuleSymbols.classList.toggle("hidden", !isManual);
    el.rowRuleUniverseMaxScan.classList.toggle("hidden", isManual);
    el.rowRuleUniverseMinPrice.classList.toggle("hidden", isManual);
    el.rowRuleUniverseMinMarketCap.classList.toggle("hidden", isManual);
    el.rowRuleUniverseMinTurnoverM.classList.toggle("hidden", isManual || !isFmp);
    el.rowRuleUniverseRecent5dCloseAth.classList.toggle("hidden", isManual || !isFmp);
    el.rowRuleUniverseMinVolumeRatio.classList.toggle("hidden", isManual || isFmp);
    if (el.rulePresetHint) {
      el.rulePresetHint.classList.toggle("hidden", !isFmp);
    }
  }

  function getEstimatedFmpWorkload() {
    const maxScan = Number.parseInt(String(el.scrMaxScan.value || "500"), 10);
    const scanCount = Number.isFinite(maxScan) ? maxScan : 500;
    const firstRunRequests = 1 + scanCount * 2;
    const warmRunRequests = 1 + Math.ceil(scanCount * 0.1) * 2;
    const lowMinutes = Math.max(1, Math.round((scanCount / 200) * 8));
    const highMinutes = Math.max(lowMinutes + 1, Math.round((scanCount / 200) * 18));
    return { scanCount, firstRunRequests, warmRunRequests, lowMinutes, highMinutes };
  }

  function updateScreenerEstimate() {
    if (!el.scrEstimate) return;
    if (!getIsFmpProvider()) {
      el.scrEstimate.textContent = "";
      return;
    }

    const { scanCount, firstRunRequests, warmRunRequests, lowMinutes, highMinutes } = getEstimatedFmpWorkload();
    el.scrEstimate.textContent =
      `默认规则估算：本次扫描 ${scanCount} 支。首次冷启动约 ${firstRunRequests} 次请求，预计 ${lowMinutes}-${highMinutes} 分钟；当天已有缓存时，常见复跑约 ${warmRunRequests} 次请求。`;
  }

  function updateFinancialEstimate() {
    if (!el.financialEstimate) return;
    const scanCount = Number.parseInt(String(el.finMaxScan?.value || "100"), 10);
    const count = Number.isFinite(scanCount) ? scanCount : 100;
    const requests = count * 4;
    const lowMinutes = Math.max(1, Math.round((count / 100) * 4));
    const highMinutes = Math.max(lowMinutes + 1, Math.round((count / 100) * 9));
    el.financialEstimate.textContent =
      `财报筛选估算：本次扫描 ${count} 支，冷启动常见约 ${requests} 次请求（profile + 三张财报表），预计 ${lowMinutes}-${highMinutes} 分钟。财报更新频率较低，重复扫描会明显更快。`;
  }

  function updateScreenerUI() {
    const isFmp = Boolean(getIsFmpProvider());
    const universeType = String(el.scrUniverse.value || "us_all");
    const isManual = universeType === "manual";

    el.scrModeHint.textContent = isFmp
      ? "FMP 模式下，筛选页已针对默认规则优化：候选池按市值从高到低固定排序，每次固定扫描前 N 支，重点看市值、最近成交日成交额，以及 5 个交易日内股价是否创历史新高。"
      : "默认使用“全量美股标的列表”（按市值从高到低固定排序，每次固定扫描前 N 支），你只需要设置筛选条件即可。也支持手动导入或粘贴股票代码。";

    el.rowCsvFile.classList.toggle("hidden", !isManual);
    el.rowScreenerSymbols.classList.toggle("hidden", !isManual);
    el.rowScrMinPrice.classList.toggle("hidden", false);
    el.rowScrMinMarketCap.classList.toggle("hidden", false);
    el.rowScrMinTurnoverM.classList.toggle("hidden", !isFmp);
    el.rowScrRecent5dCloseAth.classList.toggle("hidden", !isFmp);
    el.rowScrMinVolumeRatio.classList.toggle("hidden", isFmp);
    el.btnApplyDefaultScreener.classList.toggle("hidden", !isFmp);
    el.btnScreenerAddSelected.classList.toggle("hidden", !isFmp);
    updateScreenerEstimate();
  }

  function updateFinancialUI() {
    const universeType = String(el.finUniverse?.value || "us_all");
    const isManual = universeType === "manual";
    if (el.rowFinSymbols) {
      el.rowFinSymbols.classList.toggle("hidden", !isManual);
    }
    updateFinancialEstimate();
  }

  function applyDefaultFmpScreenerPreset() {
    el.scrUniverse.value = "us_all";
    el.scrMaxScan.value = "2000";
    el.scrMinMarketCap.value = "10000";
    el.scrMinTurnoverM.value = "500";
    el.scrRecent5dCloseAth.value = "true";
    if (el.scrMinPrice) el.scrMinPrice.value = "";
    if (el.scrMinVolumeRatio) el.scrMinVolumeRatio.value = "";
    updateScreenerUI();
  }

  function applyFinancialPreset() {
    el.finUniverse.value = "us_all";
    el.finMaxScan.value = "100";
    el.finMinMarketCap.value = "1000";
    el.finMinRevenueGrowthYoY.value = "15";
    el.finMinGrossMargin.value = "40";
    el.finMinEbitdaGrowthYoY.value = "";
    el.finMinEbitdaMargin.value = "";
    el.finMinOperatingMargin.value = "10";
    el.finPositiveOperatingCashFlow.value = "true";
    el.finPositiveFreeCashFlow.value = "true";
    el.finMaxDebtToEquity.value = "2";
    updateFinancialUI();
  }

  function showTab(tab) {
    const tabs = [
      { btn: el.tabRules, panel: el.panelRules, key: "rules" },
      { btn: el.tabScreener, panel: el.panelScreener, key: "screener" },
      { btn: el.tabFinancial, panel: el.panelFinancial, key: "financial" },
      { btn: el.tabSchedule, panel: el.panelSchedule, key: "schedule" },
      { btn: el.tabConfig, panel: el.panelConfig, key: "config" }
    ];

    for (const tabItem of tabs) {
      const active = tabItem.key === tab;
      tabItem.btn.classList.toggle("active", active);
      tabItem.panel.classList.toggle("active", active);
    }
  }

  return {
    applyDefaultFmpScreenerPreset,
    applyFinancialPreset,
    showTab,
    updateFinancialEstimate,
    updateFinancialUI,
    updateScreenerEstimate,
    updateScreenerUI,
    updateUniverseUI
  };
}
