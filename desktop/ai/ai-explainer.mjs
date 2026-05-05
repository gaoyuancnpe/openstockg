import { runAiTask } from "./ai-orchestrator.mjs";

export async function explainAiWithDeepSeek({ cfg, kind, mode, payload }) {
  return runAiTask({ cfg, kind, mode, payload });
}
