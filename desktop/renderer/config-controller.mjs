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
        weekdaysOnly
      },
      defaultEmailTo: String(el.defaultEmailTo.value || ""),
      defaultWebhookUrl: String(el.defaultWebhookUrl.value || ""),
      email: {
        provider: defaults.email.provider,
        user: String(el.gmailUser.value || ""),
        pass: String(el.gmailPass.value || "")
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
    el.defaultEmailTo.value = normalized.defaultEmailTo;
    el.defaultWebhookUrl.value = normalized.defaultWebhookUrl;
    el.gmailUser.value = normalized.email.user;
    el.gmailPass.value = normalized.email.pass;

    const scheduler = normalized.scheduler;
    el.scheduleMode.value = String(scheduler.mode || "interval");
    el.scheduleIntervalSec.value = String(scheduler.intervalSec ?? normalized.pollIntervalSec ?? 60);
    el.scheduleDailyTime.value = String(scheduler.dailyTime || "09:30");
    el.scheduleWeekdaysOnly.value = String(Boolean(scheduler.weekdaysOnly));
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
