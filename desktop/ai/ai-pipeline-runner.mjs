import {
  PRIMARY_ROLE_ID,
  getAgentRoleDefinition,
  getAgentRoleLabel
} from "./ai-agent-roles.mjs";
import { parseValidatorVerdictText } from "./ai-validator.mjs";
import { tryParseStructuredAiOutput } from "./ai-shared.mjs";
import { resolveRoleModel } from "./ai-orchestration-config.mjs";

const ROLE_MODEL_SLOTS = {
  primary: "primary",
  validator: "validator",
  synthesizer: "synthesizer"
};

function createStepTask({ step, task, messages, mode }) {
  return {
    id: step.id,
    kind: task.kind,
    mode,
    subject: task.subject,
    messages
  };
}

function resolveStepModel({ runtimeConfig, role }) {
  const slot = ROLE_MODEL_SLOTS[role];
  if (!slot) return "";
  return resolveRoleModel({
    roleModels: runtimeConfig?.orchestration?.roleModels,
    slot,
    fallbackModel: slot === "primary" ? runtimeConfig?.model : ""
  });
}

function buildRefineMessages(task, verdict) {
  const problemLines = verdict?.rejectedIntents?.length
    ? verdict.rejectedIntents.map((item) => `- formIntents[${item.index}]：${item.reason}`).join("\n")
    : "";
  const noteLines = Array.isArray(verdict?.notes) && verdict.notes.length > 0
    ? verdict.notes.map((note) => `- ${note}`).join("\n")
    : "";
  return [
    ...task.messages,
    {
      role: "user",
      content:
        "你上一版结构化输出未通过校验器，请修正后重新输出完整的 JSON 对象（字段要求不变）。\n" +
        `${problemLines ? `被拒绝项：\n${problemLines}\n` : ""}` +
        `${noteLines ? `校验备注：\n${noteLines}\n` : ""}` +
        "只输出修正后的 JSON，不要解释。"
    }
  ];
}

// 连续的 branch 类角色在允许扇出时合并为一个并行组
function groupPlanSteps(steps, fanOutEnabled) {
  const groups = [];
  let pendingBranches = [];

  const flushBranches = () => {
    if (pendingBranches.length === 0) return;
    if (fanOutEnabled && pendingBranches.length >= 2) {
      groups.push({ type: "fan_out", steps: pendingBranches });
    } else {
      pendingBranches.forEach((step) => groups.push({ type: "single", steps: [step] }));
    }
    pendingBranches = [];
  };

  for (const step of steps) {
    const definition = getAgentRoleDefinition(step.role);
    if (definition?.outputKind === "branch") {
      pendingBranches.push(step);
      continue;
    }
    flushBranches();
    groups.push({ type: "single", steps: [step] });
  }
  flushBranches();
  return groups;
}

async function executeStep({ executor, runtimeConfig, task, step, messages, mode, trace, executedRef }) {
  const startedAt = Date.now();
  const model = resolveStepModel({ runtimeConfig, role: step.role });
  const baseTrace = {
    id: step.id,
    role: step.role,
    label: getAgentRoleLabel(step.role),
    provider: runtimeConfig.provider,
    model: model || runtimeConfig.model,
    status: "ok",
    durationMs: 0,
    summary: ""
  };

  try {
    const providerResult = await executor({
      runtimeConfig,
      task: createStepTask({ step, task, messages, mode }),
      executionPlan: { entrypoint: "desktop.ai.pipeline.step" },
      modelOverride: model
    });
    executedRef.count += 1;
    baseTrace.durationMs = Date.now() - startedAt;
    baseTrace.summary = summarizeStepOutput(step.role, providerResult?.text);
    return { ok: true, providerResult, trace: baseTrace };
  } catch (error) {
    baseTrace.status = "failed";
    baseTrace.durationMs = Date.now() - startedAt;
    baseTrace.summary = error instanceof Error ? error.message : String(error);
    return { ok: false, providerResult: null, trace: baseTrace };
  }
}

function summarizeStepOutput(role, text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (role === "validator") {
    const verdictMatch = clean.match(/"verdict"\s*:\s*"(approved|needs_fix|rejected)"/);
    if (verdictMatch) return `裁决=${verdictMatch[1]}`;
  }
  return clean.slice(0, 80) || "（无输出）";
}

export async function runPipelinePlan({ plan, task, runtimeConfig, executor }) {
  const maxSteps = Number(runtimeConfig?.orchestration?.maxSteps || 4);
  const executedRef = { count: 0 };
  const trace = [];
  const upstream = {
    primaryText: "",
    primaryStructured: null,
    branches: [],
    validatorVerdict: null
  };

  let primaryResult = null;
  let primaryRawText = "";
  let finalProviderResult = null;
  let refineUsed = false;

  const pushSkipped = (step, reason) => {
    trace.push({
      id: step.id,
      role: step.role,
      label: getAgentRoleLabel(step.role),
      provider: runtimeConfig.provider,
      model: resolveStepModel({ runtimeConfig, role: step.role }) || runtimeConfig.model,
      status: "skipped",
      durationMs: 0,
      summary: reason
    });
  };

  const runPrimaryStep = async (step, { refine = false } = {}) => {
    const definition = getAgentRoleDefinition(PRIMARY_ROLE_ID);
    const messages = refine
      ? buildRefineMessages(task, upstream.validatorVerdict)
      : definition.buildMessages({ task, upstream });
    const executed = await executeStep({
      executor,
      runtimeConfig,
      task,
      step: refine ? { ...step, id: `${step.id}:refine` } : step,
      messages,
      mode: task.mode === "builder" ? "builder" : "chat",
      trace,
      executedRef
    });
    trace.push(executed.trace);
    if (executed.ok) {
      primaryResult = executed.providerResult;
      primaryRawText = String(executed.providerResult?.text || "");
      upstream.primaryText = primaryRawText;
      upstream.primaryStructured = task.mode === "builder" ? tryParseStructuredAiOutput(primaryRawText) : null;
      if (getAgentRoleDefinition(PRIMARY_ROLE_ID).outputKind === "final") {
        finalProviderResult = executed.providerResult;
      }
      if (refine) refineUsed = true;
    }
    return executed.ok;
  };

  const groups = groupPlanSteps(plan.steps, runtimeConfig?.orchestration?.fanOutEnabled !== false);

  for (const group of groups) {
    // 组内首步前的预算检查（组内其余步各自再检查）
    if (executedRef.count >= maxSteps) {
      group.steps.forEach((step) => pushSkipped(step, `已达 maxSteps=${maxSteps} 预算，未执行`));
      continue;
    }

    if (group.type === "single") {
      const step = group.steps[0];
      if (step.role === PRIMARY_ROLE_ID) {
        await runPrimaryStep(step);
        continue;
      }

      const definition = getAgentRoleDefinition(step.role);
      if (!definition) {
        pushSkipped(step, "未知角色");
        continue;
      }

      const isValidator = step.role === "validator";
      const mode = isValidator ? "builder" : "chat";
      const executed = await executeStep({
        executor,
        runtimeConfig,
        task,
        step,
        messages: definition.buildMessages({ task, upstream }),
        mode,
        trace,
        executedRef
      });
      trace.push(executed.trace);

      if (!executed.ok) continue;

      if (isValidator) {
        const intentCount = Array.isArray(upstream.primaryStructured?.formIntents)
          ? upstream.primaryStructured.formIntents.length
          : 0;
        if (!upstream.primaryStructured && task.mode === "builder") {
          upstream.validatorVerdict = {
            verdict: "needs_fix",
            rejectedIntents: [],
            notes: ["主角色未返回可解析 JSON，需要重试"]
          };
        } else {
          upstream.validatorVerdict = parseValidatorVerdictText(executed.providerResult?.text, { intentCount });
        }

        const verdictNeedsFix = upstream.validatorVerdict.verdict === "needs_fix";
        const primaryStep = plan.steps.find((item) => item.role === PRIMARY_ROLE_ID);
        if (verdictNeedsFix && step.allowRefine && primaryStep && executedRef.count < maxSteps) {
          await runPrimaryStep(primaryStep, { refine: true });
        }
        continue;
      }

      if (definition.outputKind === "final") {
        finalProviderResult = executed.providerResult;
      }
      continue;
    }

    // fan_out 组：并行执行，单分支失败不致命
    const branchResults = await Promise.all(
      group.steps.map(async (step) => {
        if (executedRef.count >= maxSteps) {
          pushSkipped(step, `已达 maxSteps=${maxSteps} 预算，未执行`);
          return null;
        }
        const definition = getAgentRoleDefinition(step.role);
        const executed = await executeStep({
          executor,
          runtimeConfig,
          task,
          step,
          messages: definition.buildMessages({ task, upstream }),
          mode: "chat",
          trace,
          executedRef
        });
        trace.push(executed.trace);
        if (!executed.ok) return null;
        return { role: step.role, label: getAgentRoleLabel(step.role), text: String(executed.providerResult?.text || "") };
      })
    );
    branchResults.forEach((branch) => {
      if (branch) upstream.branches.push(branch);
    });
  }

  // 兜底：全部并行分支失败且尚无最终输出时，紧急执行主角色
  if (!finalProviderResult && !primaryResult && upstream.branches.length === 0 && executedRef.count < maxSteps) {
    const primaryStep = plan.steps.find((item) => item.role === PRIMARY_ROLE_ID) || {
      id: `${task.id}:step-1:primary`,
      role: PRIMARY_ROLE_ID
    };
    await runPrimaryStep(primaryStep);
  }

  if (!finalProviderResult && primaryResult) {
    finalProviderResult = primaryResult;
  }

  if (!finalProviderResult) {
    const failedStep = trace.find((item) => item.status === "failed");
    throw new Error(
      `智能体流水线没有产出任何结果${failedStep ? `（${failedStep.label}：${failedStep.summary}）` : ""}`
    );
  }

  return {
    finalProviderResult,
    builderPrimaryResult: task.mode === "builder" ? primaryResult : null,
    validatorVerdict: upstream.validatorVerdict,
    verdictApplies: !refineUsed,
    refineUsed,
    branches: upstream.branches,
    trace,
    strategy: plan.strategy,
    fallbackReason: plan.fallbackReason || null,
    plannedStepCount: plan.steps.length,
    executedStepCount: executedRef.count
  };
}
