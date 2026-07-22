import { normalizeDesktopConfig } from "../shared-config.mjs";
import { buildRuleFromDraftFields } from "../rules/rule-draft-adapter.mjs";

function applyScheduleDraftToConfig(cfg, fields) {
  const normalized = normalizeDesktopConfig(cfg);
  const mode = String(fields?.mode || "interval").trim().toLowerCase() === "daily" ? "daily" : "interval";
  const intervalSec = Number.parseInt(String(fields?.intervalSec ?? normalized.scheduler.intervalSec ?? "60"), 10);
  const confirmTtlSec = normalized.feishu?.confirmTtlSec;
  return normalizeDesktopConfig({
    ...normalized,
    feishu: {
      ...normalized.feishu,
      confirmTtlSec
    },
    scheduler: {
      ...normalized.scheduler,
      mode,
      intervalSec: Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : normalized.scheduler.intervalSec,
      dailyTime: String(fields?.dailyTime || normalized.scheduler.dailyTime || "09:30"),
      weekdaysOnly: fields?.weekdaysOnly === false ? false : true
    }
  });
}

export function applyProposalIntents({
  currentRules,
  currentConfig,
  intents
}) {
  let nextRules = Array.isArray(currentRules) ? currentRules.slice() : [];
  let nextConfig = normalizeDesktopConfig(currentConfig);
  const appliedChanges = [];

  for (const intent of Array.isArray(intents) ? intents : []) {
    if (intent?.target === "ruleDraft") {
      const nextRule = buildRuleFromDraftFields(intent?.fields || {});
      nextRules = [nextRule, ...nextRules];
      appliedChanges.push(`新增规则：${nextRule.name}`);
      continue;
    }

    if (intent?.target === "scheduleDraft") {
      nextConfig = applyScheduleDraftToConfig(nextConfig, intent?.fields || {});
      const schedule = nextConfig.scheduler || {};
      appliedChanges.push(
        schedule.mode === "daily"
          ? `更新定时：每日 ${schedule.dailyTime}${schedule.weekdaysOnly ? "（工作日）" : "（含周末）"}`
          : `更新定时：每 ${schedule.intervalSec} 秒`
      );
    }
  }

  return {
    rules: nextRules,
    config: nextConfig,
    appliedChanges
  };
}
