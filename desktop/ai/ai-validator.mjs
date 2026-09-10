import { sanitizeTextList, tryParseStructuredAiOutput } from "./ai-shared.mjs";

const RULE_CONDITION_TYPES = new Set([
  "price_above",
  "price_below",
  "change_above",
  "change_below",
  "cross_above_sma20",
  "cross_below_sma20",
  "rsi_above",
  "rsi_below",
  "volume_ratio_above",
  "market_cap_above",
  "turnover_m_above",
  "recent_5d_close_ath"
]);

const NO_VALUE_CONDITION_TYPES = new Set([
  "cross_above_sma20",
  "cross_below_sma20",
  "recent_5d_close_ath"
]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidConditionItem(item) {
  const type = String(item?.type || "");
  if (!RULE_CONDITION_TYPES.has(type)) return false;
  if (NO_VALUE_CONDITION_TYPES.has(type)) return true;
  return isFiniteNumber(Number(item?.value));
}

function describeIntentTarget(intent) {
  return String(intent?.target || "未知目标");
}

// 不依赖 LLM 的硬校验：命中即拒绝，用于堵住 normalizeRuleDraft 等回退逻辑放行的危险默认值
export function runDeterministicIntentChecks(structured) {
  const findings = [];
  const intents = Array.isArray(structured?.formIntents) ? structured.formIntents : [];

  intents.forEach((intent, index) => {
    const fields = intent?.fields && typeof intent.fields === "object" ? intent.fields : {};

    if (intent?.target === "ruleDraft") {
      const conditions = Array.isArray(fields.conditions) ? fields.conditions : [];
      const validConditions = conditions.filter(isValidConditionItem);
      if (validConditions.length === 0) {
        findings.push({
          index,
          target: "ruleDraft",
          reason: "缺少有效触发条件，应用时会被回退成 price_above 0 的危险默认值"
        });
        return;
      }
      const universeType = String(fields?.universe?.type || "manual");
      const symbols = Array.isArray(fields.symbols) ? fields.symbols.filter(Boolean) : [];
      if (universeType === "manual" && symbols.length === 0) {
        findings.push({ index, target: "ruleDraft", reason: "universe=manual 但 symbols 为空，规则永远无法命中" });
        return;
      }
      if (universeType === "us_all") {
        const maxScan = Number(fields?.universe?.maxScan);
        if (!isFiniteNumber(maxScan) || maxScan < 1 || maxScan > 10000) {
          findings.push({ index, target: "ruleDraft", reason: "maxScan 缺失或超出 1-10000 合理区间" });
        }
      }
      return;
    }

    if (intent?.target === "scheduleDraft") {
      const mode = String(fields.mode || "interval");
      if (mode !== "daily") {
        const intervalSec = Number(fields.intervalSec);
        if (!isFiniteNumber(intervalSec) || intervalSec < 30 || intervalSec > 86400) {
          findings.push({ index, target: "scheduleDraft", reason: "intervalSec 缺失或不在 30-86400 秒合理区间" });
        }
      }
      return;
    }

    if (intent?.target === "screenerPreset" || intent?.target === "financialPreset") {
      const universe = String(fields.universe || "us_all");
      if (universe === "us_all") {
        const maxScan = Number(fields.maxScan);
        const upperBound = intent.target === "screenerPreset" ? 10000 : 2000;
        if (!isFiniteNumber(maxScan) || maxScan < 1 || maxScan > upperBound) {
          findings.push({
            index,
            target: describeIntentTarget(intent),
            reason: `maxScan 缺失或超出 1-${upperBound} 合理区间`
          });
        }
      }
    }
  });

  return findings;
}

export function parseValidatorVerdictText(text, { intentCount = 0 } = {}) {
  const parsed = tryParseStructuredAiOutput(text);
  if (!parsed) {
    return {
      verdict: "needs_fix",
      rejectedIntents: [],
      notes: ["校验器输出无法解析，已按存疑处理；确定性校验结果仍然生效"]
    };
  }

  const rawVerdict = String(parsed.verdict || "").trim().toLowerCase();
  const verdict = rawVerdict === "approved" || rawVerdict === "rejected" ? rawVerdict : "needs_fix";
  const rejectedIntents = (Array.isArray(parsed.rejectedIntents) ? parsed.rejectedIntents : [])
    .map((item) => {
      const index = Number(item?.index);
      if (!Number.isInteger(index) || index < 0 || index >= intentCount) return null;
      const reason = String(item?.reason || "").trim();
      if (!reason) return null;
      return { index, reason };
    })
    .filter(Boolean);

  return {
    verdict,
    rejectedIntents,
    notes: sanitizeTextList(parsed.notes)
  };
}

export function applyValidatorVerdict({
  structured,
  verdict = null,
  deterministicFindings = [],
  refineUsed = false
}) {
  const intents = Array.isArray(structured?.formIntents) ? structured.formIntents : [];
  const rejectedIndexes = new Set();
  const rejected = [];

  const pushFinding = (finding, source) => {
    if (rejectedIndexes.has(finding.index)) return;
    rejectedIndexes.add(finding.index);
    rejected.push({
      index: finding.index,
      target: describeIntentTarget(intents[finding.index]),
      reason: finding.reason,
      source
    });
  };

  deterministicFindings.forEach((finding) => pushFinding(finding, "deterministic"));

  if (verdict && verdict.verdict === "rejected") {
    intents.forEach((_, index) => {
      pushFinding({ index, reason: `校验器整体否决：${verdict.notes[0] || "结构化输出整体不可靠"}` }, "validator");
    });
  } else if (verdict && verdict.verdict !== "approved") {
    verdict.rejectedIntents.forEach((item) => {
      pushFinding(
        { index: item.index, reason: item.reason },
        "validator"
      );
    });
  }

  const keptIntents = intents.filter((_, index) => !rejectedIndexes.has(index));
  const notes = [];
  if (verdict) {
    notes.push(...verdict.notes);
  } else {
    notes.push("仅执行了确定性校验（未运行 LLM 校验器）");
  }
  if (refineUsed) {
    notes.push("主角色已根据校验反馈重试一次，重试结果仅做确定性校验");
  }

  return {
    structured: {
      ...structured,
      formIntents: keptIntents
    },
    rejected,
    validation: {
      checked: true,
      verdict: verdict ? verdict.verdict : "deterministic_only",
      rejectedCount: rejected.length,
      refineUsed,
      reasons: rejected.map((item) => {
        const sourceLabel = item.source === "deterministic" ? "确定性校验" : "校验器";
        return `#${item.index} ${item.target}（${sourceLabel}）：${item.reason}`;
      }),
      notes: notes.filter(Boolean)
    }
  };
}
