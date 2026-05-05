import { formatDevModeInfo } from "./common.mjs";

function renderPathsText(paths) {
  return [
    `数据目录：${paths.base}`,
    `config.json：${paths.config}`,
    `rules.json：${paths.rules}`,
    `state.json：${paths.state}`,
    `events.jsonl：${paths.events}`,
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
  updateFinancialUI
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
    const [paths, config, rules, legalInfo] = await Promise.all([
      window.api.getPaths(),
      window.api.loadConfig(),
      window.api.loadRules(),
      window.api.getLegalInfo()
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

    applyLegalInfo(legalInfo);
  }

  function bindRuntimeStreams({ appendLog }) {
    window.api.onLog(({ line }) => appendLog(line));
    window.api.onEvent((evt) => appendLog(`提醒事件 ${evt.symbol} ${evt.conditionText}`));
  }

  return {
    bindRuntimeStreams,
    loadAll
  };
}
