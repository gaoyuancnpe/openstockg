function formatRuleUniverse(rule) {
  return rule?.universe?.type === "us_all"
    ? `全量美股（按市值从高到低，固定前 ${rule?.universe?.maxScan ?? 2000}）`
    : `手动列表（${Array.isArray(rule?.symbols) ? rule.symbols.length : 0} 支）`;
}

function formatAiPanelMeta(kind, payload) {
  if (kind === "financial") {
    return `来源：财报 · ${payload?.symbol || "-"} · ${payload?.companyName || "-"} · 报告期 ${payload?.reportDate || "-"}`;
  }
  if (kind === "screener") {
    return `来源：筛选 · ${payload?.symbol || "-"} · 价格 ${payload?.price ?? "-"} · 市值 ${payload?.marketCap ?? "-"} 百万美元`;
  }
  if (kind === "rule") {
    return `来源：规则 · ${payload?.name || "未命名规则"} · ${formatRuleUniverse(payload)}`;
  }
  return "来源：AI 解读";
}

function formatAiModeLabel(mode) {
  return mode === "builder" ? "结构化生成" : "聊天解读";
}

export function createAiPanelController({ el, state, appendLog, rerenderAiActionSources, onAiResult }) {
  function clearAiPanel() {
    if (el.aiPanelMeta) el.aiPanelMeta.textContent = "暂未选择解读对象。";
    if (el.aiPanelStatus) el.aiPanelStatus.textContent = "";
    if (el.aiPanelOutput) el.aiPanelOutput.textContent = "";
    state.aiPanelResult = null;
    state.aiPanelBusy = false;
    rerenderAiActionSources();
  }

  async function runAiTarget(kind, payload, mode = "chat") {
    if (!payload) return;
    state.aiPanelBusy = true;
    if (el.aiPanelMeta) {
      el.aiPanelMeta.textContent = `${formatAiPanelMeta(kind, payload)} · 模式：${formatAiModeLabel(mode)}`;
    }
    if (el.aiPanelStatus) {
      el.aiPanelStatus.textContent = `${formatAiModeLabel(mode)}中：${kind === "rule" ? (payload?.name || "未命名规则") : (payload?.symbol || "-")}...`;
    }
    if (el.aiPanelOutput) {
      el.aiPanelOutput.textContent = "";
    }
    rerenderAiActionSources();
    try {
      const res = await window.api.explainAiTarget({ kind, mode, payload });
      state.aiPanelResult = res;
      const meta = res?.meta || {};
      const thinkingText = meta.thinkingEnabled ? `思考=${meta.reasoningEffort || "high"}` : "思考=关闭";
      const modeLabel = formatAiModeLabel(meta.taskMode || mode);
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = `${modeLabel}完成：${meta.subject || payload?.symbol || payload?.name || "-"} · ${meta.provider || "deepseek"} · ${meta.model || "-"} · ${thinkingText}`;
      }
      if (el.aiPanelOutput) {
        el.aiPanelOutput.textContent = String(res?.text || "未返回内容");
      }
      if (typeof onAiResult === "function") {
        onAiResult(res);
      }
      appendLog(`${modeLabel}完成：${meta.subject || payload?.symbol || payload?.name || "-"}`);
    } catch (e) {
      state.aiPanelResult = null;
      const errorText = e instanceof Error ? e.message : String(e);
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = `${formatAiModeLabel(mode)}失败：${payload?.symbol || payload?.name || "-"}`;
      }
      if (el.aiPanelOutput) {
        el.aiPanelOutput.textContent =
          mode === "builder"
            ? `${errorText}\n\n结构化生成不会自动降级为普通聊天结果，请调整提示、对象数据或模型配置后重试。`
            : errorText;
      }
      appendLog(`${formatAiModeLabel(mode)}失败：${errorText}`);
    } finally {
      state.aiPanelBusy = false;
      rerenderAiActionSources();
    }
  }

  async function explainAiTarget(kind, payload) {
    return runAiTarget(kind, payload, "chat");
  }

  async function buildAiTarget(kind, payload) {
    return runAiTarget(kind, payload, "builder");
  }

  return {
    buildAiTarget,
    clearAiPanel,
    explainAiTarget,
    runAiTarget
  };
}
