import { explainAiWithDeepSeek } from "../ai/ai-explainer.mjs";
import {
  loadDesktopConfig,
  loadDesktopRules,
  loadDesktopState,
  saveDesktopState
} from "../main/data-store.mjs";
import { createAlertsRunner } from "./alerts-runner.mjs";
import { createEngineScheduler } from "./scheduler.mjs";
import { createScreenerService } from "./screener-service.mjs";

export function createAlertsEngine({ dataPaths, onLog, onEvent }) {
  const log = (line) => {
    if (onLog) onLog(String(line));
  };

  const emitEvent = (event) => {
    if (onEvent) onEvent(event);
  };

  async function loadConfig() {
    return loadDesktopConfig(dataPaths);
  }

  async function loadRules() {
    return loadDesktopRules(dataPaths);
  }

  async function loadState() {
    return loadDesktopState(dataPaths);
  }

  async function saveState(state) {
    await saveDesktopState(dataPaths, state);
  }

  const runner = createAlertsRunner({
    dataPaths,
    loadConfig,
    loadRules,
    loadState,
    saveState,
    log,
    emitEvent
  });
  const scheduler = createEngineScheduler({ loadConfig, tick: runner.tick, log });
  const screenerService = createScreenerService({ dataPaths, loadConfig, loadState, saveState, log });

  return {
    start: scheduler.start,
    stop: scheduler.stop,
    runOnce: async ({ dryRun }) => {
      await runner.tick({ dryRun: Boolean(dryRun) });
    },
    runScreener: screenerService.runScreener,
    explainAiTarget: async ({ kind, mode, payload }) => {
      const cfg = await loadConfig();
      return explainAiWithDeepSeek({ cfg, kind, mode, payload });
    },
    explainFinancialRow: async ({ row }) => {
      const cfg = await loadConfig();
      return explainAiWithDeepSeek({ cfg, kind: "financial", mode: "chat", payload: row });
    },
    runFinancialScreener: screenerService.runFinancialScreener
  };
}
