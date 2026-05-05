import { createAiPanelController } from "./ai-panel-controller.mjs";
import { createAlertPoolController } from "./alert-pool-controller.mjs";
import { parseSymbols } from "./common.mjs";
import { createConfigController } from "./config-controller.mjs";
import { createRendererBootstrapController } from "./renderer-bootstrap-controller.mjs";
import { createResultsController } from "./results-controller.mjs";
import { buildFmpDefaultRuleSeed } from "./rule-condition-mapper.mjs";
import { createRuleEditorController } from "./rule-editor-controller.mjs";
import { createRulesListController } from "./rules-list-controller.mjs";
import { createRunController } from "./run-controller.mjs";
import { createUiVisibilityController } from "./ui-visibility-controller.mjs";
import { createWorkspaceBindingsController } from "./workspace-bindings-controller.mjs";

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
  financialEstimate: $("financialEstimate"),
  financialSummary: $("financialSummary"),
  financialTable: $("financialTable"),
  aiPanelMeta: $("aiPanelMeta"),
  aiPanelStatus: $("aiPanelStatus"),
  aiPanelOutput: $("aiPanelOutput"),
  btnClearAiPanel: $("btnClearAiPanel"),

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
  aiPanelResult: null,
  aiPanelBusy: false,
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

function logAiFormMapping(result) {
  if (result?.meta?.taskMode !== "builder") return;
  const mapping = result?.formMapping;
  const intents = Array.isArray(mapping?.intents) ? mapping.intents : [];
  if (intents.length === 0) return;

  const summary = intents
    .map((intent) => {
      const warningText = Array.isArray(intent.warnings) && intent.warnings.length > 0
        ? `，警告=${intent.warnings.join(" / ")}`
        : "";
      return `${intent.target}(${intent.mode || "patch"})${warningText}`;
    })
    .join("；");
  appendLog(`AI 表单映射建议已生成：${summary}`);
}

const configController = createConfigController({ el });
const {
  getConfigFromInputs,
  setInputsFromConfig,
  updateAiConfigUI,
  updateScheduleUI
} = configController;

const getIsFmpProvider = () => String(el.dataProvider.value || "fmp").toLowerCase() === "fmp";

function syncAdvancedJSON() {
  el.rulesJson.value = JSON.stringify(state.rules, null, 2);
}

function buildTemplateRules() {
  return [buildFmpDefaultRuleSeed()];
}

let renderRulesList = () => {};
let renderScreenerTable = () => {};
let renderFinancialTable = () => {};

const { addSymbolsToAlertPool } = createAlertPoolController({
  el,
  state,
  appendLog,
  syncAdvancedJSON,
  renderRulesList: () => renderRulesList()
});

const uiVisibilityController = createUiVisibilityController({
  el,
  state,
  getIsFmpProvider
});
const {
  applyDefaultFmpScreenerPreset,
  applyFinancialPreset,
  showTab,
  updateFinancialEstimate,
  updateFinancialUI,
  updateScreenerEstimate,
  updateScreenerUI,
  updateUniverseUI
} = uiVisibilityController;

const { runOnce, start, stop } = createRunController({
  el,
  state,
  appendLog
});

const { addCondition, closeRuleModal, openRuleModal, saveRuleFromModal } = createRuleEditorController({
  el,
  state,
  parseSymbols,
  getIsFmpProvider,
  updateUniverseUI,
  syncAdvancedJSON,
  renderRulesList: () => renderRulesList()
});

function rerenderAiActionSources() {
  renderRulesList();
  renderScreenerTable(state.screenerResults || []);
  renderFinancialTable(state.financialResults || []);
}

const { buildAiTarget, clearAiPanel, explainAiTarget } = createAiPanelController({
  el,
  state,
  appendLog,
  rerenderAiActionSources,
  onAiResult: (result) => logAiFormMapping(result)
});

const resultsController = createResultsController({
  el,
  state,
  getIsFmpProvider,
  addSymbolsToAlertPool,
  explainAiTarget,
  buildAiTarget
});
renderScreenerTable = resultsController.renderScreenerTable;
renderFinancialTable = resultsController.renderFinancialTable;

const rulesListController = createRulesListController({
  el,
  state,
  syncAdvancedJSON,
  openRuleModal,
  explainAiTarget,
  buildAiTarget
});
renderRulesList = rulesListController.renderRulesList;

const { bindRuntimeStreams, loadAll } = createRendererBootstrapController({
  el,
  state,
  setInputsFromConfig,
  buildTemplateRules,
  syncAdvancedJSON,
  renderRulesList,
  updateScreenerUI,
  updateFinancialUI
});

const { bind } = createWorkspaceBindingsController({
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
});

bindRuntimeStreams({ appendLog });
bind();
showTab("rules");
loadAll().catch((error) => appendLog(error instanceof Error ? error.message : String(error)));
