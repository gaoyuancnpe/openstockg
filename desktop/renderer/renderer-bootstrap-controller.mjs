import { formatDevModeInfo } from "./common.mjs";

function renderPathsText(paths) {
  return [
    `数据目录：${paths.base}`,
    `config.json：${paths.config}`,
    `rules.json：${paths.rules}`,
    `state.json：${paths.state}`,
    `events.jsonl：${paths.events}`,
    `runtime.log：${paths.runtimeLog || "-"}`,
    `diagnostics.json：${paths.diagnostics || "-"}`,
    `universe_us_symbols.json：${paths.universeUS}`,
    `universe_fmp_default.json：${paths.universeFmpDefault || "-"}`,
    `universe_fmp_financial.json：${paths.universeFmpFinancial || "-"}`
  ].join("\n");
}

export function createRendererBootstrapController({
  el,
  state,
  setInputsFromConfig,
  buildTemplateRules,
  syncAdvancedJSON,
  renderRulesList,
  updateScreenerUI,
  updateFinancialUI,
  applyDiagnostics = null
}) {
  function applyPaths(paths) {
    if (el.devModeInfo) {
      el.devModeInfo.textContent = formatDevModeInfo(paths);
    }
    if (el.paths) {
      el.paths.textContent = renderPathsText(paths);
    }
  }

  function applyLegalInfo(legalInfo) {
    if (!legalInfo) return;

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

  async function loadAll() {
    const [paths, config, rules, legalInfo, diagnostics] = await Promise.all([
      window.api.getPaths(),
      window.api.loadConfig(),
      window.api.loadRules(),
      window.api.getLegalInfo(),
      typeof window.api.getDiagnostics === "function" ? window.api.getDiagnostics() : null
    ]);

    applyPaths(paths);

    state.config = config;
    setInputsFromConfig(state.config);

    state.rules = Array.isArray(rules) ? rules : [];
    if (state.rules.length === 0) {
      state.rules = buildTemplateRules();
    }
    state.screenerSelected = [];
    state.aiPanelResult = null;
    syncAdvancedJSON();
    renderRulesList();
    updateScreenerUI();
    updateFinancialUI();
    if (typeof applyDiagnostics === "function") {
      applyDiagnostics(diagnostics);
    }

    applyLegalInfo(legalInfo);
  }

  function bindRuntimeStreams({ appendLog, onEvent = null }) {
    if (typeof window.api?.onLog === "function") {
      window.api.onLog(({ line }) => appendLog(line));
    } else {
      appendLog("运行时日志订阅不可用：window.api.onLog 未注入。");
    }

    if (typeof window.api?.onEvent === "function") {
      window.api.onEvent((evt) => {
        if (evt?.type === "alert") {
          appendLog(`提醒事件 ${evt.symbol} ${evt.conditionText}`);
        }
        if (typeof onEvent === "function") onEvent(evt);
      });
    } else {
      appendLog("事件订阅不可用：window.api.onEvent 未注入。");
    }
  }

  return {
    bindRuntimeStreams,
    loadAll
  };
}
