import { runAiTask } from "./ai-orchestrator.mjs";

export async function explainAiWithDeepSeek({ cfg, kind, mode, payload, tools = null, executeToolCall = null }) {
  return runAiTask({ cfg, kind, mode, payload, tools, executeToolCall });
}
