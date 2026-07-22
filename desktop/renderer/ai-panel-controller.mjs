function formatRuleUniverse(rule) {
  return rule?.universe?.type === "us_all"
    ? `全量美股（按市值从高到低，固定前 ${rule?.universe?.maxScan ?? 2000}）`
    : `手动列表（${Array.isArray(rule?.symbols) ? rule.symbols.length : 0} 支）`;
}

function getTargetSubject(kind, payload) {
  if (kind === "assistant") return "开放助手";
  if (kind === "financial") {
    return String(payload?.symbol || payload?.companyName || "未命名对象");
  }
  if (kind === "screener") {
    return String(payload?.symbol || "未命名对象");
  }
  return String(payload?.name || "未命名规则");
}

function formatAiPanelMeta(kind, payload) {
  if (kind === "assistant") {
    return "当前模式：开放助手。";
  }
  if (kind === "financial") {
    return `当前聚焦：财报 · ${payload?.symbol || "-"} · ${payload?.companyName || "-"} · 报告期 ${payload?.reportDate || "-"}`;
  }
  if (kind === "screener") {
    return `当前聚焦：筛选结果 · ${payload?.symbol || "-"} · 价格 ${payload?.price ?? "-"} · 市值 ${payload?.marketCap ?? "-"} 百万美元`;
  }
  if (kind === "rule") {
    return `当前聚焦：规则 · ${payload?.name || "未命名规则"} · ${formatRuleUniverse(payload)}`;
  }
  return "当前模式：开放助手。";
}

function buildAiContextKey(kind, payload) {
  if (kind === "assistant") return "assistant";
  if (kind === "financial") {
    return `${kind}:${payload?.symbol || "-"}:${payload?.reportDate || "-"}`;
  }
  if (kind === "screener") {
    return `${kind}:${payload?.symbol || "-"}`;
  }
  return `${kind}:${payload?.name || "未命名规则"}`;
}

function formatAiModeLabel(mode) {
  return mode === "builder" ? "生成规则" : "AI聊天";
}

function getDefaultChatPrompt(kind, payload) {
  if (kind === "assistant") {
    return "请先根据我当前的问题给出直接判断；如果还缺应用上下文，也请直接告诉我还要附加什么。";
  }
  if (kind === "financial") {
    return `请先给我一版财报判断，重点说明 ${payload?.symbol || payload?.companyName || "当前对象"} 的强弱、主要风险和后续跟踪点。`;
  }
  if (kind === "screener") {
    return `请先解释 ${payload?.symbol || "当前对象"} 为什么会进入当前筛选结果，并判断它更像继续跟踪、一般观察还是暂不优先。`;
  }
  return "请先评估这条规则是否实用，并指出最值得先改的地方。";
}

function getAiInputPlaceholder(kind, payload, attachmentCount = 0) {
  if (kind === "assistant") {
    return attachmentCount > 0
      ? "直接提问，例如：基于这些上下文，帮我判断为什么这轮没有触发通知"
      : "直接输入你的问题，例如：帮我设计一条更稳的放量新高提醒规则";
  }
  if (kind === "financial") {
    return `继续追问 ${payload?.symbol || payload?.companyName || "当前财报对象"}，例如：它最关键的风险是什么？`;
  }
  if (kind === "screener") {
    return `继续追问 ${payload?.symbol || "当前标的"}，例如：为什么它只是继续跟踪，不是优先？`;
  }
  if (kind === "rule") {
    return `继续追问规则 ${payload?.name || ""}，例如：这条规则最容易误报在哪里？`;
  }
  return "输入你的追问";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createTimestamp() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function sanitizeHistory(messages) {
  return Array.isArray(messages)
    ? messages
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && item.mode === "chat")
      .map((item) => ({
        role: item.role,
        content: normalizeText(item.content)
      }))
      .filter((item) => item.content)
      .slice(-12)
    : [];
}

function formatIntentTargetLabel(target) {
  if (target === "ruleDraft") return "规则草案";
  if (target === "scheduleDraft") return "定时草案";
  if (target === "screenerPreset") return "筛选条件";
  if (target === "financialPreset") return "财报筛选条件";
  return "结构化建议";
}

function getIntentActionSpecs(intent) {
  if (intent?.target === "ruleDraft") {
    return [
      { action: "open_rule_modal", label: "应用到规则编辑器" },
      { action: "save_rule_direct", label: "直接保存为新规则" }
    ];
  }
  if (intent?.target === "scheduleDraft") {
    return [{ action: "apply_schedule_preset", label: "应用到定时页" }];
  }
  if (intent?.target === "screenerPreset") {
    return [{ action: "apply_screener_preset", label: "应用到筛选页" }];
  }
  if (intent?.target === "financialPreset") {
    return [{ action: "apply_financial_preset", label: "应用到财报页" }];
  }
  return [];
}

function getAssistantContext() {
  return {
    kind: "assistant",
    payload: {},
    key: "assistant"
  };
}

function normalizeAttachmentLabel(type) {
  if (type === "rules") return "当前规则";
  if (type === "schedule") return "定时与常驻";
  if (type === "last_run") return "最近运行";
  if (type === "logs") return "最近日志";
  if (type === "screener_results") return "筛选结果";
  if (type === "financial_results") return "财报结果";
  return type;
}

function buildRuleSnapshot(rule) {
  return {
    name: String(rule?.name || ""),
    enabled: Boolean(rule?.enabled),
    universe: rule?.universe || null,
    symbols: Array.isArray(rule?.symbols) ? rule.symbols.slice(0, 50) : [],
    cooldownSec: rule?.cooldownSec ?? null,
    groupOp: String(rule?.groupOp || "and"),
    conditions: Array.isArray(rule?.conditions) ? rule.conditions.slice(0, 20) : [],
    notify: rule?.notify || null
  };
}

export function createAiPanelController({
  el,
  state,
  appendLog,
  rerenderAiActionSources,
  onAiResult,
  onApplyFormIntent
}) {
  function ensureAiState() {
    if (!Array.isArray(state.aiPanelMessages)) state.aiPanelMessages = [];
    if (!Array.isArray(state.aiPanelAttachments)) state.aiPanelAttachments = [];
    if (!state.aiPanelContext || typeof state.aiPanelContext !== "object") {
      state.aiPanelContext = getAssistantContext();
    }
  }

  function renderIntentActions() {
    const actionsEl = el.aiPanelIntentActions;
    const hintEl = el.aiPanelIntentHint;
    if (!actionsEl || !hintEl) return;

    const intents = Array.isArray(state.aiPanelResult?.formMapping?.intents)
      ? state.aiPanelResult.formMapping.intents
      : [];

    actionsEl.innerHTML = "";
    if (intents.length === 0) {
      actionsEl.classList.add("hidden");
      hintEl.classList.add("hidden");
      hintEl.textContent = "";
      return;
    }

    const warningCount = intents.reduce((sum, intent) => sum + (Array.isArray(intent?.warnings) ? intent.warnings.length : 0), 0);
    hintEl.textContent = warningCount > 0
      ? `AI 已生成可落地建议；当前有 ${warningCount} 条回退/修正提示，应用前建议看一眼日志。`
      : "AI 已生成可落地建议，可以直接应用到表单或规则列表。";
    hintEl.classList.remove("hidden");
    actionsEl.classList.remove("hidden");

    intents.forEach((intent, index) => {
      const specs = getIntentActionSpecs(intent);
      specs.forEach((spec) => {
        const btn = document.createElement("button");
        btn.textContent = `${spec.label}${intents.length > 1 ? ` ${index + 1}` : ""}`;
        btn.disabled = state.aiPanelBusy;
        btn.title = intent?.reason || formatIntentTargetLabel(intent?.target);
        btn.addEventListener("click", async () => {
          if (typeof onApplyFormIntent !== "function") return;
          try {
            const result = await onApplyFormIntent({ intent, action: spec.action });
            if (el.aiPanelStatus && result?.message) {
              el.aiPanelStatus.textContent = result.message;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (el.aiPanelStatus) {
              el.aiPanelStatus.textContent = `应用 AI 建议失败：${message}`;
            }
            if (typeof appendLog === "function") {
              appendLog(`应用 AI 建议失败：${message}`);
            }
          }
        });
        actionsEl.appendChild(btn);
      });
    });
  }

  function renderAttachmentMeta() {
    if (!el.aiPanelAttachmentMeta) return;
    const attachments = Array.isArray(state.aiPanelAttachments) ? state.aiPanelAttachments : [];
    if (attachments.length === 0) {
      el.aiPanelAttachmentMeta.textContent = "未附加应用上下文，当前为开放聊天。";
      return;
    }
    el.aiPanelAttachmentMeta.textContent = `已附加 ${attachments.length} 份应用上下文：${attachments.map((item) => item.label).join("、")}`;
  }

  function renderPanelMeta() {
    if (!el.aiPanelMeta) return;
    const context = state.aiPanelContext || getAssistantContext();
    el.aiPanelMeta.textContent = formatAiPanelMeta(context.kind, context.payload);
  }

  function renderAiMessages() {
    if (!el.aiPanelMessages) return;
    ensureAiState();
    el.aiPanelMessages.innerHTML = "";

    if (!Array.isArray(state.aiPanelMessages) || state.aiPanelMessages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "aiPanelEmpty";
      empty.textContent = state.aiPanelContext?.kind === "assistant"
        ? "这里已经改成开放聊天入口。你可以直接提问，也可以先手动附加规则、定时、最近运行、日志或筛选结果，再让 AI 基于现场继续判断。"
        : "已选中对象。你可以继续提问，或直接点击“生成规则”获取结构化建议。";
      el.aiPanelMessages.appendChild(empty);
      return;
    }

    state.aiPanelMessages.forEach((message) => {
      const item = document.createElement("div");
      item.className = `aiMessage ${message.role}${message.mode === "builder" ? " builder" : ""}`;

      const meta = document.createElement("div");
      meta.className = "aiMessageMeta";
      const roleLabel = message.role === "assistant" ? formatAiModeLabel(message.mode) : "你";
      meta.textContent = `${roleLabel} · ${message.timestamp || createTimestamp()}`;

      const body = document.createElement("div");
      body.className = "aiMessageBody";
      body.textContent = String(message.content || "");

      item.appendChild(meta);
      item.appendChild(body);
      el.aiPanelMessages.appendChild(item);
    });

    el.aiPanelMessages.scrollTop = el.aiPanelMessages.scrollHeight;
  }

  function updateComposerState() {
    ensureAiState();
    const context = state.aiPanelContext || getAssistantContext();
    const attachmentCount = Array.isArray(state.aiPanelAttachments) ? state.aiPanelAttachments.length : 0;
    if (el.aiPanelInput) {
      el.aiPanelInput.disabled = state.aiPanelBusy;
      el.aiPanelInput.placeholder = getAiInputPlaceholder(context.kind, context.payload, attachmentCount);
    }
    if (el.btnAiSend) {
      el.btnAiSend.disabled = state.aiPanelBusy;
    }
    if (el.btnAiBuild) {
      el.btnAiBuild.disabled = state.aiPanelBusy;
    }
  }

  function refreshAiPanel() {
    ensureAiState();
    renderPanelMeta();
    renderAttachmentMeta();
    renderAiMessages();
    renderIntentActions();
    updateComposerState();
  }

  function pushAiMessage(role, content, mode = "chat") {
    ensureAiState();
    state.aiPanelMessages.push({
      role,
      content: String(content || ""),
      mode,
      timestamp: createTimestamp()
    });
    if (state.aiPanelMessages.length > 40) {
      state.aiPanelMessages = state.aiPanelMessages.slice(-40);
    }
    renderAiMessages();
  }

  function resetConversationState(statusText = "") {
    if (el.aiPanelInput) el.aiPanelInput.value = "";
    if (el.aiPanelStatus) el.aiPanelStatus.textContent = statusText;
    state.aiPanelResult = null;
    state.aiPanelBusy = false;
    state.aiPanelMessages = [];
    renderAiMessages();
    renderIntentActions();
    updateComposerState();
  }

  function setAiContext(kind, payload) {
    ensureAiState();
    const nextContext = kind === "assistant"
      ? getAssistantContext()
      : {
        kind,
        payload,
        key: buildAiContextKey(kind, payload)
      };
    const changed = !state.aiPanelContext || state.aiPanelContext.key !== nextContext.key;
    if (changed) {
      state.aiPanelContext = nextContext;
      state.aiPanelMessages = [];
      state.aiPanelResult = null;
    } else {
      state.aiPanelContext = nextContext;
    }
    renderPanelMeta();
    renderAttachmentMeta();
    renderAiMessages();
    renderIntentActions();
    updateComposerState();
    return changed;
  }

  function switchToAssistantMode() {
    const changed = setAiContext("assistant", {});
    if (el.aiPanelInput) el.aiPanelInput.value = "";
    if (el.aiPanelStatus) {
      el.aiPanelStatus.textContent = changed
        ? "已切回开放助手。后续聊天不再被当前对象限制。"
        : "当前已是开放助手模式。";
    }
    if (typeof appendLog === "function" && changed) {
      appendLog("AI 工作区已切回开放助手模式");
    }
  }

  function buildAttachmentSnapshot(type) {
    if (type === "rules") {
      if (!Array.isArray(state.rules) || state.rules.length === 0) return null;
      return {
        key: type,
        type,
        label: normalizeAttachmentLabel(type),
        content: {
          total: state.rules.length,
          enabledCount: state.rules.filter((rule) => rule?.enabled).length,
          rules: state.rules.slice(0, 20).map(buildRuleSnapshot)
        }
      };
    }

    if (type === "schedule") {
      const schedule = state.config?.schedule || null;
      const scheduler = state.diagnostics?.scheduler || null;
      if (!schedule && !scheduler) return null;
      return {
        key: type,
        type,
        label: normalizeAttachmentLabel(type),
        content: {
          configuredSchedule: schedule,
          runtimeScheduler: scheduler
        }
      };
    }

    if (type === "last_run") {
      if (!state.diagnostics?.lastRun) return null;
      return {
        key: type,
        type,
        label: normalizeAttachmentLabel(type),
        content: state.diagnostics.lastRun
      };
    }

    if (type === "logs") {
      if (!Array.isArray(state.logEntries) || state.logEntries.length === 0) return null;
      return {
        key: type,
        type,
        label: normalizeAttachmentLabel(type),
        content: state.logEntries.slice(-40).map((entry) => ({
          timestamp: entry.timestamp,
          type: entry.type,
          ruleName: entry.ruleName,
          message: entry.message
        }))
      };
    }

    if (type === "screener_results") {
      if (!Array.isArray(state.screenerResults) || state.screenerResults.length === 0) return null;
      return {
        key: type,
        type,
        label: normalizeAttachmentLabel(type),
        content: {
          total: state.screenerResults.length,
          rows: state.screenerResults.slice(0, 20)
        }
      };
    }

    if (type === "financial_results") {
      if (!Array.isArray(state.financialResults) || state.financialResults.length === 0) return null;
      return {
        key: type,
        type,
        label: normalizeAttachmentLabel(type),
        content: {
          total: state.financialResults.length,
          rows: state.financialResults.slice(0, 15)
        }
      };
    }

    return null;
  }

  function attachAiContextSnapshot(type) {
    ensureAiState();
    const snapshot = buildAttachmentSnapshot(type);
    if (!snapshot) {
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = `当前没有可附加的“${normalizeAttachmentLabel(type)}”上下文。`;
      }
      return false;
    }
    const nextAttachments = state.aiPanelAttachments.filter((item) => item.key !== snapshot.key);
    nextAttachments.push(snapshot);
    state.aiPanelAttachments = nextAttachments;
    state.aiPanelResult = null;
    renderAttachmentMeta();
    renderIntentActions();
    if (el.aiPanelStatus) {
      el.aiPanelStatus.textContent = `已附加应用上下文：${snapshot.label}`;
    }
    if (typeof appendLog === "function") {
      appendLog(`AI 已附加上下文：${snapshot.label}`);
    }
    return true;
  }

  function clearAiPanelAttachments() {
    ensureAiState();
    state.aiPanelAttachments = [];
    state.aiPanelResult = null;
    renderAttachmentMeta();
    renderIntentActions();
    if (el.aiPanelStatus) {
      el.aiPanelStatus.textContent = "已清空附加的应用上下文。";
    }
    if (typeof appendLog === "function") {
      appendLog("AI 已清空附加上下文");
    }
  }

  function buildAssistantPayload() {
    ensureAiState();
    return {
      __assistant: {
        attachments: state.aiPanelAttachments.map((item) => ({
          type: item.type,
          label: item.label,
          content: item.content
        }))
      }
    };
  }

  function clearAiPanel() {
    ensureAiState();
    resetConversationState("会话已清空。");
    renderPanelMeta();
    renderAttachmentMeta();
    rerenderAiActionSources();
  }

  async function runAiTarget(kind, payload, mode = "chat", { prompt = "" } = {}) {
    ensureAiState();
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const changed = setAiContext(kind, safePayload);
    const subject = getTargetSubject(kind, safePayload);
    const normalizedPrompt = normalizeText(prompt) || (mode === "chat" ? getDefaultChatPrompt(kind, safePayload) : "");
    const history = mode === "chat" ? sanitizeHistory(state.aiPanelMessages) : [];

    if (mode === "chat") {
      pushAiMessage("user", normalizedPrompt, "chat");
    } else if (normalizedPrompt) {
      pushAiMessage("user", `生成规则要求：${normalizedPrompt}`, "builder");
    }

    state.aiPanelBusy = true;
    if (el.aiPanelMeta) {
      el.aiPanelMeta.textContent = `${formatAiPanelMeta(kind, safePayload)} · 模式：${formatAiModeLabel(mode)}`;
    }
    if (el.aiPanelStatus) {
      el.aiPanelStatus.textContent = `${formatAiModeLabel(mode)}中：${subject}...`;
    }
    updateComposerState();
    rerenderAiActionSources();
    try {
      const nextPayload = {
        ...safePayload,
        __ai: {
          prompt: normalizedPrompt,
          history
        }
      };
      const res = await window.api.explainAiTarget({ kind, mode, payload: nextPayload });
      state.aiPanelResult = res;
      const meta = res?.meta || {};
      const thinkingText = meta.thinkingEnabled ? `思考=${meta.reasoningEffort || "high"}` : "思考=关闭";
      const modeLabel = formatAiModeLabel(meta.taskMode || mode);
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = `${modeLabel}完成：${meta.subject || subject} · ${meta.provider || "deepseek"} · ${meta.model || "-"} · ${thinkingText}`;
      }
      pushAiMessage("assistant", String(res?.text || "未返回内容"), meta.taskMode || mode);
      renderIntentActions();
      if (typeof onAiResult === "function") {
        onAiResult(res);
      }
      if (typeof appendLog === "function") {
        appendLog(`${modeLabel}完成：${meta.subject || subject}${changed ? "，已切换上下文" : ""}`);
      }
    } catch (e) {
      state.aiPanelResult = null;
      renderIntentActions();
      const errorText = e instanceof Error ? e.message : String(e);
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = `${formatAiModeLabel(mode)}失败：${subject}`;
      }
      pushAiMessage(
        "assistant",
        mode === "builder"
          ? `${errorText}\n\n生成规则失败，不会自动降级成普通聊天结果。请先确认提示词、附加上下文和模型配置。`
          : errorText,
        mode
      );
      if (typeof appendLog === "function") {
        appendLog(`${formatAiModeLabel(mode)}失败：${errorText}`);
      }
    } finally {
      state.aiPanelBusy = false;
      renderPanelMeta();
      renderAttachmentMeta();
      updateComposerState();
      rerenderAiActionSources();
    }
  }

  async function explainAiTarget(kind, payload) {
    return runAiTarget(kind, payload, "chat");
  }

  async function buildAiTarget(kind, payload, options = {}) {
    return runAiTarget(kind, payload, "builder", options);
  }

  async function sendCurrentMessage() {
    ensureAiState();
    const draft = normalizeText(el.aiPanelInput?.value || "");
    if (!draft) {
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = "请输入问题后再发送。";
      }
      return;
    }

    if (el.aiPanelInput) el.aiPanelInput.value = "";
    const context = state.aiPanelContext || getAssistantContext();
    const isAssistant = context.kind === "assistant";
    try {
      await runAiTarget(
        isAssistant ? "assistant" : context.kind,
        isAssistant ? buildAssistantPayload() : context.payload,
        "chat",
        { prompt: draft }
      );
    } catch {
      if (el.aiPanelInput) el.aiPanelInput.value = draft;
    }
  }

  async function buildCurrentTarget() {
    ensureAiState();
    const draft = normalizeText(el.aiPanelInput?.value || "");
    const context = state.aiPanelContext || getAssistantContext();
    const isAssistant = context.kind === "assistant";
    if (isAssistant && !draft && state.aiPanelAttachments.length === 0) {
      if (el.aiPanelStatus) {
        el.aiPanelStatus.textContent = "开放助手生成规则时，至少先写清需求，或附加一份应用上下文。";
      }
      return;
    }
    await runAiTarget(
      isAssistant ? "assistant" : context.kind,
      isAssistant ? buildAssistantPayload() : context.payload,
      "builder",
      { prompt: draft }
    );
  }

  return {
    attachAiContextSnapshot,
    buildAiTarget,
    buildCurrentTarget,
    clearAiPanel,
    clearAiPanelAttachments,
    explainAiTarget,
    refreshAiPanel,
    runAiTarget,
    sendCurrentMessage,
    setAiContext,
    switchToAssistantMode
  };
}
