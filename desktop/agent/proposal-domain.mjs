import { randomBytes, randomUUID } from "node:crypto";

export const DEFAULT_PROPOSAL_TTL_SEC = 300;

function createProposalToken() {
  return randomBytes(4).toString("hex");
}

function formatProposalIntentSummary(intent) {
  if (intent?.target === "ruleDraft") {
    return `规则：${String(intent?.fields?.name || "AI 建议规则").trim() || "AI 建议规则"}`;
  }
  if (intent?.target === "scheduleDraft") {
    const mode = String(intent?.fields?.mode || "interval");
    if (mode === "daily") {
      return `定时：每日 ${String(intent?.fields?.dailyTime || "09:30")} ${intent?.fields?.weekdaysOnly === false ? "（含周末）" : "（工作日）"}`;
    }
    return `定时：每 ${Number(intent?.fields?.intervalSec || 60)} 秒`;
  }
  return String(intent?.target || "未知动作");
}

export function summarizeProposalIntents(intents) {
  const normalized = Array.isArray(intents) ? intents : [];
  return normalized.map(formatProposalIntentSummary).filter(Boolean);
}

export function buildProposalResultText(proposal) {
  const summaryLines = summarizeProposalIntents(proposal?.intents || []);
  return [
    `已生成待确认变更：${proposal?.id || "-"}`,
    ...summaryLines.map((line, index) => `${index + 1}. ${line}`),
    proposal?.expiresAt ? `有效期至：${proposal.expiresAt}` : "",
    proposal?.confirmCommand ? `确认命令：${proposal.confirmCommand}` : "",
    proposal?.rejectCommand ? `拒绝命令：${proposal.rejectCommand}` : ""
  ].filter(Boolean).join("\n");
}

export function createActionProposal({
  source = "assistant",
  actor = {},
  prompt = "",
  intents = [],
  aiResult = null,
  ttlSec = DEFAULT_PROPOSAL_TTL_SEC
}) {
  const id = randomUUID().slice(0, 8);
  const token = createProposalToken();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(30, Number(ttlSec || DEFAULT_PROPOSAL_TTL_SEC)) * 1000).toISOString();
  const next = {
    id,
    token,
    source: String(source || "assistant"),
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    prompt: String(prompt || ""),
    actor: {
      channel: String(actor?.channel || "unknown"),
      userId: String(actor?.userId || ""),
      userName: String(actor?.userName || "")
    },
    intents: Array.isArray(intents) ? intents : [],
    aiSummary: String(aiResult?.text || ""),
    audit: [
      {
        type: "created",
        at: createdAt,
        actor: {
          channel: String(actor?.channel || "unknown"),
          userId: String(actor?.userId || ""),
          userName: String(actor?.userName || "")
        }
      }
    ]
  };
  next.confirmCommand = `/apply ${id} ${token}`;
  next.rejectCommand = `/reject ${id}`;
  return next;
}

export function isProposalExpired(proposal, now = Date.now()) {
  const expiresAt = proposal?.expiresAt ? new Date(String(proposal.expiresAt)) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() <= now;
}

export function validateProposalConfirmation(proposal, {
  token,
  actor,
  allowRemoteApply = false,
  now = Date.now()
} = {}) {
  if (!proposal || typeof proposal !== "object") {
    return "待确认 proposal 不存在";
  }
  if (proposal.status !== "pending") {
    return `该 proposal 当前状态为 ${proposal.status}，不能再次确认`;
  }
  if (!allowRemoteApply) {
    return "当前配置未开启飞书确认后直接应用";
  }
  if (isProposalExpired(proposal, now)) {
    return "该 proposal 已过期，请重新生成";
  }
  if (String(proposal.token || "") !== String(token || "")) {
    return "确认口令不匹配";
  }
  if (String(proposal.actor?.userId || "") && String(actor?.userId || "") !== String(proposal.actor.userId)) {
    return "当前确认人不是原始发起人";
  }
  return "";
}

export function updateProposalStatus(proposal, status, auditEntry = null) {
  const next = {
    ...(proposal && typeof proposal === "object" ? proposal : {}),
    status: String(status || "pending"),
    updatedAt: new Date().toISOString()
  };
  next.audit = Array.isArray(proposal?.audit) ? proposal.audit.slice() : [];
  if (auditEntry && typeof auditEntry === "object") {
    next.audit.push({
      ...auditEntry,
      at: auditEntry.at || next.updatedAt
    });
  }
  return next;
}
