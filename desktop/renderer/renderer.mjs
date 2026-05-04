const $ = (id) => document.getElementById(id);

const el = {
  tabRules: $("tabRules"),
  tabScreener: $("tabScreener"),
  tabFinancial: $("tabFinancial"),
  tabSchedule: $("tabSchedule"),
  tabConfig: $("tabConfig"),
  panelRules: $("panelRules"),
  panelScreener: $("panelScreener"),
  panelFinancial: $("panelFinancial"),
  panelSchedule: $("panelSchedule"),
  panelConfig: $("panelConfig"),

  dataProvider: $("dataProvider"),
  finnhubApiKey: $("finnhubApiKey"),
  finnhubBaseUrl: $("finnhubBaseUrl"),
  fmpApiKey: $("fmpApiKey"),
  fmpBaseUrl: $("fmpBaseUrl"),
  deepseekApiKey: $("deepseekApiKey"),
  deepseekBaseUrl: $("deepseekBaseUrl"),
  aiModel: $("aiModel"),
  aiThinkingEnabled: $("aiThinkingEnabled"),
  aiReasoningEffort: $("aiReasoningEffort"),
  defaultEmailTo: $("defaultEmailTo"),
  defaultWebhookUrl: $("defaultWebhookUrl"),
  gmailUser: $("gmailUser"),
  gmailPass: $("gmailPass"),

  scheduleMode: $("scheduleMode"),
  scheduleIntervalSec: $("scheduleIntervalSec"),
  scheduleDailyTime: $("scheduleDailyTime"),
  scheduleWeekdaysOnly: $("scheduleWeekdaysOnly"),
  rowIntervalSec: $("rowIntervalSec"),
  rowDailyTime: $("rowDailyTime"),
  rowWeekdaysOnly: $("rowWeekdaysOnly"),

  btnSaveConfig: $("btnSaveConfig"),
  btnLoadConfig: $("btnLoadConfig"),
  btnSaveConfig2: $("btnSaveConfig2"),
  btnLoadConfig2: $("btnLoadConfig2"),

  btnAddRule: $("btnAddRule"),
  btnSaveRules: $("btnSaveRules"),
  btnLoadRules: $("btnLoadRules"),
  btnToggleAdvanced: $("btnToggleAdvanced"),
  advancedBox: $("advancedBox"),
  rulesJson: $("rulesJson"),
  btnInsertTemplate: $("btnInsertTemplate"),
  btnSaveRulesFromJson: $("btnSaveRulesFromJson"),
  rulesList: $("rulesList"),

  csvFile: $("csvFile"),
  rowCsvFile: $("rowCsvFile"),
  scrUniverse: $("scrUniverse"),
  scrModeHint: $("scrModeHint"),
  rowScreenerSymbols: $("rowScreenerSymbols"),
  screenerSymbols: $("screenerSymbols"),
  scrMaxScan: $("scrMaxScan"),
  rowScrMinPrice: $("rowScrMinPrice"),
  scrMinPrice: $("scrMinPrice"),
  rowScrMinMarketCap: $("rowScrMinMarketCap"),
  scrMinMarketCap: $("scrMinMarketCap"),
  rowScrMinTurnoverM: $("rowScrMinTurnoverM"),
  scrMinTurnoverM: $("scrMinTurnoverM"),
  rowScrRecent5dCloseAth: $("rowScrRecent5dCloseAth"),
  scrRecent5dCloseAth: $("scrRecent5dCloseAth"),
  rowScrMinVolumeRatio: $("rowScrMinVolumeRatio"),
  scrMinVolumeRatio: $("scrMinVolumeRatio"),
  btnApplyDefaultScreener: $("btnApplyDefaultScreener"),
  btnRunScreener: $("btnRunScreener"),
  btnScreenerAddSelected: $("btnScreenerAddSelected"),
  btnScreenerToRule: $("btnScreenerToRule"),
  btnRefreshUniverse: $("btnRefreshUniverse"),
  scrEstimate: $("scrEstimate"),
  screenerSummary: $("screenerSummary"),
  screenerTable: $("screenerTable"),

  finUniverse: $("finUniverse"),
  rowFinSymbols: $("rowFinSymbols"),
  financialSymbols: $("financialSymbols"),
  finMaxScan: $("finMaxScan"),
  finMinMarketCap: $("finMinMarketCap"),
  finMinRevenueGrowthYoY: $("finMinRevenueGrowthYoY"),
  finMinGrossMargin: $("finMinGrossMargin"),
  finMinEbitdaGrowthYoY: $("finMinEbitdaGrowthYoY"),
  finMinEbitdaMargin: $("finMinEbitdaMargin"),
  finMinOperatingMargin: $("finMinOperatingMargin"),
  finPositiveOperatingCashFlow: $("finPositiveOperatingCashFlow"),
  finPositiveFreeCashFlow: $("finPositiveFreeCashFlow"),
  finMaxDebtToEquity: $("finMaxDebtToEquity"),
  btnApplyFinancialPreset: $("btnApplyFinancialPreset"),
  btnRunFinancialScreener: $("btnRunFinancialScreener"),
  btnFinancialAddToPool: $("btnFinancialAddToPool"),
  btnClearFinancialAi: $("btnClearFinancialAi"),
  financialEstimate: $("financialEstimate"),
  financialSummary: $("financialSummary"),
  financialTable: $("financialTable"),
  financialAiStatus: $("financialAiStatus"),
  financialAiOutput: $("financialAiOutput"),

  btnDryRunOnce: $("btnDryRunOnce"),
  btnRunOnce: $("btnRunOnce"),
  btnStart: $("btnStart"),
  btnStop: $("btnStop"),
  btnResetTestData: $("btnResetTestData"),
  log: $("log"),
  devModeInfo: $("devModeInfo"),
  paths: $("paths"),
  btnOpenSourceRepo: $("btnOpenSourceRepo"),
  btnOpenUpstreamRepo: $("btnOpenUpstreamRepo"),
  btnOpenLicenseUrl: $("btnOpenLicenseUrl"),
  legalSummary: $("legalSummary"),
  legalNoticeText: $("legalNoticeText"),

  modal: $("modal"),
  modalTitle: $("modalTitle"),
  rulePresetHint: $("rulePresetHint"),
  ruleEnabled: $("ruleEnabled"),
  ruleName: $("ruleName"),
  ruleUniverse: $("ruleUniverse"),
  rowRuleSymbols: $("rowRuleSymbols"),
  ruleSymbols: $("ruleSymbols"),
  rowRuleUniverseMaxScan: $("rowRuleUniverseMaxScan"),
  ruleUniverseMaxScan: $("ruleUniverseMaxScan"),
  rowRuleUniverseMinPrice: $("rowRuleUniverseMinPrice"),
  ruleUniverseMinPrice: $("ruleUniverseMinPrice"),
  rowRuleUniverseMinMarketCap: $("rowRuleUniverseMinMarketCap"),
  ruleUniverseMinMarketCap: $("ruleUniverseMinMarketCap"),
  rowRuleUniverseMinTurnoverM: $("rowRuleUniverseMinTurnoverM"),
  ruleUniverseMinTurnoverM: $("ruleUniverseMinTurnoverM"),
  rowRuleUniverseRecent5dCloseAth: $("rowRuleUniverseRecent5dCloseAth"),
  ruleUniverseRecent5dCloseAth: $("ruleUniverseRecent5dCloseAth"),
  rowRuleUniverseMinVolumeRatio: $("rowRuleUniverseMinVolumeRatio"),
  ruleUniverseMinVolumeRatio: $("ruleUniverseMinVolumeRatio"),
  ruleGroupOp: $("ruleGroupOp"),
  btnAddCondition: $("btnAddCondition"),
  conditionsList: $("conditionsList"),
  ruleCooldownSec: $("ruleCooldownSec"),
  ruleEmailTo: $("ruleEmailTo"),
  ruleWebhookUrl: $("ruleWebhookUrl"),
  btnModalSave: $("btnModalSave"),
  btnModalCancel: $("btnModalCancel")
};

const state = {
  config: null,
  rules: [],
  screenerResults: [],
  screenerSelected: [],
  financialResults: [],
  financialAiBusy: false,
  modalForceFmp: false,
  editingIndex: null,
  modalConditions: [],
  runBusy: false
};

function appendLog(line) {
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  el.log.textContent += `[${ts}] ${String(line)}\n`;
  el.log.scrollTop = el.log.scrollHeight;
}

function setRunButtonsBusy(busy) {
  state.runBusy = Boolean(busy);
  const disabled = state.runBusy;
  for (const button of [el.btnDryRunOnce, el.btnRunOnce, el.btnStart]) {
    if (!button) continue;
    button.disabled = disabled;
  }
}

function formatDevModeInfo(paths) {
  if (!paths) return "";
  const usingCustom = Boolean(paths.usingCustomDataDir);
  if (usingCustom) {
    return `当前为开发测试模式：已使用独立测试数据目录。\n测试目录：${paths.base}\n建议：继续联调时保持这个目录，避免旧配置污染结果。`;
  }
  return `当前为默认数据目录模式：${paths.base}\n建议开发联调时使用 OPENSTOCK_USER_DATA_DIR 指向独立测试目录，避免影响正式配置。`;
}

function safeParseJSON(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseSymbols(text) {
  const raw = String(text || "")
    .split(/[\n,]/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

function updateUniverseUI() {
  const u = String(el.ruleUniverse.value || "manual");
  const isManual = u === "manual";
  const isFmp = state.modalForceFmp || String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";
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

function updateScreenerUI() {
  const provider = String(el.dataProvider.value || "fmp").toLowerCase();
  const isFmp = provider === "fmp";
  const universe = String(el.scrUniverse.value || "us_all");
  const isManual = universe === "manual";

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
  const universe = String(el.finUniverse?.value || "us_all");
  const isManual = universe === "manual";
  if (el.rowFinSymbols) {
    el.rowFinSymbols.classList.toggle("hidden", !isManual);
  }
  updateFinancialEstimate();
}

function updateAiConfigUI() {
  const thinkingEnabled = String(el.aiThinkingEnabled?.value || "false") === "true";
  if (el.aiReasoningEffort) {
    el.aiReasoningEffort.disabled = !thinkingEnabled;
  }
}

function clearFinancialAiOutput() {
  if (el.financialAiStatus) el.financialAiStatus.textContent = "";
  if (el.financialAiOutput) el.financialAiOutput.textContent = "";
  state.financialAiBusy = false;
}

async function explainFinancialRow(row) {
  if (!row || !row.symbol) return;
  state.financialAiBusy = true;
  if (el.financialAiStatus) {
    el.financialAiStatus.textContent = `AI 解读中：${row.symbol}...`;
  }
  if (el.financialAiOutput) {
    el.financialAiOutput.textContent = "";
  }
  try {
    const res = await window.api.explainFinancialRow({ row });
    const meta = res?.meta || {};
    const thinkingText = meta.thinkingEnabled ? `思考=${meta.reasoningEffort || "high"}` : "思考=关闭";
    if (el.financialAiStatus) {
      el.financialAiStatus.textContent = `AI 解读完成：${row.symbol} · ${meta.provider || "deepseek"} · ${meta.model || "-"} · ${thinkingText}`;
    }
    if (el.financialAiOutput) {
      el.financialAiOutput.textContent = String(res?.text || "未返回内容");
    }
    appendLog(`AI 解读完成：${row.symbol}`);
  } catch (e) {
    if (el.financialAiStatus) {
      el.financialAiStatus.textContent = `AI 解读失败：${row.symbol}`;
    }
    if (el.financialAiOutput) {
      el.financialAiOutput.textContent = e instanceof Error ? e.message : String(e);
    }
    appendLog(`AI 解读失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    state.financialAiBusy = false;
  }
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
  const isFmp = String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";
  if (!isFmp) {
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

function buildFmpDefaultRuleSeed() {
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

async function addSymbolsToAlertPool(symbols, options = {}) {
  const incoming = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  if (incoming.length === 0) {
    appendLog("没有可加入提醒池的标的");
    return;
  }

  const isFmp = Boolean(options.forceFmp) || String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";
  const poolName = isFmp ? "默认规则候选股票池" : "候选股票池";
  const idx = state.rules.findIndex((rule) => String(rule?.name || "") === poolName);
  const nextRule = idx >= 0
    ? JSON.parse(JSON.stringify(state.rules[idx]))
    : (isFmp ? buildFmpCandidatePoolRule([]) : null);

  if (!nextRule) {
    appendLog("当前仅在 FMP 模式下提供一键加入提醒池");
    return;
  }

  const merged = Array.from(new Set([...(nextRule.symbols || []), ...incoming]));
  nextRule.symbols = merged;

  if (idx >= 0) state.rules[idx] = nextRule;
  else state.rules.unshift(nextRule);

  await window.api.saveRules(state.rules);
  syncAdvancedJSON();
  renderRulesList();
  appendLog(`已加入提醒池：新增 ${incoming.length} 个，当前池内共 ${merged.length} 个`);
}

function conditionFromUI(type, value) {
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

function conditionTypeNeedsValue(type) {
  const t = String(type || "");
  return !(t === "cross_above_sma20" || t === "cross_below_sma20" || t === "recent_5d_close_ath");
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

function uiGroupFromConditionTree(condition) {
  if (!condition || typeof condition !== "object") {
    return { groupOp: "and", items: [{ type: "price_above", value: 0 }] };
  }

  const op = String(condition.op || "");
  if ((op === "and" || op === "or") && Array.isArray(condition.args)) {
    const items = condition.args.map(uiItemFromCondition).filter(Boolean);
    return { groupOp: op, items: items.length > 0 ? items : [{ type: "price_above", value: 0 }] };
  }

  const single = uiItemFromCondition(condition);
  return { groupOp: "and", items: single ? [single] : [{ type: "price_above", value: 0 }] };
}

function summarizeConditionItem(item) {
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

function summarizeRule(rule) {
  const ui = rule.ui || {};
  const items = Array.isArray(ui.items) ? ui.items : null;
  if (items && items.length > 0) {
    const joiner = String(ui.groupOp || "and").toLowerCase() === "or" ? " 或 " : " 且 ";
    const parts = items.map(summarizeConditionItem).filter(Boolean);
    return parts.length <= 1 ? (parts[0] || "自定义条件") : parts.join(joiner);
  }
  return summarizeConditionItem(ui);
}

function templateRules() {
  return [buildFmpDefaultRuleSeed()];
}

function renderRulesList() {
  el.rulesList.innerHTML = "";
  if (state.rules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "暂无规则。点击“添加规则”创建常用提醒。";
    el.rulesList.appendChild(empty);
    return;
  }

  state.rules.forEach((rule, idx) => {
    const item = document.createElement("div");
    item.className = "listItem";

    const top = document.createElement("div");
    top.className = "listTop";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "listTitle";
    title.textContent = rule.name || `规则 ${idx + 1}`;

    const meta = document.createElement("div");
    meta.className = "listMeta";
    const symbols = Array.isArray(rule.symbols) ? rule.symbols.join(", ") : "";
    const universeText = rule?.universe?.type === "us_all"
      ? `标的范围: 全量美股（按市值从高到低，固定前 ${rule?.universe?.maxScan ?? 2000}）`
      : `股票代码: ${symbols}`;
    meta.textContent = `${summarizeRule(rule)} · ${universeText}`;

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "listActions";

    const pill = document.createElement("span");
    pill.className = `pill ${rule.enabled ? "on" : "off"}`;
    pill.textContent = rule.enabled ? "启用" : "停用";
    right.appendChild(pill);

    const btnEdit = document.createElement("button");
    btnEdit.textContent = "编辑";
    btnEdit.addEventListener("click", () => openRuleModal(idx));
    right.appendChild(btnEdit);

    const btnToggle = document.createElement("button");
    btnToggle.textContent = rule.enabled ? "停用" : "启用";
    btnToggle.addEventListener("click", () => {
      state.rules[idx].enabled = !state.rules[idx].enabled;
      syncAdvancedJSON();
      renderRulesList();
    });
    right.appendChild(btnToggle);

    const btnDup = document.createElement("button");
    btnDup.textContent = "复制";
    btnDup.addEventListener("click", () => {
      const copy = JSON.parse(JSON.stringify(rule));
      copy.name = `${rule.name || "规则"}（副本）`;
      state.rules.splice(idx + 1, 0, copy);
      syncAdvancedJSON();
      renderRulesList();
    });
    right.appendChild(btnDup);

    const btnDel = document.createElement("button");
    btnDel.textContent = "删除";
    btnDel.addEventListener("click", () => {
      if (!confirm("确定删除该规则？")) return;
      state.rules.splice(idx, 1);
      syncAdvancedJSON();
      renderRulesList();
    });
    right.appendChild(btnDel);

    top.appendChild(left);
    top.appendChild(right);
    item.appendChild(top);
    el.rulesList.appendChild(item);
  });
}

function syncAdvancedJSON() {
  el.rulesJson.value = JSON.stringify(state.rules, null, 2);
}

function showTab(tab) {
  const tabs = [
    { btn: el.tabRules, panel: el.panelRules, key: "rules" },
    { btn: el.tabScreener, panel: el.panelScreener, key: "screener" },
    { btn: el.tabFinancial, panel: el.panelFinancial, key: "financial" },
    { btn: el.tabSchedule, panel: el.panelSchedule, key: "schedule" },
    { btn: el.tabConfig, panel: el.panelConfig, key: "config" }
  ];
  for (const t of tabs) {
    const active = t.key === tab;
    t.btn.classList.toggle("active", active);
    t.panel.classList.toggle("active", active);
  }
}

function updateScheduleUI() {
  const mode = String(el.scheduleMode.value || "interval");
  const isInterval = mode === "interval";
  el.rowIntervalSec.classList.toggle("hidden", !isInterval);
  el.rowDailyTime.classList.toggle("hidden", isInterval);
  el.rowWeekdaysOnly.classList.toggle("hidden", isInterval);
}

function getConfigFromInputs() {
  const schedulerMode = String(el.scheduleMode.value || "interval");
  const intervalSec = Number.parseInt(String(el.scheduleIntervalSec.value || "60"), 10);
  const dailyTime = String(el.scheduleDailyTime.value || "09:30");
  const weekdaysOnly = String(el.scheduleWeekdaysOnly.value || "true") === "true";

  return {
    dataProvider: String(el.dataProvider.value || "fmp"),
    finnhubBaseUrl: String(el.finnhubBaseUrl.value || "https://finnhub.io/api/v1"),
    finnhubApiKey: String(el.finnhubApiKey.value || ""),
    fmpBaseUrl: String(el.fmpBaseUrl.value || "https://financialmodelingprep.com"),
    fmpApiKey: String(el.fmpApiKey.value || ""),
    ai: {
      provider: "deepseek",
      baseUrl: String(el.deepseekBaseUrl.value || "https://api.deepseek.com"),
      apiKey: String(el.deepseekApiKey.value || ""),
      model: String(el.aiModel.value || "deepseek-v4-flash"),
      thinkingEnabled: String(el.aiThinkingEnabled.value || "false") === "true",
      reasoningEffort: String(el.aiReasoningEffort.value || "high")
    },
    pollIntervalSec: Number.isFinite(intervalSec) ? intervalSec : 60,
    scheduler: {
      mode: schedulerMode,
      intervalSec: Number.isFinite(intervalSec) ? intervalSec : 60,
      dailyTime,
      weekdaysOnly
    },
    defaultEmailTo: String(el.defaultEmailTo.value || ""),
    defaultWebhookUrl: String(el.defaultWebhookUrl.value || ""),
    email: {
      provider: "gmail",
      user: String(el.gmailUser.value || ""),
      pass: String(el.gmailPass.value || "")
    }
  };
}

function setInputsFromConfig(cfg) {
  el.dataProvider.value = cfg.dataProvider || "fmp";
  el.finnhubBaseUrl.value = cfg.finnhubBaseUrl || "https://finnhub.io/api/v1";
  el.finnhubApiKey.value = cfg.finnhubApiKey || "";
  el.fmpBaseUrl.value = cfg.fmpBaseUrl || "https://financialmodelingprep.com";
  el.fmpApiKey.value = cfg.fmpApiKey || "";
  el.deepseekBaseUrl.value = cfg.ai?.baseUrl || "https://api.deepseek.com";
  el.deepseekApiKey.value = cfg.ai?.apiKey || "";
  el.aiModel.value = cfg.ai?.model || "deepseek-v4-flash";
  el.aiThinkingEnabled.value = String(Boolean(cfg.ai?.thinkingEnabled));
  el.aiReasoningEffort.value = cfg.ai?.reasoningEffort || "high";
  el.defaultEmailTo.value = cfg.defaultEmailTo || "";
  el.defaultWebhookUrl.value = cfg.defaultWebhookUrl || "";
  el.gmailUser.value = cfg.email?.user || "";
  el.gmailPass.value = cfg.email?.pass || "";

  const scheduler = cfg.scheduler || { mode: "interval", intervalSec: cfg.pollIntervalSec || 60, dailyTime: "09:30", weekdaysOnly: true };
  el.scheduleMode.value = String(scheduler.mode || "interval");
  el.scheduleIntervalSec.value = String(scheduler.intervalSec ?? cfg.pollIntervalSec ?? 60);
  el.scheduleDailyTime.value = String(scheduler.dailyTime || "09:30");
  el.scheduleWeekdaysOnly.value = String(Boolean(scheduler.weekdaysOnly));
  updateScheduleUI();
  updateAiConfigUI();
}

const CONDITION_TYPE_OPTIONS = [
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

function defaultConditionItem() {
  if (String(el?.dataProvider?.value || "fmp").toLowerCase() === "fmp") {
    return { type: "market_cap_above", value: 10000 };
  }
  return { type: "price_above", value: 100 };
}

function renderModalConditions() {
  el.conditionsList.innerHTML = "";

  if (!Array.isArray(state.modalConditions) || state.modalConditions.length === 0) {
    state.modalConditions = [defaultConditionItem()];
  }

  state.modalConditions.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "condRow";

    const sel = document.createElement("select");
    for (const opt of CONDITION_TYPE_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    sel.value = String(item.type || "price_above");
    sel.addEventListener("change", () => {
      state.modalConditions[idx].type = sel.value;
      if (!conditionTypeNeedsValue(sel.value)) {
        state.modalConditions[idx].value = null;
      } else if (state.modalConditions[idx].value === null || state.modalConditions[idx].value === undefined) {
        state.modalConditions[idx].value = 0;
      }
      renderModalConditions();
    });

    const value = document.createElement("input");
    value.type = "number";
    value.step = "0.01";
    const needsValue = conditionTypeNeedsValue(sel.value);
    value.disabled = !needsValue;
    value.placeholder = needsValue ? "阈值" : "-";
    value.value = item.value === null || item.value === undefined ? "" : String(item.value);
    value.addEventListener("input", () => {
      const n = Number(value.value);
      state.modalConditions[idx].value = Number.isFinite(n) ? n : null;
    });

    const del = document.createElement("button");
    del.textContent = "删除";
    del.addEventListener("click", () => {
      state.modalConditions.splice(idx, 1);
      renderModalConditions();
    });

    row.appendChild(sel);
    row.appendChild(value);
    row.appendChild(del);
    el.conditionsList.appendChild(row);
  });
}

function openRuleModal(indexOrNull, seed) {
  state.editingIndex = indexOrNull;
  const fallbackSeed = indexOrNull === null ? buildFmpDefaultRuleSeed() : null;
  const rule = seed || (indexOrNull !== null ? state.rules[indexOrNull] : null) || fallbackSeed;
  const usesFmpDefaultFields = Boolean(
    rule?.ui?.items?.some((it) => it?.type === "turnover_m_above" || it?.type === "recent_5d_close_ath") ||
    rule?.universe?.minTurnoverM !== undefined ||
    rule?.universe?.requireRecent5dCloseAth !== undefined
  );
  state.modalForceFmp = usesFmpDefaultFields;

  el.modalTitle.textContent = indexOrNull === null ? "添加规则" : "编辑规则";
  el.ruleEnabled.value = rule ? String(Boolean(rule.enabled)) : "true";
  el.ruleName.value = rule?.name || "";
  const universe = rule?.universe || { type: "manual" };
  el.ruleUniverse.value = String(universe.type || "manual");
  el.ruleSymbols.value = rule?.symbols ? rule.symbols.join(", ") : "";
  el.ruleUniverseMaxScan.value = String(universe.maxScan ?? 2000);
  el.ruleUniverseMinPrice.value = universe.minPrice === null || universe.minPrice === undefined ? "" : String(universe.minPrice);
  el.ruleUniverseMinMarketCap.value = universe.minMarketCap === null || universe.minMarketCap === undefined ? "" : String(universe.minMarketCap);
  el.ruleUniverseMinTurnoverM.value = universe.minTurnoverM === null || universe.minTurnoverM === undefined ? "" : String(universe.minTurnoverM);
  el.ruleUniverseRecent5dCloseAth.value = String(universe.requireRecent5dCloseAth === false ? "false" : "true");
  el.ruleUniverseMinVolumeRatio.value = universe.minVolumeRatio === null || universe.minVolumeRatio === undefined ? "" : String(universe.minVolumeRatio);
  updateUniverseUI();

  const group = rule?.ui?.items ? { groupOp: rule.ui.groupOp || "and", items: rule.ui.items } : uiGroupFromConditionTree(rule?.condition);
  el.ruleGroupOp.value = String(group.groupOp || "and").toLowerCase() === "or" ? "or" : "and";
  state.modalConditions = Array.isArray(group.items) && group.items.length > 0
    ? group.items.map((it) => ({ type: it.type, value: it.value }))
    : [defaultConditionItem()];
  el.ruleCooldownSec.value = String(rule?.cooldownSec ?? 3600);
  el.ruleEmailTo.value = String(rule?.notify?.email || "");
  el.ruleWebhookUrl.value = String(rule?.notify?.webhookUrl || "");

  renderModalConditions();
  el.modal.classList.remove("hidden");
}

function closeRuleModal() {
  el.modal.classList.add("hidden");
  state.editingIndex = null;
  state.modalForceFmp = false;
  state.modalConditions = [];
}

async function loadAll() {
  const paths = await window.api.getPaths();
  if (el.devModeInfo) {
    el.devModeInfo.textContent = formatDevModeInfo(paths);
  }
  el.paths.textContent = `数据目录：${paths.base}\nconfig.json：${paths.config}\nrules.json：${paths.rules}\nstate.json：${paths.state}\nevents.jsonl：${paths.events}\nuniverse_us_symbols.json：${paths.universeUS}\nuniverse_fmp_default.json：${paths.universeFmpDefault || "-"}\nuniverse_fmp_financial.json：${paths.universeFmpFinancial || "-"}`;

  state.config = await window.api.loadConfig();
  setInputsFromConfig(state.config);

  const rules = await window.api.loadRules();
  state.rules = Array.isArray(rules) ? rules : [];
  if (state.rules.length === 0) state.rules = templateRules();
  state.screenerSelected = [];
  syncAdvancedJSON();
  renderRulesList();
  updateScreenerUI();
  updateFinancialUI();

  const legalInfo = await window.api.getLegalInfo();
  if (legalInfo) {
    if (el.legalSummary) {
      el.legalSummary.textContent =
        `当前仓库源码：${legalInfo.sourceRepoUrl}\n上游仓库：${legalInfo.upstreamRepoUrl}\n许可证：${legalInfo.licenseUrl}`;
    }
    if (el.legalNoticeText) {
      el.legalNoticeText.textContent = legalInfo.noticeText || "未找到本地版权说明。";
    }
    if (el.btnOpenSourceRepo) {
      el.btnOpenSourceRepo.onclick = () => window.api.openExternal(legalInfo.sourceRepoUrl);
    }
    if (el.btnOpenUpstreamRepo) {
      el.btnOpenUpstreamRepo.onclick = () => window.api.openExternal(legalInfo.upstreamRepoUrl);
    }
    if (el.btnOpenLicenseUrl) {
      el.btnOpenLicenseUrl.onclick = () => window.api.openExternal(legalInfo.licenseUrl);
    }
  }
}

el.tabRules.addEventListener("click", () => showTab("rules"));
el.tabScreener.addEventListener("click", () => showTab("screener"));
el.tabFinancial.addEventListener("click", () => showTab("financial"));
el.tabSchedule.addEventListener("click", () => showTab("schedule"));
el.tabConfig.addEventListener("click", () => showTab("config"));

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
el.btnAddCondition.addEventListener("click", () => {
  state.modalConditions.push(defaultConditionItem());
  renderModalConditions();
});
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
  await addSymbolsToAlertPool((state.financialResults || []).map((row) => row.symbol).filter(Boolean), { forceFmp: true });
});
el.btnClearFinancialAi.addEventListener("click", () => {
  clearFinancialAiOutput();
  appendLog("已清空 AI 解读");
});

el.btnLoadConfig.addEventListener("click", async () => {
  state.config = await window.api.loadConfig();
  setInputsFromConfig(state.config);
  appendLog("配置已重新加载");
});
el.btnSaveConfig.addEventListener("click", async () => {
  const cfg = getConfigFromInputs();
  await window.api.saveConfig(cfg);
  state.config = cfg;
  appendLog("定时配置已保存");
});
el.btnLoadConfig2.addEventListener("click", async () => {
  state.config = await window.api.loadConfig();
  setInputsFromConfig(state.config);
  appendLog("配置已重新加载");
});
el.btnSaveConfig2.addEventListener("click", async () => {
  const cfg = getConfigFromInputs();
  await window.api.saveConfig(cfg);
  state.config = cfg;
  updateScreenerUI();
  appendLog("配置已保存");
});

el.btnAddRule.addEventListener("click", () => openRuleModal(null, buildFmpDefaultRuleSeed()));
el.btnModalCancel.addEventListener("click", closeRuleModal);
el.modal.addEventListener("click", (evt) => {
  if (evt.target === el.modal) closeRuleModal();
});
el.btnModalSave.addEventListener("click", () => {
  const enabled = el.ruleEnabled.value === "true";
  const name = String(el.ruleName.value || "").trim() || "未命名规则";
  const universeType = String(el.ruleUniverse.value || "manual");
  const symbols = universeType === "manual" ? parseSymbols(el.ruleSymbols.value) : [];
  const groupOp = String(el.ruleGroupOp.value || "and").toLowerCase() === "or" ? "or" : "and";
  const cooldownSec = Number.parseInt(String(el.ruleCooldownSec.value || "0"), 10);
  const notifyEmail = String(el.ruleEmailTo.value || "").trim();
  const notifyWebhook = String(el.ruleWebhookUrl.value || "").trim();

  if (universeType === "manual" && symbols.length === 0) {
    alert("请至少填写一个股票代码，或将标的范围切换为“全量美股（按市值从高到低，固定前N）”");
    return;
  }

  const items = Array.isArray(state.modalConditions) ? state.modalConditions : [];
  if (items.length === 0) {
    alert("请至少添加一个条件");
    return;
  }

  for (const it of items) {
    if (conditionTypeNeedsValue(it.type) && (it.value === null || it.value === undefined || it.value === "")) {
      alert("存在未填写阈值的条件");
      return;
    }
  }

  const conds = items.map((it) => conditionFromUI(it.type, conditionTypeNeedsValue(it.type) ? it.value : 0));
  const condition = conds.length === 1 ? conds[0] : { op: groupOp, args: conds };
  const ui = { groupOp, items: items.map((it) => ({ type: it.type, value: conditionTypeNeedsValue(it.type) ? it.value : null })) };
  const universe = universeType === "us_all"
    ? {
      type: "us_all",
      maxScan: Number.isFinite(Number(el.ruleUniverseMaxScan.value)) ? Number(el.ruleUniverseMaxScan.value) : 2000,
      minPrice: el.ruleUniverseMinPrice.value === "" ? null : Number(el.ruleUniverseMinPrice.value),
      minMarketCap: el.ruleUniverseMinMarketCap.value === "" ? null : Number(el.ruleUniverseMinMarketCap.value),
      minTurnoverM: el.ruleUniverseMinTurnoverM.value === "" ? null : Number(el.ruleUniverseMinTurnoverM.value),
      requireRecent5dCloseAth: String(el.ruleUniverseRecent5dCloseAth.value || "true") === "true",
      minVolumeRatio: el.ruleUniverseMinVolumeRatio.value === "" ? null : Number(el.ruleUniverseMinVolumeRatio.value)
    }
    : { type: "manual" };
  const next = {
    enabled,
    name,
    symbols,
    cooldownSec: Number.isFinite(cooldownSec) ? cooldownSec : 0,
    notify: {
      ...(notifyEmail ? { email: notifyEmail } : {}),
      ...(notifyWebhook ? { webhookUrl: notifyWebhook } : {})
    },
    ui,
    condition,
    universe
  };

  if (state.editingIndex === null) state.rules.unshift(next);
  else state.rules[state.editingIndex] = next;

  syncAdvancedJSON();
  renderRulesList();
  closeRuleModal();
});

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
  state.rules = templateRules();
  syncAdvancedJSON();
  renderRulesList();
  appendLog("已插入模板规则（未自动保存）");
});

el.btnSaveRulesFromJson.addEventListener("click", async () => {
  const parsed = safeParseJSON(el.rulesJson.value);
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    appendLog(`高级内容无效：${parsed.ok ? "必须是数组" : parsed.error}`);
    return;
  }
  state.rules = parsed.value;
  await window.api.saveRules(state.rules);
  renderRulesList();
  appendLog("高级内容已保存");
});

el.csvFile.addEventListener("change", async () => {
  const file = el.csvFile.files && el.csvFile.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const symbols = [];
  for (const line of lines) {
    const first = line.split(",")[0];
    const s = String(first || "").trim().toUpperCase();
    if (s && /^[A-Z.\-]+$/.test(s)) symbols.push(s);
  }
  el.screenerSymbols.value = Array.from(new Set(symbols)).join("\n");
  appendLog(`已导入 ${symbols.length} 个 symbols`);
});

function renderScreenerTable(rows) {
  if (!rows || rows.length === 0) {
    el.screenerTable.innerHTML = "";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  const isFmp = String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";
  const headers = isFmp
    ? ["选择", "代码", "价格", "收盘市值（百万美元）", "成交额（百万美元）", "5日股价新高", "操作"]
    : ["代码", "价格", "涨跌幅", "市值", "市盈率", "量比"];
  headers.forEach((h) => {
    const th = document.createElement("th");
    if (isFmp && h === "选择") {
      const master = document.createElement("input");
      master.type = "checkbox";
      const allSelected = rows.length > 0 && rows.every((r) => state.screenerSelected.includes(r.symbol));
      master.checked = allSelected;
      master.addEventListener("change", () => {
        state.screenerSelected = master.checked ? rows.map((r) => r.symbol) : [];
        renderScreenerTable(rows);
      });
      th.appendChild(master);
    } else {
      th.textContent = h;
    }
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const td = (v) => {
      const c = document.createElement("td");
      c.textContent = v === null || v === undefined ? "" : String(v);
      return c;
    };
    if (isFmp) {
      const pick = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.screenerSelected.includes(r.symbol);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.screenerSelected = Array.from(new Set([...state.screenerSelected, r.symbol]));
        } else {
          state.screenerSelected = state.screenerSelected.filter((sym) => sym !== r.symbol);
        }
      });
      pick.appendChild(checkbox);
      tr.appendChild(pick);
      tr.appendChild(td(r.symbol));
      tr.appendChild(td(r.price?.toFixed ? r.price.toFixed(2) : r.price));
      tr.appendChild(td(r.marketCap?.toFixed ? r.marketCap.toFixed(2) : r.marketCap));
      tr.appendChild(td(r.turnoverM?.toFixed ? r.turnoverM.toFixed(2) : r.turnoverM));
      tr.appendChild(td(r.recent5dCloseAth ? "是" : "否"));
      const actionTd = document.createElement("td");
      const addBtn = document.createElement("button");
      addBtn.textContent = "加入提醒池";
      addBtn.addEventListener("click", async () => {
        await addSymbolsToAlertPool([r.symbol]);
      });
      actionTd.appendChild(addBtn);
      tr.appendChild(actionTd);
    } else {
      tr.appendChild(td(r.symbol));
      tr.appendChild(td(r.price?.toFixed ? r.price.toFixed(2) : r.price));
      tr.appendChild(td(r.changePercent?.toFixed ? r.changePercent.toFixed(2) : r.changePercent));
      tr.appendChild(td(r.marketCap));
      tr.appendChild(td(r.peTTM));
      tr.appendChild(td(r.volumeRatio?.toFixed ? r.volumeRatio.toFixed(2) : r.volumeRatio));
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  el.screenerTable.innerHTML = "";
  el.screenerTable.appendChild(table);
}

function renderFinancialTable(rows) {
  el.financialTable.innerHTML = "";
  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "暂无命中结果。可先降低门槛，或减少扫描范围后再试。";
    el.financialTable.appendChild(empty);
    return;
  }

  const fmtNum = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(Number(value)) ? "-" : Number(value).toFixed(digits));
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>股票</th>
        <th>公司</th>
        <th>报告期</th>
        <th>营收同比</th>
        <th>毛利率</th>
        <th>EBITDA</th>
        <th>EBITDA同比</th>
        <th>EBITDA利润率</th>
        <th>经营利润率</th>
        <th>经营现金流</th>
        <th>自由现金流</th>
        <th>负债权益比</th>
        <th>命中原因</th>
        <th>AI</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.symbol || "-"}</td>
      <td>${row.companyName || "-"}</td>
      <td>${row.reportDate || "-"}</td>
      <td>${fmtNum(row.revenueGrowthYoY)}%</td>
      <td>${fmtNum(row.grossMargin)}%</td>
      <td>${fmtNum(row.ebitdaM, 0)}M</td>
      <td>${fmtNum(row.ebitdaGrowthYoY)}%</td>
      <td>${fmtNum(row.ebitdaMargin)}%</td>
      <td>${fmtNum(row.operatingMargin)}%</td>
      <td>${fmtNum(row.operatingCashFlowM, 0)}M</td>
      <td>${fmtNum(row.freeCashFlowM, 0)}M</td>
      <td>${fmtNum(row.debtToEquity, 2)}x</td>
      <td>${Array.isArray(row.reasons) ? row.reasons.join("；") : "-"}</td>
    `;
    const actionTd = document.createElement("td");
    const explainBtn = document.createElement("button");
    explainBtn.textContent = "AI解读";
    explainBtn.disabled = state.financialAiBusy;
    explainBtn.addEventListener("click", async () => {
      await explainFinancialRow(row);
      renderFinancialTable(rows);
    });
    actionTd.appendChild(explainBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  el.financialTable.appendChild(table);
}

el.btnRunFinancialScreener.addEventListener("click", async () => {
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
    clearFinancialAiOutput();
    const res = await window.api.runFinancialScreener({ symbols, criteria });
    const rows = res && typeof res === "object" ? res.rows : res;
    const meta = res && typeof res === "object" ? res.meta : null;
    state.financialResults = Array.isArray(rows) ? rows : [];
    if (meta) {
      const updated = meta.universeUpdatedAt ? `（列表更新：${meta.universeUpdatedAt}）` : "";
      const orderText = meta.order === "marketCap_desc" ? "，顺序=市值从高到低" : "";
      const sourceText = meta.universeSource ? `，候选池=${meta.universeSource}` : "";
      el.financialSummary.textContent = `本次扫描 ${meta.scannedCount ?? 0} 支，命中 ${state.financialResults.length} 支${orderText}${sourceText} ${updated}`;
    } else {
      el.financialSummary.textContent = `财报筛选结果：${state.financialResults.length}`;
    }
    renderFinancialTable(state.financialResults);
    appendLog("财报筛选：执行完成");
  } catch (e) {
    state.financialResults = [];
    renderFinancialTable([]);
    el.financialSummary.textContent = "";
    appendLog(`财报筛选失败：${e instanceof Error ? e.message : String(e)}`);
  }
});

el.btnRunScreener.addEventListener("click", async () => {
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
  if (meta) {
    const total = meta.totalSymbols ?? 0;
    const updated = meta.universeUpdatedAt ? `（列表更新：${meta.universeUpdatedAt}）` : "";
    const orderText = meta.order === "marketCap_desc" ? "，顺序=市值从高到低" : "";
    const sourceText = meta.universeSource ? `，候选池=${meta.universeSource}` : "";
    el.screenerSummary.textContent = `本次固定扫描前 ${meta.scannedCount ?? 0} 支 / 总计 ${total}，命中 ${state.screenerResults.length}${orderText}${sourceText} ${updated}`;
  } else {
    el.screenerSummary.textContent = `筛选结果：${state.screenerResults.length}`;
  }
  renderScreenerTable(state.screenerResults);
  appendLog("筛选：执行完成");
});

el.btnRefreshUniverse.addEventListener("click", async () => {
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
});

el.btnScreenerToRule.addEventListener("click", () => {
  const syms = (state.screenerResults || []).map((r) => r.symbol).filter(Boolean);
  if (syms.length === 0) {
    appendLog("没有筛选结果可用于创建规则");
    return;
  }
  const isFmp = String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";
  openRuleModal(null, {
    enabled: true,
    name: isFmp ? "默认规则候选提醒" : "筛选结果提醒",
    symbols: syms.slice(0, 80),
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
  });
  showTab("rules");
});

el.btnDryRunOnce.addEventListener("click", async () => {
  if (state.runBusy) {
    appendLog("当前已有运行任务进行中，请稍候。");
    return;
  }
  setRunButtonsBusy(true);
  appendLog("开始模拟运行...");
  if (String(el.dataProvider.value || "finnhub") === "fmp") {
    appendLog("当前为 FMP 模式：首次冷启动可能需要数分钟，日志会持续刷新进度。");
  }
  try {
    await window.api.runOnce({ dryRun: true });
    appendLog("模拟运行完成");
  } catch (e) {
    appendLog(`模拟运行失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setRunButtonsBusy(false);
  }
});

el.btnRunOnce.addEventListener("click", async () => {
  if (state.runBusy) {
    appendLog("当前已有运行任务进行中，请稍候。");
    return;
  }
  setRunButtonsBusy(true);
  appendLog("开始真实跑一次...");
  try {
    await window.api.runOnce({ dryRun: false });
    appendLog("执行完成");
  } catch (e) {
    appendLog(`执行失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setRunButtonsBusy(false);
  }
});

el.btnStart.addEventListener("click", async () => {
  if (state.runBusy) {
    appendLog("当前已有运行任务进行中，请稍候。");
    return;
  }
  await window.api.start();
  appendLog("已启动常驻");
});

el.btnStop.addEventListener("click", async () => {
  await window.api.stop();
  appendLog("已停止");
});

el.btnResetTestData.addEventListener("click", async () => {
  const ok = confirm("将删除当前数据目录中的配置、规则、状态和事件文件，用于重新做一轮干净测试。是否继续？");
  if (!ok) return;
  try {
    const res = await window.api.resetTestData();
    appendLog(`测试数据已重置：${res?.base || "当前目录"}`);
    el.log.textContent = "";
    appendLog("已清空测试数据并重新加载默认状态。");
    await loadAll();
  } catch (e) {
    appendLog(`重置测试数据失败：${e instanceof Error ? e.message : String(e)}`);
  }
});

window.api.onLog(({ line }) => appendLog(line));
window.api.onEvent((evt) => appendLog(`提醒事件 ${evt.symbol} ${evt.conditionText}`));

showTab("rules");
loadAll().catch((e) => appendLog(e instanceof Error ? e.message : String(e)));
