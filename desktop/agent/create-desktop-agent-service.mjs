import { explainAiWithDeepSeek } from "../ai/ai-explainer.mjs";
import {
  loadDesktopActionProposals,
  loadDesktopConfig,
  loadDesktopRules,
  saveDesktopActionProposals,
  saveDesktopConfig,
  saveDesktopRules
} from "../main/data-store.mjs";
import {
  buildProposalResultText,
  createActionProposal,
  updateProposalStatus,
  validateProposalConfirmation
} from "./proposal-domain.mjs";
import { applyProposalIntents } from "./proposal-apply.mjs";

function looksLikeActionRequest(prompt) {
  const text = String(prompt || "");
  return /(规则|定时|调度|计划任务|每天|间隔|cron|提醒)/i.test(text);
}

function buildAssistantPayload({ prompt, attachments = [] }) {
  return {
    __ai: {
      prompt: String(prompt || "")
    },
    __assistant: {
      attachments: Array.isArray(attachments) ? attachments : []
    }
  };
}

export function createDesktopAgentService({ dataPaths, log, emitEvent }) {
  function writeLog(line) {
    if (typeof log === "function") log(String(line || ""));
  }

  function emitAgentEvent(event) {
    if (typeof emitEvent === "function") emitEvent(event);
  }

  async function loadConfig() {
    return loadDesktopConfig(dataPaths);
  }

  async function chat({ prompt, attachments = [] }) {
    const cfg = await loadConfig();
    return explainAiWithDeepSeek({
      cfg,
      kind: "assistant",
      mode: "chat",
      payload: buildAssistantPayload({ prompt, attachments })
    });
  }

  async function createProposal({ prompt, actor, attachments = [], source = "assistant" }) {
    const cfg = await loadConfig();
    const aiResult = await explainAiWithDeepSeek({
      cfg,
      kind: "assistant",
      mode: "builder",
      payload: buildAssistantPayload({ prompt, attachments })
    });
    const intents = Array.isArray(aiResult?.formMapping?.intents)
      ? aiResult.formMapping.intents.filter((intent) => intent?.target === "ruleDraft" || intent?.target === "scheduleDraft")
      : [];
    if (intents.length === 0) {
      return { aiResult, proposal: null };
    }

    const proposals = await loadDesktopActionProposals(dataPaths);
    const proposal = createActionProposal({
      source,
      actor,
      prompt,
      intents,
      aiResult,
      ttlSec: cfg?.feishu?.confirmTtlSec
    });
    await saveDesktopActionProposals(dataPaths, [proposal, ...proposals].slice(0, 100));
    writeLog(`Agent proposal created ${proposal.id}，动作=${intents.map((item) => item.target).join(",")}`);
    emitAgentEvent({
      type: "agent_proposal_status",
      proposalId: proposal.id,
      status: proposal.status,
      source,
      actor: proposal.actor,
      expiresAt: proposal.expiresAt
    });
    return { aiResult, proposal };
  }

  async function rejectProposal({ proposalId, actor, source = "assistant" }) {
    const proposals = await loadDesktopActionProposals(dataPaths);
    const next = [];
    let matched = null;
    for (const proposal of proposals) {
      if (String(proposal?.id || "") !== String(proposalId || "")) {
        next.push(proposal);
        continue;
      }
      matched = updateProposalStatus(proposal, "rejected", {
        type: "rejected",
        actor
      });
      next.push(matched);
    }
    if (!matched) {
      return { ok: false, message: "未找到对应 proposal。" };
    }
    await saveDesktopActionProposals(dataPaths, next);
    writeLog(`Agent proposal rejected ${proposalId}`);
    emitAgentEvent({
      type: "agent_proposal_status",
      proposalId,
      status: "rejected",
      source,
      actor
    });
    return { ok: true, message: `已拒绝 proposal ${proposalId}。` };
  }

  async function applyProposal({ proposalId, token, actor, source = "assistant" }) {
    const cfg = await loadDesktopConfig(dataPaths);
    const proposals = await loadDesktopActionProposals(dataPaths);
    const proposal = proposals.find((item) => String(item?.id || "") === String(proposalId || ""));
    const validationMessage = validateProposalConfirmation(proposal, {
      token,
      actor,
      allowRemoteApply: Boolean(cfg?.feishu?.allowRemoteApply)
    });
    if (validationMessage) {
      return { ok: false, message: validationMessage };
    }

    const currentRules = await loadDesktopRules(dataPaths);
    const applyResult = applyProposalIntents({
      currentRules,
      currentConfig: cfg,
      intents: proposal.intents
    });
    await saveDesktopRules(dataPaths, applyResult.rules);
    await saveDesktopConfig(dataPaths, applyResult.config);

    const nextProposals = proposals.map((item) => {
      if (String(item?.id || "") !== String(proposalId || "")) return item;
      return updateProposalStatus(item, "applied", {
        type: "applied",
        actor,
        changes: applyResult.appliedChanges
      });
    });
    await saveDesktopActionProposals(dataPaths, nextProposals);
    writeLog(`Agent proposal applied ${proposalId}：${applyResult.appliedChanges.join("；")}`);
    emitAgentEvent({
      type: "agent_proposal_status",
      proposalId,
      status: "applied",
      source,
      actor,
      changes: applyResult.appliedChanges
    });
    return {
      ok: true,
      message: `已应用 proposal ${proposalId}：${applyResult.appliedChanges.join("；")}`,
      changes: applyResult.appliedChanges
    };
  }

  async function handlePrompt({ prompt, actor, attachments = [], source = "assistant" }) {
    if (looksLikeActionRequest(prompt)) {
      const result = await createProposal({ prompt, actor, attachments, source });
      if (result.proposal) {
        return {
          mode: "proposal",
          text: [String(result.aiResult?.text || "").trim(), buildProposalResultText(result.proposal)].filter(Boolean).join("\n\n"),
          proposal: result.proposal,
          aiResult: result.aiResult
        };
      }
      return {
        mode: "chat",
        text: String(result.aiResult?.text || "").trim() || "当前没有形成可执行 proposal。",
        proposal: null,
        aiResult: result.aiResult
      };
    }

    const aiResult = await chat({ prompt, attachments });
    return {
      mode: "chat",
      text: String(aiResult?.text || "").trim(),
      proposal: null,
      aiResult
    };
  }

  return {
    applyProposal,
    chat,
    createProposal,
    handlePrompt,
    rejectProposal
  };
}
