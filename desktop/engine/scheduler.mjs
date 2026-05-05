import { computeNextDailyRunMs } from "./shared.mjs";

export function createEngineScheduler({ loadConfig, tick, log }) {
  let timer = null;
  let dailyTimeout = null;

  return {
    start: () => {
      if (timer || dailyTimeout) return;
      const startLoop = async () => {
        const cfg = await loadConfig();
        const scheduler = cfg.scheduler || { mode: "interval", intervalSec: cfg.pollIntervalSec || 60, dailyTime: "09:30", weekdaysOnly: true };
        const mode = String(scheduler.mode || "interval");

        const intervalSec = Number.parseInt(String(scheduler.intervalSec ?? cfg.pollIntervalSec ?? "60"), 10);
        const intervalMs = (Number.isFinite(intervalSec) ? intervalSec : 60) * 1000;

        const dailyTime = String(scheduler.dailyTime || "09:30");
        const weekdaysOnly = Boolean(scheduler.weekdaysOnly);

        if (mode === "daily") {
          const scheduleNext = async () => {
            await tick({ dryRun: false });
            const delayMsAfterTick = computeNextDailyRunMs({ timeHHMM: dailyTime, weekdaysOnly });
            if (delayMsAfterTick === null) {
              log("Invalid dailyTime, fallback to interval mode");
              timer = setInterval(() => tick({ dryRun: false }), intervalMs);
              return;
            }

            dailyTimeout = setTimeout(() => {
              scheduleNext().catch((error) => log(error instanceof Error ? error.message : String(error)));
            }, delayMsAfterTick);
          };

          await scheduleNext();
          return;
        }

        await tick({ dryRun: false });
        timer = setInterval(() => tick({ dryRun: false }), intervalMs);
      };

      startLoop().catch((error) => log(error instanceof Error ? error.message : String(error)));
      log("Engine started");
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (dailyTimeout) {
        clearTimeout(dailyTimeout);
        dailyTimeout = null;
      }
      log("Engine stopped");
    }
  };
}

