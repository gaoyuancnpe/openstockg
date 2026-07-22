import { conditionFromUI, conditionTypeNeedsValue } from "./rule-condition-shared.mjs";

function getFallbackConditionItem() {
  return {
    type: "price_above",
    value: 0
  };
}

function buildConditionUiItems(items) {
  return items.map((item) => ({
    type: item.type,
    value: conditionTypeNeedsValue(item.type) ? item.value : null
  }));
}

export function buildRuleFromDraftFields(fields) {
  const items = Array.isArray(fields?.conditions) && fields.conditions.length > 0
    ? fields.conditions.map((item) => ({
      type: String(item?.type || "price_above"),
      value: conditionTypeNeedsValue(item?.type) ? Number(item?.value ?? 0) : null
    }))
    : [getFallbackConditionItem()];
  const conds = items.map((item) => conditionFromUI(item.type, conditionTypeNeedsValue(item.type) ? item.value : 0));
  const groupOp = String(fields?.groupOp || "and").toLowerCase() === "or" ? "or" : "and";

  return {
    templateKey: "custom",
    enabled: fields?.enabled !== false,
    name: String(fields?.name || "").trim() || "AI 建议规则",
    symbols: Array.isArray(fields?.symbols) ? fields.symbols : [],
    cooldownSec: Number.isFinite(Number(fields?.cooldownSec)) ? Number(fields.cooldownSec) : 86400,
    notify: {
      ...(fields?.notify?.email ? { email: String(fields.notify.email).trim() } : {}),
      ...(
        fields?.notify?.webhookUrl || fields?.notify?.webhookType
          ? {
            ...(fields?.notify?.webhookUrl ? { webhookUrl: String(fields.notify.webhookUrl).trim() } : {}),
            webhookType: String(fields?.notify?.webhookType || "generic").toLowerCase() === "feishu" ? "feishu" : "generic"
          }
          : {}
      )
    },
    ui: {
      groupOp,
      items: buildConditionUiItems(items)
    },
    condition: conds.length === 1 ? conds[0] : { op: groupOp, args: conds },
    universe: fields?.universe?.type === "us_all"
      ? {
        type: "us_all",
        maxScan: Number.isFinite(Number(fields?.universe?.maxScan)) ? Number(fields.universe.maxScan) : 2000,
        minPrice: fields?.universe?.minPrice ?? null,
        minMarketCap: fields?.universe?.minMarketCap ?? null,
        minTurnoverM: fields?.universe?.minTurnoverM ?? null,
        requireRecent5dCloseAth: fields?.universe?.requireRecent5dCloseAth !== false,
        minVolumeRatio: fields?.universe?.minVolumeRatio ?? null
      }
      : { type: "manual" }
  };
}
