import { buildFmpDefaultRuleSeed, conditionFromUI } from "./rule-condition-mapper.mjs";
import { parseSymbols, safeParseJSON } from "./common.mjs";

function getProviderValue(el) {
  return String(el.dataProvider.value || "fmp").toLowerCase();
}

function buildFinancialSummaryText(resultCount, meta) {
  if (!meta) {
    return `财报筛选结果：${resultCount}`;
  }
  const updated = meta.universeUpdatedAt ? `（列表更新：${meta.universeUpdatedAt}）` : "";
  const orderText = meta.order === "marketCap_desc" ? "，顺序=市值从高到低" : "";
  const sourceText = meta.universeSource ? `，候选池=${meta.universeSource}` : "";
  return `本次扫描 ${meta.scannedCount ?? 0} 支，命中 ${resultCount} 支${orderText}${sourceText} ${updated}`;
}

function buildScreenerSummaryText(resultCount, meta) {
  if (!meta) {
    return `筛选结果：${resultCount}`;
  }
  const total = meta.totalSymbols ?? 0;
  const updated = meta.universeUpdatedAt ? `（列表更新：${meta.universeUpdatedAt}）` : "";
  const orderText = meta.order === "marketCap_desc" ? "，顺序=市值从高到低" : "";
  const sourceText = meta.universeSource ? `，候选池=${meta.universeSource}` : "";
  return `本次固定扫描前 ${meta.scannedCount ?? 0} 支 / 总计 ${total}，命中 ${resultCount}${orderText}${sourceText} ${updated}`;
}

function buildScreenerRuleSeed(el, symbols) {
  const isFmp = getProviderValue(el) === "fmp";
  return {
    enabled: true,
    name: isFmp ? "默认规则候选提醒" : "筛选结果提醒",
    symbols: symbols.slice(0, 80),
    cooldownSec: isFmp ? 86400 : 3600,
    notify: {},
    ui: isFmp
      ? {
        groupOp: "and",
        items: [
          { type: "market_cap_above", value: 10000 },
          { type: "turnover_m_above", value: 500 },
          { type: "recent_5d_close_ath", value: null }
        ]
      }
      : { groupOp: "and", items: [{ type: "change_below", value: -3 }] },
    condition: isFmp
      ? {
        op: "and",
        args: [
          { op: ">=", left: { var: "marketCap" }, right: 10000 },
          { op: ">=", left: { var: "turnoverM" }, right: 500 },
          { op: ">=", left: { var: "recent5dCloseAth" }, right: 1 }
        ]
      }
      : conditionFromUI("change_below", -3)
  };
}

export function createWorkspaceBindingsController({
  el,
  state,
  appendLog,
  getConfigFromInputs,
  setInputsFromConfig,
  updateAiConfigUI,
  updateScheduleUI,
  updateScreenerUI,
  updateScreenerEstimate,
  updateFinancialUI,
  updateFinancialEstimate,
  updateUniverseUI,
  applyDefaultFmpScreenerPreset,
  applyFinancialPreset,
  addSymbolsToAlertPool,
  clearAiPanel,
  openRuleModal,
  closeRuleModal,
  saveRuleFromModal,
  addCondition,
  renderRulesList,
  syncAdvancedJSON,
  renderScreenerTable,
  renderFinancialTable,
  showTab,
  runOnce,
  start,
  stop,
  buildTemplateRules,
  loadAll
}) {
  async function reloadConfig() {
    state.config = await window.api.loadConfig();
    setInputsFromConfig(state.config);
    appendLog("配置已重新加载");
  }

  async function saveConfig({ afterSave, logMessage }) {
    const cfg = getConfigFromInputs();
    await window.api.saveConfig(cfg);
    state.config = cfg;
    if (typeof afterSave === "function") {
      afterSave();
    }
    appendLog(logMessage);
  }

  async function importSymbolsFromCsvFile() {
    const file = el.csvFile.files && el.csvFile.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const symbols = [];
    for (const line of lines) {
      const first = line.split(",")[0];
      const symbol = String(first || "").trim().toUpperCase();
      if (symbol && /^[A-Z.\-]+$/.test(symbol)) {
        symbols.push(symbol);
      }
    }
    el.screenerSymbols.value = Array.from(new Set(symbols)).join("\n");
    appendLog(`已导入 ${symbols.length} 个 symbols`);
  }

  async function runFinancialWorkspace() {
    const universe = String(el.finUniverse.value || "us_all");
    const useUniverse = universe === "us_all";
    const symbols = useUniverse ? [] : parseSymbols(el.financialSymbols.value);
    if (!useUniverse && symbols.length === 0) {
      appendLog("财报筛选：股票代码为空（或切换到全量美股（按市值从高到低，固定前N））");
      return;
    }

    const maxScan = Number.parseInt(String(el.finMaxScan.value || "100"), 10);
    appendLog(`财报筛选：开始执行（来源=${useUniverse ? "全量美股（按市值从高到低，固定前N）" : "手动列表"}，本次扫描=${Number.isFinite(maxScan) ? maxScan : 100}）...`);
    const criteria = {
      universe: useUniverse ? "us_all" : "manual",
      maxScan: Number.isFinite(maxScan) ? maxScan : 100,
      minMarketCap: el.finMinMarketCap.value === "" ? null : Number(el.finMinMarketCap.value),
      minRevenueGrowthYoY: el.finMinRevenueGrowthYoY.value === "" ? null : Number(el.finMinRevenueGrowthYoY.value),
      minGrossMargin: el.finMinGrossMargin.value === "" ? null : Number(el.finMinGrossMargin.value),
      minEbitdaGrowthYoY: el.finMinEbitdaGrowthYoY.value === "" ? null : Number(el.finMinEbitdaGrowthYoY.value),
      minEbitdaMargin: el.finMinEbitdaMargin.value === "" ? null : Number(el.finMinEbitdaMargin.value),
      minOperatingMargin: el.finMinOperatingMargin.value === "" ? null : Number(el.finMinOperatingMargin.value),
      requirePositiveOperatingCashFlow: String(el.finPositiveOperatingCashFlow.value || "true") === "true",
      requirePositiveFreeCashFlow: String(el.finPositiveFreeCashFlow.value || "true") === "true",
      maxDebtToEquity: el.finMaxDebtToEquity.value === "" ? null : Number(el.finMaxDebtToEquity.value)
    };

    try {
      const res = await window.api.runFinancialScreener({ symbols, criteria });
      const rows = res && typeof res === "object" ? res.rows : res;
      const meta = res && typeof res === "object" ? res.meta : null;
      state.financialResults = Array.isArray(rows) ? rows : [];
      el.financialSummary.textContent = buildFinancialSummaryText(state.financialResults.length, meta);
      renderFinancialTable(state.financialResults);
      appendLog("财报筛选：执行完成");
    } catch (error) {
      state.financialResults = [];
      renderFinancialTable([]);
      el.financialSummary.textContent = "";
      appendLog(`财报筛选失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function runScreenerWorkspace() {
    const universe = String(el.scrUniverse.value || "us_all");
    const useUniverse = universe === "us_all";
    const symbols = useUniverse ? [] : parseSymbols(el.screenerSymbols.value);
    if (!useUniverse && symbols.length === 0) {
      appendLog("筛选：股票代码为空（或切换到全量美股（按市值从高到低，固定前N））");
      return;
    }

    const maxScan = Number.parseInt(String(el.scrMaxScan.value || "500"), 10);
    appendLog(`筛选：开始执行（来源=${useUniverse ? "全量美股（按市值从高到低，固定前N）" : "手动列表"}，本次扫描=${Number.isFinite(maxScan) ? maxScan : 500}）...`);
    const criteria = {
      minPrice: el.scrMinPrice.value === "" ? null : Number(el.scrMinPrice.value),
      minMarketCap: el.scrMinMarketCap.value === "" ? null : Number(el.scrMinMarketCap.value),
      minTurnoverM: el.scrMinTurnoverM.value === "" ? null : Number(el.scrMinTurnoverM.value),
      requireRecent5dCloseAth: String(el.scrRecent5dCloseAth.value || "false") === "true",
      minVolumeRatio: el.scrMinVolumeRatio.value === "" ? null : Number(el.scrMinVolumeRatio.value),
      universe: useUniverse ? "us_all" : "manual",
      maxScan: Number.isFinite(maxScan) ? maxScan : 500,
      forceRefreshUniverse: false
    };
    const res = await window.api.runScreener({ symbols, criteria });
    const rows = res && typeof res === "object" ? res.rows : res;
    const meta = res && typeof res === "object" ? res.meta : null;
    state.screenerResults = Array.isArray(rows) ? rows : [];
    state.screenerSelected = [];
    el.screenerSummary.textContent = buildScreenerSummaryText(state.screenerResults.length, meta);
    renderScreenerTable(state.screenerResults);
    appendLog("筛选：执行完成");
  }

  async function refreshScreenerUniverse() {
    el.scrUniverse.value = "us_all";
    const maxScan = Number.parseInt(String(el.scrMaxScan.value || "500"), 10);
    appendLog("开始刷新全量美股标的列表...");
    const res = await window.api.runScreener({
      symbols: [],
      criteria: { universe: "us_all", maxScan: Number.isFinite(maxScan) ? maxScan : 500, forceRefreshUniverse: true }
    });
    const meta = res && typeof res === "object" ? res.meta : null;
    if (meta?.totalSymbols) {
      appendLog(`美股列表已刷新：${meta.totalSymbols} 个`);
    } else {
      appendLog("美股列表已刷新");
    }
  }

  function openRuleDraftFromScreener() {
    const symbols = (state.screenerResults || []).map((row) => row.symbol).filter(Boolean);
    if (symbols.length === 0) {
      appendLog("没有筛选结果可用于创建规则");
      return;
    }
    openRuleModal(null, buildScreenerRuleSeed(el, symbols));
    showTab("rules");
  }

  async function saveRulesFromJsonEditor() {
    const parsed = safeParseJSON(el.rulesJson.value);
    if (!parsed.ok || !Array.isArray(parsed.value)) {
      appendLog(`高级内容无效：${parsed.ok ? "必须是数组" : parsed.error}`);
      return;
    }
    state.rules = parsed.value;
    await window.api.saveRules(state.rules);
    renderRulesList();
    appendLog("高级内容已保存");
  }

  async function resetWorkspaceData() {
    const ok = confirm("将删除当前数据目录中的配置、规则、状态和事件文件，用于重新做一轮干净测试。是否继续？");
    if (!ok) return;

    try {
      const res = await window.api.resetTestData();
      appendLog(`测试数据已重置：${res?.base || "当前目录"}`);
      el.log.textContent = "";
      appendLog("已清空测试数据并重新加载默认状态。");
      await loadAll();
    } catch (error) {
      appendLog(`重置测试数据失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function bindTabEvents() {
    el.tabRules.addEventListener("click", () => showTab("rules"));
    el.tabScreener.addEventListener("click", () => showTab("screener"));
    el.tabFinancial.addEventListener("click", () => showTab("financial"));
    el.tabSchedule.addEventListener("click", () => showTab("schedule"));
    el.tabConfig.addEventListener("click", () => showTab("config"));
  }

  function bindUiStateEvents() {
    el.scheduleMode.addEventListener("change", updateScheduleUI);
    el.aiThinkingEnabled.addEventListener("change", updateAiConfigUI);
    el.dataProvider.addEventListener("change", () => {
      updateScreenerUI();
      updateUniverseUI();
    });
    el.scrUniverse.addEventListener("change", updateScreenerUI);
    el.scrMaxScan.addEventListener("input", updateScreenerEstimate);
    el.finUniverse.addEventListener("change", updateFinancialUI);
    el.finMaxScan.addEventListener("input", updateFinancialEstimate);
    el.ruleUniverse.addEventListener("change", updateUniverseUI);
    el.btnAddCondition.addEventListener("click", addCondition);
  }

  function bindWorkspaceActions() {
    el.btnApplyDefaultScreener.addEventListener("click", () => {
      applyDefaultFmpScreenerPreset();
      appendLog("已套用默认规则门槛：100亿市值 + 5亿成交额 + 5日股价新高");
    });
    el.btnScreenerAddSelected.addEventListener("click", async () => {
      await addSymbolsToAlertPool(state.screenerSelected);
    });
    el.btnApplyFinancialPreset.addEventListener("click", () => {
      applyFinancialPreset();
      appendLog("已套用成长财报模板：营收增速 + 毛利率 + EBITDA同比/利润率 + 经营利润率 + 正现金流 + 负债约束");
    });
    el.btnFinancialAddToPool.addEventListener("click", async () => {
      const symbols = (state.financialResults || []).map((row) => row.symbol).filter(Boolean);
      await addSymbolsToAlertPool(symbols, { forceFmp: true });
    });
    el.btnClearAiPanel.addEventListener("click", () => {
      clearAiPanel();
      appendLog("已清空 AI 解读");
    });
  }

  function bindConfigActions() {
    el.btnLoadConfig.addEventListener("click", reloadConfig);
    el.btnSaveConfig.addEventListener("click", async () => {
      await saveConfig({ logMessage: "定时配置已保存" });
    });
    el.btnLoadConfig2.addEventListener("click", reloadConfig);
    el.btnSaveConfig2.addEventListener("click", async () => {
      await saveConfig({
        afterSave: updateScreenerUI,
        logMessage: "配置已保存"
      });
    });
  }

  function bindRuleActions() {
    el.btnAddRule.addEventListener("click", () => openRuleModal(null, buildFmpDefaultRuleSeed()));
    el.btnModalCancel.addEventListener("click", closeRuleModal);
    el.modal.addEventListener("click", (evt) => {
      if (evt.target === el.modal) {
        closeRuleModal();
      }
    });
    el.btnModalSave.addEventListener("click", saveRuleFromModal);

    el.btnLoadRules.addEventListener("click", async () => {
      const rules = await window.api.loadRules();
      state.rules = Array.isArray(rules) ? rules : [];
      syncAdvancedJSON();
      renderRulesList();
      appendLog("规则已重新加载");
    });

    el.btnSaveRules.addEventListener("click", async () => {
      await window.api.saveRules(state.rules);
      syncAdvancedJSON();
      appendLog("规则已保存");
    });

    el.btnToggleAdvanced.addEventListener("click", () => {
      el.advancedBox.classList.toggle("hidden");
    });

    el.btnInsertTemplate.addEventListener("click", () => {
      state.rules = buildTemplateRules();
      syncAdvancedJSON();
      renderRulesList();
      appendLog("已插入模板规则（未自动保存）");
    });

    el.btnSaveRulesFromJson.addEventListener("click", saveRulesFromJsonEditor);
    el.btnScreenerToRule.addEventListener("click", openRuleDraftFromScreener);
  }

  function bindResultActions() {
    el.csvFile.addEventListener("change", importSymbolsFromCsvFile);
    el.btnRunFinancialScreener.addEventListener("click", runFinancialWorkspace);
    el.btnRunScreener.addEventListener("click", runScreenerWorkspace);
    el.btnRefreshUniverse.addEventListener("click", refreshScreenerUniverse);
  }

  function bindRunActions() {
    el.btnDryRunOnce.addEventListener("click", async () => {
      await runOnce({ dryRun: true, provider: getProviderValue(el) });
    });
    el.btnRunOnce.addEventListener("click", async () => {
      await runOnce({ dryRun: false, provider: getProviderValue(el) });
    });
    el.btnStart.addEventListener("click", start);
    el.btnStop.addEventListener("click", stop);
    el.btnResetTestData.addEventListener("click", resetWorkspaceData);
  }

  function bind() {
    bindTabEvents();
    bindUiStateEvents();
    bindWorkspaceActions();
    bindConfigActions();
    bindRuleActions();
    bindResultActions();
    bindRunActions();
  }

  return {
    bind
  };
}
