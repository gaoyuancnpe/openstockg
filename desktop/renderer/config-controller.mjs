import { getDefaultDesktopConfig, normalizeDesktopConfig } from "../shared-config.mjs";

export function createConfigController({ el }) {
  function updateScheduleUI() {
    const mode = String(el.scheduleMode.value || "interval");
    const isInterval = mode === "interval";
    el.rowIntervalSec.classList.toggle("hidden", !isInterval);
    el.rowDailyTime.classList.toggle("hidden", isInterval);
    el.rowWeekdaysOnly.classList.toggle("hidden", isInterval);
  }

  function updateAiConfigUI() {
    const thinkingEnabled = String(el.aiThinkingEnabled?.value || "false") === "true";
    if (el.aiReasoningEffort) {
      el.aiReasoningEffort.disabled = !thinkingEnabled;
    }
  }

  function getConfigFromInputs() {
    const defaults = getDefaultDesktopConfig();
    const schedulerMode = String(el.scheduleMode.value || "interval");
    const intervalSec = Number.parseInt(String(el.scheduleIntervalSec.value || "60"), 10);
    const dailyTime = String(el.scheduleDailyTime.value || defaults.scheduler.dailyTime);
    const weekdaysOnly = String(el.scheduleWeekdaysOnly.value || "true") === "true";

    return normalizeDesktopConfig({
      dataProvider: String(el.dataProvider.value || defaults.dataProvider),
      finnhubBaseUrl: String(el.finnhubBaseUrl.value || defaults.finnhubBaseUrl),
      finnhubApiKey: String(el.finnhubApiKey.value || ""),
      fmpBaseUrl: String(el.fmpBaseUrl.value || defaults.fmpBaseUrl),
      fmpApiKey: String(el.fmpApiKey.value || ""),
      ai: {
        provider: defaults.ai.provider,
        baseUrl: String(el.deepseekBaseUrl.value || defaults.ai.baseUrl),
        apiKey: String(el.deepseekApiKey.value || ""),
        model: String(el.aiModel.value || defaults.ai.model),
        thinkingEnabled: String(el.aiThinkingEnabled.value || "false") === "true",
        reasoningEffort: String(el.aiReasoningEffort.value || defaults.ai.reasoningEffort)
      },
      pollIntervalSec: Number.isFinite(intervalSec) ? intervalSec : defaults.pollIntervalSec,
      scheduler: {
        mode: schedulerMode || defaults.scheduler.mode,
        intervalSec: Number.isFinite(intervalSec) ? intervalSec : defaults.scheduler.intervalSec,
        dailyTime,
        weekdaysOnly,
        usMarketHoursOnly: el.cfgSchedulerUsMarketHoursOnly?.checked === true
      },
      defaultEmailTo: String(el.defaultEmailTo.value || ""),
      feishu: {
        enabled: String(el.feishuEnabled?.value || "false") === "true",
        appId: String(el.feishuAppId?.value || ""),
        appSecret: String(el.feishuAppSecret?.value || ""),
        allowUserOpenIds: String(el.feishuAllowOpenIds?.value || "")
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
        requireAllowlist: String(el.feishuRequireAllowlist?.value || "false") === "true",
        allowRemoteApply: String(el.feishuAllowRemoteApply?.value || "false") === "true",
        confirmTtlSec: Number.parseInt(String(el.feishuConfirmTtlSec?.value || defaults.feishu.confirmTtlSec || "300"), 10)
      },
      defaultWebhookType: String(el.defaultWebhookType?.value || defaults.defaultWebhookType || "generic"),
      defaultWebhookUrl: String(el.defaultWebhookUrl.value || ""),
      email: {
        provider: defaults.email.provider,
        user: String(el.gmailUser.value || ""),
        pass: String(el.gmailPass.value || ""),
        host: String(el.cfgEmailHost?.value || ""),
        port: Number.parseInt(String(el.cfgEmailPort?.value || "0"), 10) || 0,
        secure: true
      }
    });
  }

  function setInputsFromConfig(cfg) {
    const normalized = normalizeDesktopConfig(cfg);
    el.dataProvider.value = normalized.dataProvider;
    el.finnhubBaseUrl.value = normalized.finnhubBaseUrl;
    el.finnhubApiKey.value = normalized.finnhubApiKey;
    el.fmpBaseUrl.value = normalized.fmpBaseUrl;
    el.fmpApiKey.value = normalized.fmpApiKey;
    el.deepseekBaseUrl.value = normalized.ai.baseUrl;
    el.deepseekApiKey.value = normalized.ai.apiKey;
    el.aiModel.value = normalized.ai.model;
    el.aiThinkingEnabled.value = String(Boolean(normalized.ai.thinkingEnabled));
    el.aiReasoningEffort.value = normalized.ai.reasoningEffort;
    el.feishuEnabled.value = String(Boolean(normalized.feishu?.enabled));
    el.feishuAppId.value = String(normalized.feishu?.appId || "");
    el.feishuAppSecret.value = String(normalized.feishu?.appSecret || "");
    el.feishuAllowOpenIds.value = Array.isArray(normalized.feishu?.allowUserOpenIds) ? normalized.feishu.allowUserOpenIds.join("\n") : "";
    el.feishuRequireAllowlist.value = String(Boolean(normalized.feishu?.requireAllowlist));
    el.feishuAllowRemoteApply.value = String(Boolean(normalized.feishu?.allowRemoteApply));
    el.feishuConfirmTtlSec.value = String(normalized.feishu?.confirmTtlSec ?? 300);
    el.defaultEmailTo.value = normalized.defaultEmailTo;
    if (el.defaultWebhookType) {
      el.defaultWebhookType.value = normalized.defaultWebhookType || "generic";
    }
    el.defaultWebhookUrl.value = normalized.defaultWebhookUrl;
    el.gmailUser.value = normalized.email.user;
    el.gmailPass.value = normalized.email.pass;
    if (el.cfgEmailHost) el.cfgEmailHost.value = normalized.email.host || "";
    if (el.cfgEmailPort) el.cfgEmailPort.value = String(normalized.email.port || "");

    const scheduler = normalized.scheduler;
    el.scheduleMode.value = String(scheduler.mode || "interval");
    el.scheduleIntervalSec.value = String(scheduler.intervalSec ?? normalized.pollIntervalSec ?? 60);
    el.scheduleDailyTime.value = String(scheduler.dailyTime || "09:30");
    el.scheduleWeekdaysOnly.value = String(Boolean(scheduler.weekdaysOnly));
    if (el.cfgSchedulerUsMarketHoursOnly) {
      el.cfgSchedulerUsMarketHoursOnly.checked = Boolean(scheduler.usMarketHoursOnly);
    }
    updateScheduleUI();
    updateAiConfigUI();
  }

  return {
    getConfigFromInputs,
    setInputsFromConfig,
    updateAiConfigUI,
    updateScheduleUI
  };
}
