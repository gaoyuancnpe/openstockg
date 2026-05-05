import { executeDeepSeekTask } from "./ai-deepseek-executor.mjs";
import { normalizeAiRuntimeConfig } from "./ai-shared.mjs";
import { normalizeAiTaskResult } from "./ai-result-normalizer.mjs";
import { createAiTaskDefinition } from "./ai-task-registry.mjs";

const EXECUTORS = {
  deepseek: executeDeepSeekTask
};

function buildExecutionPlan({ task, runtimeConfig }) {
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

export async function runAiTask({ cfg, kind, mode, payload }) {
  const runtimeConfig = normalizeAiRuntimeConfig(cfg?.ai);
  const task = createAiTaskDefinition({ kind, mode, payload });
  const executionPlan = buildExecutionPlan({ task, runtimeConfig });
  const executor = EXECUTORS[runtimeConfig.provider];

  if (!executor) {
    throw new Error(`当前桌面端仅支持 DeepSeek，收到 provider=${runtimeConfig.provider}`);
  }

  const providerResult = await executor({
    runtimeConfig,
    task,
    executionPlan
  });

  const normalized = normalizeAiTaskResult({
    task,
    runtimeConfig,
    providerResult
  });

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
