import { executeDeepSeekTask } from "./ai-deepseek-executor.mjs";
import { normalizeAiRuntimeConfig } from "./ai-shared.mjs";
import { normalizeAiTaskResult } from "./ai-result-normalizer.mjs";
import { createAiTaskDefinition } from "./ai-task-registry.mjs";
import { buildAiExecutionPlan } from "./ai-planner.mjs";
import { runPipelinePlan } from "./ai-pipeline-runner.mjs";

const EXECUTORS = {
  deepseek: executeDeepSeekTask
};

const MAX_TOOL_ROUNDS = 4;

// OpenAI 兼容 function calling 循环：模型请求工具 -> 执行 -> 回填 -> 继续推理
// 最后一轮去掉 tools，强制模型产出最终文本而不是继续请求工具
function wrapExecutorWithToolLoop(executor, { tools, executeToolCall }) {
  return async ({ runtimeConfig, task, executionPlan, modelOverride }) => {
    const messages = Array.isArray(task.messages) ? task.messages.slice() : [];
    let round = 0;
    let result = null;
    while (true) {
      const useTools = round < MAX_TOOL_ROUNDS ? tools : null;
      result = await executor({
        runtimeConfig,
        task: { ...task, messages },
        executionPlan,
        modelOverride,
        tools: useTools
      });
      const pendingCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : [];
      if (pendingCalls.length === 0) break;
      if (round >= MAX_TOOL_ROUNDS) break;
      messages.push({
        role: "assistant",
        content: String(result?.text || ""),
        tool_calls: pendingCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments || {}) }
        }))
      });
      for (const call of pendingCalls) {
        const toolResult = await executeToolCall(call);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult)
        });
      }
      round += 1;
    }
    return { ...result, toolRounds: round };
  };
}

function buildSingleTaskPlan({ task, runtimeConfig }) {
  return {
    entrypoint: "desktop.ai.explain",
    mode: runtimeConfig.orchestration.mode,
    steps: [
      {
        id: `${task.id}:primary`,
        role: task.orchestrationHints.role,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
        schemaVersion: runtimeConfig.structuredOutput.schemaVersion
      }
    ],
    futureExpansion: {
      planner: runtimeConfig.orchestration.planner,
      fanOutEnabled: runtimeConfig.orchestration.fanOutEnabled,
      suggestedRoles: task.orchestrationHints.nextExpansion
    }
  };
}

async function runSingleTask({ runtimeConfig, task, executor }) {
  const executionPlan = buildSingleTaskPlan({ task, runtimeConfig });
  const providerResult = await executor({ runtimeConfig, task, executionPlan });
  const normalized = normalizeAiTaskResult({ task, runtimeConfig, providerResult });
  return {
    ...normalized,
    orchestration: {
      ...normalized.orchestration,
      entrypoint: executionPlan.entrypoint,
      steps: executionPlan.steps,
      futureExpansion: executionPlan.futureExpansion
    }
  };
}

async function runAgentPipeline({ runtimeConfig, task, executor }) {
  const plan = await buildAiExecutionPlan({ task, runtimeConfig, executor });
  const pipeline = await runPipelinePlan({ plan, task, runtimeConfig, executor });

  // builder 模式的归一化必须基于主角色（或 refine 后）的原始输出，综合器不参与结构化合并
  const providerResultForNormalize = task.mode === "builder" && pipeline.builderPrimaryResult
    ? pipeline.builderPrimaryResult
    : pipeline.finalProviderResult;

  const normalized = normalizeAiTaskResult({
    task,
    runtimeConfig,
    providerResult: providerResultForNormalize,
    pipeline: task.mode === "builder"
      ? {
          validatorVerdict: pipeline.validatorVerdict,
          verdictApplies: pipeline.verdictApplies,
          refineUsed: pipeline.refineUsed
        }
      : null
  });

  return {
    ...normalized,
    orchestration: {
      ...normalized.orchestration,
      entrypoint: "desktop.ai.explain",
      mode: runtimeConfig.orchestration.mode,
      planner: runtimeConfig.orchestration.planner,
      maxSteps: runtimeConfig.orchestration.maxSteps,
      strategy: pipeline.strategy,
      fallbackReason: pipeline.fallbackReason,
      plannedStepCount: pipeline.plannedStepCount,
      executedStepCount: pipeline.executedStepCount,
      plannedRoles: pipeline.trace.map((step) => step.role),
      steps: pipeline.trace,
      futureExpansion: {
        planner: runtimeConfig.orchestration.planner,
        fanOutEnabled: runtimeConfig.orchestration.fanOutEnabled,
        suggestedRoles: task.orchestrationHints.nextExpansion
      }
    }
  };
}

export function createAiOrchestrator({ executors = EXECUTORS } = {}) {
  async function runAiTask({ cfg, kind, mode, payload, tools = null, executeToolCall = null }) {
    const runtimeConfig = normalizeAiRuntimeConfig(cfg?.ai);
    const task = createAiTaskDefinition({ kind, mode, payload });
    let executor = executors[runtimeConfig.provider];

    if (!executor) {
      throw new Error(`当前桌面端仅支持 DeepSeek，收到 provider=${runtimeConfig.provider}`);
    }

    // 工具调用只对开放助手聊天开放：builder 任务依赖 json_object 输出，与 tools 参数混用风险高
    if (kind === "assistant" && mode === "chat" && Array.isArray(tools) && tools.length > 0 && typeof executeToolCall === "function") {
      executor = wrapExecutorWithToolLoop(executor, { tools, executeToolCall });
    }

    if (runtimeConfig.orchestration.mode === "agent_pipeline") {
      return runAgentPipeline({ runtimeConfig, task, executor });
    }
    return runSingleTask({ runtimeConfig, task, executor });
  }

  return { runAiTask };
}

const defaultOrchestrator = createAiOrchestrator();

export const runAiTask = defaultOrchestrator.runAiTask;
