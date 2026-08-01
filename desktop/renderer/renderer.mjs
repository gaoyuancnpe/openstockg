import { createAiPanelController } from "./ai-panel-controller.mjs";
import { createAlertPoolController } from "./alert-pool-controller.mjs";
import { parseSymbols } from "./common.mjs";
import { createConfigController } from "./config-controller.mjs";
import { createRendererBootstrapController } from "./renderer-bootstrap-controller.mjs";
import { createResultsController } from "./results-controller.mjs";
import { buildTemplateRules } from "./rule-condition-mapper.mjs";
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
  tabMarketAmv: $("tabMarketAmv"),
  panelRules: $("panelRules"),
  panelScreener: $("panelScreener"),
  panelFinancial: $("panelFinancial"),
  panelSchedule: $("panelSchedule"),
  panelConfig: $("panelConfig"),
  panelMarketAmv: $("panelMarketAmv"),
  marketAmvResult: $("marketAmvResult"),
  btnComputeMarketAmv: $("btnComputeMarketAmv"),
  marketAmvHistoryList: $("marketAmvHistoryList"),
  marketAmvIndex: $("marketAmvIndex"),
  marketAmvLimit: $("marketAmvLimit"),
  marketAmvBackfillProgress: $("marketAmvBackfillProgress"),
  btnBackfillMarketAmv: $("btnBackfillMarketAmv"),
  btnCancelBackfillMarketAmv: $("btnCancelBackfillMarketAmv"),
  btnRefreshBackfillState: $("btnRefreshBackfillState"),

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
  feishuEnabled: $("feishuEnabled"),
  feishuAppId: $("feishuAppId"),
  feishuAppSecret: $("feishuAppSecret"),
  feishuAllowOpenIds: $("feishuAllowOpenIds"),
  feishuRequireAllowlist: $("feishuRequireAllowlist"),
  feishuAllowRemoteApply: $("feishuAllowRemoteApply"),
  feishuConfirmTtlSec: $("feishuConfirmTtlSec"),
  defaultEmailTo: $("defaultEmailTo"),
  defaultWebhookType: $("defaultWebhookType"),
  defaultWebhookUrl: $("defaultWebhookUrl"),
  gmailUser: $("gmailUser"),
  gmailPass: $("gmailPass"),
  cfgEmailHost: $("cfgEmailHost"),
  cfgEmailPort: $("cfgEmailPort"),

  scheduleMode: $("scheduleMode"),
  scheduleIntervalSec: $("scheduleIntervalSec"),
  scheduleDailyTime: $("scheduleDailyTime"),
  scheduleWeekdaysOnly: $("scheduleWeekdaysOnly"),
  cfgSchedulerUsMarketHoursOnly: $("cfgSchedulerUsMarketHoursOnly"),
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
  btnExportRules: $("btnExportRules"),
  btnImportRules: $("btnImportRules"),
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
  btnApplyScreenerDefaults: $("btnApplyScreenerDefaults"),
  btnRunScreener: $("btnRunScreener"),
  btnScreenerAddToPool: $("btnScreenerAddToPool"),
  btnScreenerCreateRule: $("btnScreenerCreateRule"),
  btnExportScreenerCsv: $("btnExportScreenerCsv"),
  btnRefreshUsList: $("btnRefreshUsList"),
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
  btnFinancialAddSelected: $("btnFinancialAddSelected"),
  financialEstimate: $("financialEstimate"),
  financialSummary: $("financialSummary"),
  financialTable: $("financialTable"),
  aiPanelMeta: $("aiPanelMeta"),
  aiPanelStatus: $("aiPanelStatus"),
  aiPanelIntentHint: $("aiPanelIntentHint"),
  aiPanelIntentActions: $("aiPanelIntentActions"),
  aiPanelMessages: $("aiPanelMessages"),
  aiProposalList: $("aiProposalList"),
  btnRefreshProposals: $("btnRefreshProposals"),
  aiPanelInput: $("aiPanelInput"),
  btnAiSend: $("btnAiSend"),
  btnAiBuild: $("btnAiBuild"),
  btnClearAiPanel: $("btnClearAiPanel"),
  btnAiAssistantMode: $("btnAiAssistantMode"),
  btnClearAiAttachments: $("btnClearAiAttachments"),
  btnAiAttachRules: $("btnAiAttachRules"),
  btnAiAttachSchedule: $("btnAiAttachSchedule"),
  btnAiAttachLastRun: $("btnAiAttachLastRun"),
  btnAiAttachLog: $("btnAiAttachLog"),
  btnAiAttachScreener: $("btnAiAttachScreener"),
  btnAiAttachFinancial: $("btnAiAttachFinancial"),
  aiPanelAttachmentMeta: $("aiPanelAttachmentMeta"),

  btnDryRunOnce: $("btnDryRunOnce"),
  btnRunOnce: $("btnRunOnce"),
  btnRunOnceIgnoreCooldown: $("btnRunOnceIgnoreCooldown"),
  btnStart: $("btnStart"),
  btnStop: $("btnStop"),
  btnResetTestData: $("btnResetTestData"),
  btnReloadDiagnostics: $("btnReloadDiagnostics"),
  btnTestEmail: $("btnTestEmail"),
  btnTestWebhook: $("btnTestWebhook"),
  btnOpenLogDir: $("btnOpenLogDir"),
  logFilterType: $("logFilterType"),
  logFilterRule: $("logFilterRule"),
  logFilterKeyword: $("logFilterKeyword"),
  btnClearLog: $("btnClearLog"),
  log: $("log"),
  devModeInfo: $("devModeInfo"),
  paths: $("paths"),
  lastRunSummary: $("lastRunSummary"),
  schedulerSummary: $("schedulerSummary"),
  feishuBridgeStatus: $("feishuBridgeStatus"),
  diagnosticsMeta: $("diagnosticsMeta"),
  scheduleRuntimeStatus: $("scheduleRuntimeStatus"),
  scheduleRuntimeDetails: $("scheduleRuntimeDetails"),
  scheduleRuntimeHint: $("scheduleRuntimeHint"),
  btnOpenSourceRepo: $("btnOpenSourceRepo"),
  btnOpenUpstreamRepo: $("btnOpenUpstreamRepo"),
  btnOpenLicenseUrl: $("btnOpenLicenseUrl"),
  legalSummary: $("legalSummary"),
  legalNoticeText: $("legalNoticeText"),

  modal: $("modal"),
  modalTitle: $("modalTitle"),
  rulePresetHint: $("rulePresetHint"),
  ruleTemplate: $("ruleTemplate"),
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
  ruleFieldHint: $("ruleFieldHint"),
  ruleCooldownSec: $("ruleCooldownSec"),
  ruleEmailTo: $("ruleEmailTo"),
  ruleWebhookType: $("ruleWebhookType"),
  ruleWebhookUrl: $("ruleWebhookUrl"),
  btnModalSave: $("btnModalSave"),
  btnModalCancel: $("btnModalCancel"),
  alertHistoryList: $("alertHistoryList"),
  btnRefreshAlertHistory: $("btnRefreshAlertHistory")
};

const state = {
  config: null,
  rules: [],
  screenerResults: [],
  screenerSelected: [],
  financialSelected: [],
  financialResults: [],
  aiPanelResult: null,
  aiPanelContext: null,
  aiPanelMessages: [],
  aiPanelAttachments: [],
  aiPanelBusy: false,
  modalForceFmp: false,
  modalTemplateKey: "custom",
  editingIndex: null,
  modalConditions: [],
  runBusy: false,
  logEntries: [],
  diagnostics: null
};

function formatRunSummary(lastRun) {
  if (!lastRun || typeof lastRun !== "object") return "最近一次运行：暂无记录";
  const phase = String(lastRun.phase || "");
  const provider = String(lastRun.dataProvider || "").toUpperCase();
  const trigger = String(lastRun.trigger || "manual");
  const triggerText = trigger === "scheduler_catchup"
    ? "补跑"
    : (trigger === "scheduler" || trigger === "scheduler_resume" ? "定时" : "手动");
  const base = [
    `最近一次运行：${phase === "started" ? "进行中" : (phase === "finished" ? "已完成" : "失败")}`,
    (lastRun.finishedAt || lastRun.startedAt) ? `时间=${formatTimeText(lastRun.finishedAt || lastRun.startedAt, "未知")}` : "",
    `来源=${triggerText}`,
    provider ? `数据源=${provider}` : "",
    Number.isFinite(lastRun.totalRules) ? `总规则=${lastRun.totalRules}` : "",
    Number.isFinite(lastRun.completedRules) ? `完成=${lastRun.completedRules}` : "",
    Number.isFinite(lastRun.failedRules) ? `失败=${lastRun.failedRules}` : "",
    lastRun.dryRun ? "模式=dry-run" : `模式=${lastRun.ignoreCooldown ? "真实执行（忽略冷却）" : "真实执行"}`
  ].filter(Boolean);
  const failedNames = Array.isArray(lastRun.failedRuleNames) && lastRun.failedRuleNames.length > 0
    ? `；失败规则=${lastRun.failedRuleNames.join("、")}`
    : "";
  const errorText = lastRun.error ? `；错误=${lastRun.error}` : "";
  return `${base.join("，")}${failedNames}${errorText}`;
}

function formatTimeText(value, fallback = "暂无") {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSchedulerSummary(scheduler) {
  if (!scheduler || typeof scheduler !== "object") {
    return {
      status: "常驻状态：未启动",
      details: "模式：未调度\n下一次执行：未调度\n最近一次执行：暂无\n最近一次跳过：暂无",
      hint: "未启动常驻时不会触发定时任务。",
      runtime: "当前常驻：未启动"
    };
  }
  const mode = String(scheduler.mode || "interval") === "daily" ? "daily" : "interval";
  const modeText = mode === "daily" ? "每日定时" : "间隔执行";
  const isRunning = Boolean(scheduler.isRunning);
  const lastSkip = scheduler.lastSkip || null;
  const lastStopReason = scheduler.lastStopReason || null;
  const lastMissedRun = scheduler.lastMissedRun || null;
  const lastCatchUp = scheduler.lastCatchUp || null;
  const skipText = lastSkip?.message
    ? `${lastSkip.message}（${formatTimeText(lastSkip.at, "时间未知")}）`
    : (lastStopReason?.message ? `${lastStopReason.message}（${formatTimeText(lastStopReason.at, "时间未知")}）` : "暂无");
  const missedText = lastMissedRun?.message
    ? `${lastMissedRun.message}（${formatTimeText(lastMissedRun.at, "时间未知")}）`
    : "暂无";
  const catchUpText = lastCatchUp?.message
    ? `${lastCatchUp.message}（${formatTimeText(lastCatchUp.at, "时间未知")}）`
    : "暂无";

  return {
    status: `常驻状态：${isRunning ? "运行中" : "未启动"}`,
    details: [
      `模式：${modeText}`,
      `下一次执行：${isRunning ? formatTimeText(scheduler.nextRunAt, "未调度") : "未调度"}`,
      `最近一次执行：${formatTimeText(scheduler.lastRunAt, "暂无")}`,
      `最近一次跳过/停止原因：${skipText}`,
      `最近一次错过执行：${missedText}`,
      `最近一次补跑：${catchUpText}`
    ].join("\n"),
    hint: isRunning
      ? (mode === "daily"
        ? "当前为 daily 模式：启动后等待到下一次设定时间才会触发。"
        : "当前为 interval 模式：启动后立即执行一轮，并按固定间隔继续调度。")
      : "未启动常驻时不会触发定时任务。",
    runtime: [
      `当前常驻：${isRunning ? "运行中" : "未启动"}`,
      `模式=${modeText}`,
      `下次执行=${isRunning ? formatTimeText(scheduler.nextRunAt, "未调度") : "未调度"}`,
      `最近执行=${formatTimeText(scheduler.lastRunAt, "暂无")}`,
      `最近跳过/停止=${skipText}`,
      `最近错过=${missedText}`,
      `最近补跑=${catchUpText}`
    ].join("，")
  };
}

function formatFeishuBridgeSummary(bridge) {
  if (!bridge || typeof bridge !== "object") {
    return "飞书桥接：未启用";
  }
  const statusText = bridge.isRunning ? "运行中" : (bridge.isEnabled ? "未连接" : "未启用");
  const parts = [
    `飞书桥接：${statusText}`,
    `远程确认直写=${bridge.allowRemoteApply ? "开启" : "关闭"}`,
    `allowlist=${bridge.requireAllowlist ? "强制" : "可选"}`,
    Number.isFinite(bridge.allowedUsersCount) ? `允许用户数=${bridge.allowedUsersCount}` : "",
    bridge.lastConnectedAt ? `最近连接=${formatTimeText(bridge.lastConnectedAt, "暂无")}` : "",
    bridge.lastError ? `错误=${bridge.lastError}` : ""
  ].filter(Boolean);
  return parts.join("，");
}

function renderDiagnosticsSummary() {
  if (el.lastRunSummary) {
    el.lastRunSummary.textContent = formatRunSummary(state.diagnostics?.lastRun);
  }
  const schedulerSummary = formatSchedulerSummary(state.diagnostics?.scheduler);
  if (el.schedulerSummary) {
    el.schedulerSummary.textContent = schedulerSummary.runtime;
  }
  if (el.feishuBridgeStatus) {
    el.feishuBridgeStatus.textContent = formatFeishuBridgeSummary(state.diagnostics?.feishuBridge);
  }
  if (el.scheduleRuntimeStatus) {
    el.scheduleRuntimeStatus.textContent = schedulerSummary.status;
  }
  if (el.scheduleRuntimeDetails) {
    el.scheduleRuntimeDetails.textContent = schedulerSummary.details;
  }
  if (el.scheduleRuntimeHint) {
    el.scheduleRuntimeHint.textContent = schedulerSummary.hint;
  }
  if (el.diagnosticsMeta) {
    const info = state.diagnostics || {};
    const parts = [];
    if (info.runtimeLog) parts.push(`运行日志：${info.runtimeLog}`);
    if (info.diagnosticsFile) parts.push(`诊断文件：${info.diagnosticsFile}`);
    if (info.updatedAt) parts.push(`更新：${info.updatedAt}`);
    el.diagnosticsMeta.textContent = parts.join("\n");
  }
}

function renderProposalList(proposals) {
  if (!el.aiProposalList) return;
  if (!Array.isArray(proposals) || proposals.length === 0) {
    el.aiProposalList.innerHTML = "<div>暂无 Proposal</div>";
    return;
  }
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  el.aiProposalList.innerHTML = proposals.map((p) => {
    const status = escapeHtml(p?.status || "unknown");
    const id = escapeHtml(p?.id || "");
    const expiresAt = p?.expiresAt ? escapeHtml(new Date(p.expiresAt).toLocaleString()) : "";
    const intents = escapeHtml((Array.isArray(p?.intents) ? p.intents : []).map((i) => i?.target || "").join(", "));
    const isPending = String(p?.status || "").toLowerCase() === "pending";
    const actions = isPending
      ? `<button type="button" class="proposalActionBtn" data-action="apply" data-id="${id}">接受</button><button type="button" class="proposalActionBtn" data-action="reject" data-id="${id}">拒绝</button>`
      : "";
    return `<div class="historyItem"><span>[${status}] ${id}</span>${expiresAt ? `<span class="muted"> | 过期：${expiresAt}</span>` : ""}${intents ? `<span class="muted"> | 目标：${intents}</span>` : ""}${actions}</div>`;
  }).join("");
  el.aiProposalList.querySelectorAll(".proposalActionBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      const proposalId = btn.getAttribute("data-id");
      const proposal = proposals.find((item) => String(item?.id || "") === String(proposalId || ""));
      const token = proposal?.token || "";
      btn.disabled = true;
      try {
        if (action === "apply") {
          await window.api.agent.applyProposal({ proposalId, token });
        } else if (action === "reject") {
          await window.api.agent.rejectProposal({ proposalId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendLog(`Proposal ${action === "apply" ? "接受" : "拒绝"}失败：${message}`);
        btn.disabled = false;
        return;
      }
      refreshProposalList();
    });
  });
}

function refreshProposalList() {
  if (!window.api?.agent?.listProposals) return;
  window.api.agent.listProposals()
    .then((proposals) => renderProposalList(proposals))
    .catch((err) => {
      if (el.aiProposalList) {
        el.aiProposalList.textContent = `加载失败：${err instanceof Error ? err.message : String(err)}`;
      }
    });
}

function renderAlertHistory(events) {
  if (!el.alertHistoryList) return;
  if (!Array.isArray(events) || events.length === 0) {
    el.alertHistoryList.innerHTML = "<div>暂无命中记录</div>";
    return;
  }
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const recent = events.slice().reverse();
  el.alertHistoryList.innerHTML = recent.map((evt) => {
    const time = escapeHtml(evt?.matchedAt ? new Date(evt.matchedAt).toLocaleString() : "-");
    const ruleName = escapeHtml(evt?.rule?.name || "-");
    const symbol = escapeHtml(evt?.symbol || "-");
    const evidence = Array.isArray(evt?.evaluationSummary?.evidenceLines)
      ? evt.evaluationSummary.evidenceLines.slice(0, 2).join("；")
      : "";
    return `<div class="historyItem"><span class="muted">${time}</span> | <strong>${symbol}</strong> | ${ruleName}${evidence ? ` | ${escapeHtml(evidence)}` : ""}</div>`;
  }).join("");
}

function refreshAlertHistory() {
  if (!window.api?.events?.load) return;
  window.api.events.load({ limit: 50 })
    .then((events) => renderAlertHistory(events))
    .catch((err) => {
      if (el.alertHistoryList) {
        el.alertHistoryList.textContent = `加载失败：${err instanceof Error ? err.message : String(err)}`;
      }
    });
}

function renderMarketAmvHistory(history) {
  if (!el.marketAmvHistoryList) return;
  if (!Array.isArray(history) || history.length === 0) {
    el.marketAmvHistoryList.innerHTML = "<div>暂无历史数据</div>";
    return;
  }
  const indexLabel = (idx) => ({ sp500: "S&P500", nasdaq: "Nasdaq", all: "全市场" })[idx] || "全市场";
  const rows = history.slice().reverse();
  let prevValue = null;
  el.marketAmvHistoryList.innerHTML = rows.map((entry) => {
    const date = String(entry?.date || "-");
    const value = Number(entry?.value || 0);
    const valueStr = value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    const idxTag = indexLabel(entry?.index);
    let changeStr = "-";
    if (prevValue !== null && prevValue !== 0) {
      const change = ((value - prevValue) / prevValue) * 100;
      const sign = change >= 0 ? "+" : "";
      changeStr = `${sign}${change.toFixed(2)}%`;
    }
    prevValue = value;
    return `<div class="historyItemCompact">[${idxTag}] ${date} | ${valueStr} 百万 | ${changeStr}</div>`;
  }).join("");
}

function refreshMarketAmvHistory() {
  if (!window.api?.engine?.loadMarketAmvHistory) return;
  const index = el.marketAmvIndex?.value || "all";
  window.api.engine.loadMarketAmvHistory({ index })
    .then((history) => renderMarketAmvHistory(history))
    .catch((err) => {
      if (el.marketAmvHistoryList) {
        el.marketAmvHistoryList.textContent = `加载失败：${err instanceof Error ? err.message : String(err)}`;
      }
    });
}

async function loadDiagnosticsSummary() {
  try {
    state.diagnostics = await window.api.getDiagnostics();
    renderDiagnosticsSummary();
  } catch (error) {
    appendLog(`读取诊断信息失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function reportRendererError(kind, errorLike) {
  try {
    await window.api.reportRendererError({
      kind,
      message: errorLike instanceof Error ? errorLike.message : String(errorLike || kind),
      stack: errorLike instanceof Error ? String(errorLike.stack || "") : ""
    });
  } catch {}
}

function detectLogType(message) {
  const text = String(message || "");
  if (/error|失败|ETIMEDOUT|ECONN|HTTP \d{3}|未配置|缺少/i.test(text)) return "error";
  if (/Email |邮件|SMTP|summary sent|queued|fallback sent/i.test(text)) return "email";
  if (/提醒事件|Webhook/i.test(text)) return "event";
  if (/FMP /i.test(text)) return "fmp";
  if (/规则 |MATCHED|FIRED|冷却|命中|跳过/.test(text)) return "rule";
  if (/开始执行|执行完成|已启动常驻|已停止|dry-run|模拟运行|真实跑一次|启动前同步/.test(text)) return "run";
  return "ui";
}

function detectRuleName(message) {
  const text = String(message || "");
  const direct = text.match(/规则\s+(.+?)(?:：|（|\s+\||$)/);
  if (direct?.[1]) return direct[1].trim();
  const matched = state.rules.find((rule) => rule?.name && text.includes(String(rule.name)));
  return matched?.name || "";
}

function renderLogEntries() {
  const typeFilter = String(el.logFilterType?.value || "all");
  const keyword = String(el.logFilterKeyword?.value || "").trim().toLowerCase();
  const currentRuleFilter = String(el.logFilterRule?.value || "all");
  const ruleNames = Array.from(new Set([
    ...state.rules.map((rule) => String(rule?.name || "")).filter(Boolean),
    ...state.logEntries.map((entry) => String(entry.ruleName || "")).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b, "zh-CN"));

  if (el.logFilterRule) {
    el.logFilterRule.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "全部规则";
    el.logFilterRule.appendChild(allOption);
    for (const ruleName of ruleNames) {
      const option = document.createElement("option");
      option.value = ruleName;
      option.textContent = ruleName;
      el.logFilterRule.appendChild(option);
    }
    el.logFilterRule.value = currentRuleFilter === "all" || ruleNames.includes(currentRuleFilter) ? currentRuleFilter : "all";
  }

  const ruleFilter = String(el.logFilterRule?.value || "all");
  const lines = state.logEntries.filter((entry) => {
    if (typeFilter !== "all" && entry.type !== typeFilter) return false;
    if (ruleFilter !== "all" && entry.ruleName !== ruleFilter) return false;
    if (keyword && !entry.message.toLowerCase().includes(keyword)) return false;
    return true;
  });

  el.log.textContent = lines.map((entry) => `[${entry.timestamp}] ${entry.message}`).join("\n");
  if (lines.length > 0) el.log.textContent += "\n";
  el.log.scrollTop = el.log.scrollHeight;
}

function appendLog(line) {
  state.logEntries.push({
    timestamp: new Date().toISOString().replace("T", " ").replace("Z", ""),
    message: String(line),
    type: detectLogType(line),
    ruleName: detectRuleName(line)
  });
  if (state.logEntries.length > 2000) {
    state.logEntries = state.logEntries.slice(-2000);
  }
  renderLogEntries();
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

function showFatalBootError(error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error || "unknown");
  if (el.log) {
    el.log.textContent = `[BOOT_ERROR] ${message}`;
  }
  if (el.diagnosticsMeta) {
    el.diagnosticsMeta.textContent = `前端初始化失败：${message}`;
  }
}

async function applyAiFormIntentActionFactory({ showTab, updateScheduleUI, openRuleModalWithDraft, saveRuleDraft, updateScreenerUI, updateScreenerEstimate, updateFinancialUI, updateFinancialEstimate }) {
  return async function applyAiFormIntentAction({ intent, action }) {
    const warnings = Array.isArray(intent?.warnings) ? intent.warnings.filter(Boolean) : [];
    const reason = String(intent?.reason || "").trim();
    const warningText = warnings.length > 0 ? `；回退提示：${warnings.join(" / ")}` : "";

    if (action === "open_rule_modal") {
      showTab("rules");
      openRuleModalWithDraft(intent?.fields || {});
      const message = `AI 规则草案已载入规则编辑器${reason ? `：${reason}` : ""}${warningText}`;
      appendLog(message);
      return { message };
    }

    if (action === "save_rule_direct") {
      const ruleName = String(intent?.fields?.name || "AI 建议规则").trim() || "AI 建议规则";
      if (!window.confirm(`确认直接保存这条 AI 规则吗？\n\n${ruleName}`)) {
        return { message: "已取消直接保存 AI 规则。" };
      }
      showTab("rules");
      const saved = await saveRuleDraft(intent?.fields || {});
      const message = saved
        ? `AI 规则草案已直接保存${warningText}`
        : "AI 规则草案未直接保存，请在规则编辑器中补全后手动保存。";
      if (!saved) appendLog(message);
      return { message };
    }

    if (action === "apply_screener_preset") {
      const fields = intent?.fields || {};
      el.scrUniverse.value = String(fields.universe || "us_all");
      el.screenerSymbols.value = Array.isArray(fields.symbols) ? fields.symbols.join("\n") : "";
      el.scrMaxScan.value = fields.maxScan == null ? "2000" : String(fields.maxScan);
      el.scrMinPrice.value = fields.minPrice == null ? "" : String(fields.minPrice);
      el.scrMinMarketCap.value = fields.minMarketCap == null ? "" : String(fields.minMarketCap);
      el.scrMinTurnoverM.value = fields.minTurnoverM == null ? "" : String(fields.minTurnoverM);
      el.scrRecent5dCloseAth.value = fields.requireRecent5dCloseAth === false ? "false" : "true";
      el.scrMinVolumeRatio.value = fields.minVolumeRatio == null ? "" : String(fields.minVolumeRatio);
      updateScreenerUI();
      updateScreenerEstimate();
      showTab("screener");
      const message = `AI 建议已应用到筛选页${warningText}`;
      appendLog(message);
      return { message };
    }

    if (action === "apply_financial_preset") {
      const fields = intent?.fields || {};
      const criteria = fields.criteria || {};
      el.finUniverse.value = String(fields.universe || "us_all");
      el.financialSymbols.value = Array.isArray(fields.symbols) ? fields.symbols.join("\n") : "";
      el.finMaxScan.value = fields.maxScan == null ? "100" : String(fields.maxScan);
      el.finMinMarketCap.value = criteria.minMarketCap == null ? "" : String(criteria.minMarketCap);
      el.finMinRevenueGrowthYoY.value = criteria.minRevenueGrowthYoY == null ? "" : String(criteria.minRevenueGrowthYoY);
      el.finMinGrossMargin.value = criteria.minGrossMargin == null ? "" : String(criteria.minGrossMargin);
      el.finMinEbitdaGrowthYoY.value = criteria.minEbitdaGrowthYoY == null ? "" : String(criteria.minEbitdaGrowthYoY);
      el.finMinEbitdaMargin.value = criteria.minEbitdaMargin == null ? "" : String(criteria.minEbitdaMargin);
      el.finMinOperatingMargin.value = criteria.minOperatingMargin == null ? "" : String(criteria.minOperatingMargin);
      el.finPositiveOperatingCashFlow.value = criteria.requirePositiveOperatingCashFlow === false ? "false" : "true";
      el.finPositiveFreeCashFlow.value = criteria.requirePositiveFreeCashFlow === false ? "false" : "true";
      el.finMaxDebtToEquity.value = criteria.maxDebtToEquity == null ? "" : String(criteria.maxDebtToEquity);
      updateFinancialUI();
      updateFinancialEstimate();
      showTab("financial");
      const message = `AI 建议已应用到财报筛选页${warningText}`;
      appendLog(message);
      return { message };
    }

    if (action === "apply_schedule_preset") {
      const fields = intent?.fields || {};
      el.scheduleMode.value = String(fields.mode || "interval");
      el.scheduleIntervalSec.value = fields.intervalSec == null ? "60" : String(fields.intervalSec);
      el.scheduleDailyTime.value = String(fields.dailyTime || "09:30");
      el.scheduleWeekdaysOnly.value = fields.weekdaysOnly === false ? "false" : "true";
      updateScheduleUI();
      showTab("schedule");
      const message = `AI 建议已应用到定时页${warningText}`;
      appendLog(message);
      return { message };
    }

    throw new Error(`不支持的 AI 应用动作：${action}`);
  };
}

async function bootstrapRenderer() {
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
    appendLog,
    getConfigFromInputs
  });

  const {
    addCondition,
    closeRuleModal,
    handleRuleTemplateChange,
    openRuleModal,
    openRuleModalWithDraft,
    saveRuleDraft,
    saveRuleFromModal
  } = createRuleEditorController({
    el,
    state,
    parseSymbols,
    getIsFmpProvider,
    updateUniverseUI,
    appendLog,
    syncAdvancedJSON,
    renderRulesList: () => renderRulesList()
  });

  function rerenderAiActionSources() {
    renderRulesList();
    renderScreenerTable(state.screenerResults || []);
    renderFinancialTable(state.financialResults || []);
  }

  const applyAiFormIntentAction = await applyAiFormIntentActionFactory({
    showTab,
    updateScheduleUI,
    openRuleModalWithDraft,
    saveRuleDraft,
    updateScreenerUI,
    updateScreenerEstimate,
    updateFinancialUI,
    updateFinancialEstimate
  });

  const {
    attachAiContextSnapshot,
    buildAiTarget,
    buildCurrentTarget,
    clearAiPanel,
    clearAiPanelAttachments,
    explainAiTarget,
    refreshAiPanel,
    sendCurrentMessage,
    switchToAssistantMode
  } = createAiPanelController({
    el,
    state,
    appendLog,
    rerenderAiActionSources,
    onAiResult: (result) => logAiFormMapping(result),
    onApplyFormIntent: applyAiFormIntentAction
  });

  const resultsController = createResultsController({
    el,
    state,
    getIsFmpProvider,
    addSymbolsToAlertPool,
    explainAiTarget,
    buildAiTarget,
    appendLog
  });
  renderScreenerTable = resultsController.renderScreenerTable;
  renderFinancialTable = resultsController.renderFinancialTable;

  const rulesListController = createRulesListController({
    el,
    state,
    appendLog,
    syncAdvancedJSON,
    openRuleModal
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
    updateFinancialUI,
    applyDiagnostics: (diagnostics) => {
      state.diagnostics = diagnostics || null;
      renderDiagnosticsSummary();
    }
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
    handleRuleTemplateChange,
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

  bind();
  showTab("rules");
  refreshAiPanel();

  // 折叠按钮绑定：点击切换 cardBody 的 collapsed 状态
  document.querySelectorAll(".collapseToggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const body = document.getElementById(targetId);
      if (!body) return;
      const isCollapsed = body.classList.toggle("collapsed");
      btn.classList.toggle("collapsed", isCollapsed);
      btn.setAttribute("aria-expanded", String(!isCollapsed));
    });
  });

  el.btnAiSend?.addEventListener("click", () => {
    sendCurrentMessage();
  });
  el.btnAiBuild?.addEventListener("click", () => {
    buildCurrentTarget();
  });
  el.aiPanelInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendCurrentMessage();
    }
  });
  el.btnAiAssistantMode?.addEventListener("click", () => {
    switchToAssistantMode();
  });
  el.btnClearAiAttachments?.addEventListener("click", () => {
    clearAiPanelAttachments();
  });
  el.btnAiAttachRules?.addEventListener("click", () => {
    attachAiContextSnapshot("rules");
  });
  el.btnAiAttachSchedule?.addEventListener("click", () => {
    attachAiContextSnapshot("schedule");
  });
  el.btnAiAttachLastRun?.addEventListener("click", () => {
    attachAiContextSnapshot("last_run");
  });
  el.btnAiAttachLog?.addEventListener("click", () => {
    attachAiContextSnapshot("logs");
  });
  el.btnAiAttachScreener?.addEventListener("click", () => {
    attachAiContextSnapshot("screener_results");
  });
  el.btnAiAttachFinancial?.addEventListener("click", () => {
    attachAiContextSnapshot("financial_results");
  });
  el.btnRefreshProposals?.addEventListener("click", () => {
    refreshProposalList();
  });

  el.logFilterType?.addEventListener("change", renderLogEntries);
  el.logFilterRule?.addEventListener("change", renderLogEntries);
  el.logFilterKeyword?.addEventListener("input", renderLogEntries);
  el.btnClearLog?.addEventListener("click", () => {
    state.logEntries = [];
    renderLogEntries();
  });
  el.btnReloadDiagnostics?.addEventListener("click", () => {
    loadDiagnosticsSummary();
  });
  el.btnTestEmail?.addEventListener("click", async () => {
    try {
      const res = await window.api.testEmail();
      appendLog(`测试邮件已触发 -> ${res?.to || "-"}`);
    } catch (error) {
      appendLog(`测试邮件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  });
  el.btnTestWebhook?.addEventListener("click", async () => {
    try {
      const res = await window.api.testWebhook();
      appendLog(`测试回调已触发 -> ${res?.url || "-"}${res?.type === "feishu" ? `（分片=${res?.partsSent || 1}）` : ""}`);
    } catch (error) {
      appendLog(`测试回调失败：${error instanceof Error ? error.message : String(error)}`);
    }
  });
  el.btnOpenLogDir?.addEventListener("click", async () => {
    const targetPath = state.diagnostics?.runtimeLog || state.diagnostics?.diagnosticsFile || state.config?.base || "";
    if (!targetPath) {
      appendLog("当前没有可打开的日志路径");
      return;
    }
    try {
      await window.api.openPath(targetPath);
    } catch (error) {
      appendLog(`打开日志路径失败：${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const INDEX_NAME_MAP = { sp500: "标普 500", nasdaq: "纳斯达克", all: "全市场" };
  el.btnComputeMarketAmv?.addEventListener("click", async () => {
    if (!el.marketAmvResult) return;
    const index = el.marketAmvIndex?.value || "all";
    const limitRaw = Number(el.marketAmvLimit?.value);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const indexName = INDEX_NAME_MAP[index] || "全市场";
    el.marketAmvResult.innerHTML = `计算中（${indexName}），请稍候…`;
    el.btnComputeMarketAmv.disabled = true;
    try {
      const result = await window.api.engine.runMarketAmv({ index, limit });
      const valueStr = Number(result?.value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
      const dateStr = result?.date || "-";
      const sample = result?.sampleCount ?? 0;
      const processed = result?.processedCount ?? 0;
      el.marketAmvResult.innerHTML = `
        <div>日期：${dateStr}</div>
        <div>${indexName} 0AMV：${valueStr} 百万美元</div>
        <div>样本：有效 ${processed} / 总计 ${sample}</div>
      `;
      appendLog(`${indexName} 0AMV 计算完成：${valueStr} 百万美元（${dateStr}）`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      el.marketAmvResult.innerHTML = `<span class="error">计算失败：${message}</span>`;
      appendLog(`${indexName} 0AMV 计算失败：${message}`);
    } finally {
      refreshMarketAmvHistory();
      el.btnComputeMarketAmv.disabled = false;
    }
  });

  el.btnBackfillMarketAmv?.addEventListener("click", async () => {
    if (!el.marketAmvBackfillProgress) return;
    const index = el.marketAmvIndex?.value || "all";
    const limitRaw = Number(el.marketAmvLimit?.value);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const indexName = INDEX_NAME_MAP[index] || "全市场";
    el.marketAmvBackfillProgress.innerHTML = `开始回填 ${indexName} 0AMV 历史，请勿频繁操作…`;
    if (el.btnBackfillMarketAmv) el.btnBackfillMarketAmv.disabled = true;
    try {
      const result = await window.api.engine.backfillMarketAmv({ index, limit });
      const count = (Array.isArray(result?.entries) ? result.entries.length : 0);
      el.marketAmvBackfillProgress.innerHTML = `回填完成：${indexName} 共写入 ${count} 条历史记录。`;
      appendLog(`${indexName} 0AMV 回填完成：共 ${count} 条`);
      refreshMarketAmvHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      el.marketAmvBackfillProgress.innerHTML = `<span class="error">回填失败：${message}</span>`;
      appendLog(`${indexName} 0AMV 回填失败：${message}`);
    } finally {
      if (el.btnBackfillMarketAmv) el.btnBackfillMarketAmv.disabled = false;
    }
  });

  el.btnCancelBackfillMarketAmv?.addEventListener("click", async () => {
    try {
      await window.api.engine.cancelBackfillMarketAmv();
      if (el.marketAmvBackfillProgress) el.marketAmvBackfillProgress.innerHTML = "已请求取消回填…";
      appendLog("已请求取消 0AMV 回填");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`取消回填失败：${message}`);
    }
  });

  el.btnRefreshBackfillState?.addEventListener("click", async () => {
    if (!el.marketAmvBackfillProgress) return;
    try {
      const stateInfo = await window.api.engine.loadMarketAmvBackfillState();
      const index = el.marketAmvIndex?.value || "all";
      const entry = (stateInfo && stateInfo[index]) || {};
      const symbols = entry.completedSymbols || [];
      const count = Array.isArray(symbols) ? symbols.length : 0;
      const indexName = INDEX_NAME_MAP[index] || "全市场";
      el.marketAmvBackfillProgress.innerHTML = `断点续传状态（${indexName}）：已完成 ${count} 个标的，区间 ${entry.fromDate || "-"} ~ ${entry.toDate || "-"}。`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      el.marketAmvBackfillProgress.innerHTML = `<span class="error">读取进度失败：${message}</span>`;
    }
  });

  el.btnRefreshAlertHistory?.addEventListener("click", () => refreshAlertHistory());

  try {
    bindRuntimeStreams({
      appendLog,
      onEvent: (evt) => {
        if (evt?.type === "run_status") {
          state.diagnostics = {
            ...(state.diagnostics || {}),
            lastRun: evt,
            scheduler: {
              ...((state.diagnostics && state.diagnostics.scheduler) || {}),
              lastRunAt: evt.phase === "finished" ? (evt.finishedAt || new Date().toISOString()) : ((state.diagnostics && state.diagnostics.scheduler && state.diagnostics.scheduler.lastRunAt) || "")
            },
            updatedAt: new Date().toISOString()
          };
          renderDiagnosticsSummary();
        } else if (evt?.type === "scheduler_status") {
          state.diagnostics = {
            ...(state.diagnostics || {}),
            scheduler: evt,
            updatedAt: new Date().toISOString()
          };
          renderDiagnosticsSummary();
        } else if (evt?.type === "feishu_bridge_status") {
          state.diagnostics = {
            ...(state.diagnostics || {}),
            feishuBridge: evt,
            updatedAt: new Date().toISOString()
          };
          renderDiagnosticsSummary();
        } else if (evt?.type === "agent_proposal_status") {
          const proposalId = evt?.proposalId || "";
          const status = evt?.status || "unknown";
          const changes = Array.isArray(evt?.changes) ? evt.changes.join("；") : "";
          const detail = changes ? `${status}：${changes}` : status;
          if (el.aiPanelStatus) {
            el.aiPanelStatus.textContent = `[Proposal ${proposalId}] ${detail}`;
          }
          console.log("[agent_proposal_status]", evt);
          refreshProposalList();
        } else if (evt?.type === "market_amv_progress") {
          const idx = evt?.index || "all";
          const indexName = ({ sp500: "标普 500", nasdaq: "纳斯达克", all: "全市场" })[idx] || "全市场";
          if (el.marketAmvBackfillProgress) {
            if (evt.phase === "fetch") {
              const current = evt?.current ?? 0;
              const total = evt?.total ?? 0;
              el.marketAmvBackfillProgress.innerHTML = `回填进度（${indexName}）：拉取历史价 ${current} / ${total}`;
            } else if (evt.phase === "aggregate") {
              el.marketAmvBackfillProgress.innerHTML = `回填进度（${indexName}）：本地聚合 SMA 中…`;
            } else if (evt.phase === "done") {
              const count = evt?.entriesCount ?? 0;
              el.marketAmvBackfillProgress.innerHTML = `回填完成（${indexName}）：共写入 ${count} 条历史记录。`;
            }
          }
        }
      }
    });
  } catch (error) {
    appendLog(`运行时事件订阅失败：${error instanceof Error ? error.message : String(error)}`);
  }

  await loadAll();
  renderDiagnosticsSummary();
  refreshProposalList();
  refreshAlertHistory();
  refreshMarketAmvHistory();
}

window.addEventListener("error", (event) => {
  reportRendererError("window_error", event?.error || event?.message || "unknown");
});
window.addEventListener("unhandledrejection", (event) => {
  reportRendererError("unhandled_rejection", event?.reason || "unknown");
});

bootstrapRenderer().catch((error) => {
  showFatalBootError(error);
  reportRendererError("renderer_bootstrap", error);
  console.error("[renderer-bootstrap]", error);
});
