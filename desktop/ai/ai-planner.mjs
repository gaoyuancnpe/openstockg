import {
  PRIMARY_ROLE_ID,
  buildPlannerMessages,
  getAgentRoleDefinition,
  selectFanOutAnalystRoles
} from "./ai-agent-roles.mjs";
import { tryParseStructuredAiOutput } from "./ai-shared.mjs";

// 计划统一为扁平 steps：[{ id, role, purpose, allowRefine }]
// 连续的 branch 类角色在 fanOutEnabled 时由执行器自动分组为并行组
function createPlanStep(task, index, role, purpose = "", allowRefine = false) {
  return {
    id: `${task.id}:step-${index}:${role}`,
    role,
    purpose: String(purpose || ""),
    allowRefine: Boolean(allowRefine)
  };
}

export function buildPassthroughPlan({ task }) {
  return {
    strategy: "passthrough",
    steps: [createPlanStep(task, 1, PRIMARY_ROLE_ID, "单步执行主角色")]
  };
}

export function buildRolePipelinePlan({ task, orchestration }) {
  const maxSteps = Number(orchestration?.maxSteps || 4);
  const steps = [];

  const builderWithTargets = task.mode === "builder" && Array.isArray(task.mappingTargets) && task.mappingTargets.length > 0;
  if (builderWithTargets) {
    steps.push(createPlanStep(task, 1, PRIMARY_ROLE_ID, "生成结构化输出与表单建议"));
    if (orchestration?.validatorEnabled !== false) {
      // 预算至少容纳 primary + validator + 一次 refine 时才允许重试
      const allowRefine = maxSteps >= 3;
      steps.push(createPlanStep(task, 2, "validator", "复核 formIntents 是否可放行", allowRefine));
    }
    return { strategy: "role_pipeline", steps };
  }

  if (task.kind === "assistant" && task.mode === "chat") {
    const analysts = selectFanOutAnalystRoles(task);
    if (analysts.length >= 2 && orchestration?.fanOutEnabled !== false && maxSteps >= analysts.length + 1) {
      analysts.forEach((role, offset) => {
        steps.push(createPlanStep(task, offset + 1, role, "并行分支分析"));
      });
      steps.push(createPlanStep(task, analysts.length + 1, "synthesizer", "汇总并行分支结论"));
      return { strategy: "role_pipeline", steps };
    }
    if (analysts.length >= 1) {
      const role = analysts[0];
      steps.push(createPlanStep(task, 1, role, "单分支分析，直接作为最终回答"));
      return { strategy: "role_pipeline", steps };
    }
    // 无可协作上下文时退回主角色单步，避免无意义的额外调用
    return { strategy: "role_pipeline", steps: [createPlanStep(task, 1, PRIMARY_ROLE_ID, "无可协作上下文，单步执行")] };
  }

  return { strategy: "role_pipeline", steps: [createPlanStep(task, 1, PRIMARY_ROLE_ID, "单步执行主角色")] };
}

function validateLlmPlanSteps(parsed, { task, maxSteps }) {
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) return null;
  if (parsed.steps.length > maxSteps) return null;

  const roleIds = new Set(["primary", "validator", "synthesizer", "rule_reviewer", "diagnostics_advisor"]);
  const seenPrimary = { count: 0 };
  const steps = [];

  for (const rawStep of parsed.steps) {
    const role = String(rawStep?.role || "").trim();
    if (!roleIds.has(role)) return null;
    if (role === PRIMARY_ROLE_ID) {
      seenPrimary.count += 1;
      if (seenPrimary.count > 1) return null;
    }
    const definition = getAgentRoleDefinition(role);
    if (definition && typeof definition.appliesTo === "function" && !definition.appliesTo(task)) return null;
    steps.push({
      id: "",
      role,
      purpose: String(rawStep?.purpose || ""),
      allowRefine: role === "validator"
    });
  }

  if (seenPrimary.count !== 1) return null;
  return steps;
}

export async function buildLlmPlannerPlan({ task, runtimeConfig, executor }) {
  const maxSteps = Number(runtimeConfig?.orchestration?.maxSteps || 4);
  const plannerTask = {
    id: `${task.id}:planner`,
    kind: task.kind,
    mode: "chat",
    subject: task.subject,
    messages: buildPlannerMessages({ task, runtimeConfig })
  };

  try {
    const providerResult = await executor({
      runtimeConfig,
      task: plannerTask,
      executionPlan: { entrypoint: "desktop.ai.plan" },
      modelOverride: runtimeConfig?.orchestration?.roleModels?.planner || ""
    });
    const parsed = tryParseStructuredAiOutput(providerResult?.text);
    const steps = validateLlmPlanSteps(parsed, { task, maxSteps });
    if (steps) {
      return {
        strategy: "llm_planner",
        steps: steps.map((step, index) => ({ ...step, id: `${task.id}:step-${index + 1}:${step.role}` }))
      };
    }
  } catch {
    // 规划调用失败时静默回退到确定性流水线，错误信息进执行轨迹
  }

  const fallback = buildRolePipelinePlan({ task, orchestration: runtimeConfig?.orchestration });
  return { ...fallback, strategy: "llm_planner_fallback", fallbackReason: "LLM 规划输出非法或调用失败，已回退内置流水线" };
}

export async function buildAiExecutionPlan({ task, runtimeConfig, executor }) {
  const orchestration = runtimeConfig?.orchestration || {};
  const planner = String(orchestration.planner || "role_pipeline");

  if (planner === "passthrough") return buildPassthroughPlan({ task });
  if (planner === "llm_planner") return buildLlmPlannerPlan({ task, runtimeConfig, executor });
  return buildRolePipelinePlan({ task, orchestration });
}
