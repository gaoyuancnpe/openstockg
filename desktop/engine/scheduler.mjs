import { computeNextDailyRunDate } from "./shared.mjs";

function buildSchedulerReason(code, message, extra = {}) {
  return {
    code: String(code || ""),
    message: String(message || ""),
    at: new Date().toISOString(),
    ...extra
  };
}

function getDefaultSchedulerStatus(mode = "interval") {
  return {
    isRunning: false,
    desiredRunning: false,
    mode,
    nextRunAt: "",
    lastRunAt: "",
    lastStartedAt: "",
    lastResumedAt: "",
    lastStoppedAt: "",
    lastStopReason: buildSchedulerReason("not_started", "应用未启动常驻"),
    lastResumeReason: null,
    lastSkip: null,
    lastMissedRun: null,
    lastCatchUp: null
  };
}

function parseDateOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createEngineScheduler({ loadConfig, tick, log, emitEvent }) {
  let timer = null;
  let dailyTimeout = null;
  let schedulerStatus = getDefaultSchedulerStatus();

  function clearTimers() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (dailyTimeout) {
      clearTimeout(dailyTimeout);
      dailyTimeout = null;
    }
  }

  function emitSchedulerStatus() {
    const payload = {
      type: "scheduler_status",
      ...schedulerStatus
    };
    if (typeof emitEvent === "function") {
      emitEvent(payload);
    }
    return { ...payload };
  }

  function updateSchedulerStatus(patch = {}) {
    schedulerStatus = {
      ...schedulerStatus,
      ...(patch && typeof patch === "object" ? patch : {})
    };
    return emitSchedulerStatus();
  }

  function computeIntervalMs(cfg, scheduler) {
    const intervalSec = Number.parseInt(String(scheduler.intervalSec ?? cfg.pollIntervalSec ?? "60"), 10);
    return (Number.isFinite(intervalSec) ? intervalSec : 60) * 1000;
  }

  async function runScheduledTick({ trigger = "scheduler", catchUpContext = null } = {}) {
    const result = await tick({ dryRun: false, trigger });
    if (result?.skipped && result.skipReason) {
      const patch = {
        lastSkip: buildSchedulerReason(result.skipReason.code, result.skipReason.message, {
          trigger
        })
      };
      if (catchUpContext) {
        patch.lastCatchUp = buildSchedulerReason(
          "catch_up_skipped",
          "检测到关闭期间错过执行，但补跑被跳过",
          {
            trigger,
            scheduledAt: catchUpContext.scheduledAt
          }
        );
      }
      updateSchedulerStatus(patch);
    } else if (result?.finishedAt) {
      const patch = {
        lastRunAt: String(result.finishedAt)
      };
      if (catchUpContext) {
        patch.lastCatchUp = buildSchedulerReason(
          "catch_up_completed",
          "检测到关闭期间错过执行，启动后已自动补跑一次",
          {
            trigger,
            scheduledAt: catchUpContext.scheduledAt,
            resumedAt: new Date().toISOString()
          }
        );
      }
      updateSchedulerStatus(patch);
    }
    return result;
  }

  function scheduleIntervalRepeats(intervalMs) {
    timer = setInterval(() => {
      updateSchedulerStatus({
        nextRunAt: new Date(Date.now() + intervalMs).toISOString()
      });
      void runScheduledTick({ trigger: "scheduler" }).catch((error) => {
        log(error instanceof Error ? error.message : String(error));
      });
    }, intervalMs);
  }

  async function startIntervalLoop({
    cfg,
    scheduler,
    sourceMode = "interval",
    autoResume = false,
    resumeNextRunAt = null,
    catchUpContext = null
  }) {
    const intervalMs = computeIntervalMs(cfg, scheduler);
    const startedAt = new Date().toISOString();
    const resumeDate = parseDateOrNull(resumeNextRunAt);
    const shouldDelayToSavedNextRun = autoResume && resumeDate && resumeDate.getTime() > Date.now();
    const shouldCatchUpNow = Boolean(autoResume && catchUpContext);

    updateSchedulerStatus({
      isRunning: true,
      desiredRunning: true,
      mode: "interval",
      nextRunAt: shouldDelayToSavedNextRun ? resumeDate.toISOString() : new Date(Date.now() + intervalMs).toISOString(),
      lastStartedAt: startedAt,
      lastResumedAt: autoResume ? startedAt : schedulerStatus.lastResumedAt,
      lastStopReason: null,
      lastResumeReason: autoResume
        ? buildSchedulerReason("auto_resume", "检测到上次退出前处于常驻状态，已自动恢复", {
          mode: "interval"
        })
        : null,
      lastMissedRun: shouldCatchUpNow
        ? buildSchedulerReason("missed_run", "检测到关闭期间错过一次执行，启动后将自动补跑一次", {
          mode: "interval",
          scheduledAt: catchUpContext.scheduledAt
        })
        : schedulerStatus.lastMissedRun
    });

    if (shouldDelayToSavedNextRun) {
      const delayMs = Math.max(0, resumeDate.getTime() - Date.now());
      log(`Engine resumed：恢复常驻 interval 调度，下次执行=${resumeDate.toLocaleString("zh-CN", { hour12: false })}`);
      dailyTimeout = setTimeout(() => {
        dailyTimeout = null;
        updateSchedulerStatus({
          nextRunAt: new Date(Date.now() + intervalMs).toISOString()
        });
        void runScheduledTick({ trigger: "scheduler_resume" }).catch((error) => {
          log(error instanceof Error ? error.message : String(error));
        });
        scheduleIntervalRepeats(intervalMs);
      }, delayMs);
      return emitSchedulerStatus();
    }

    if (shouldCatchUpNow) {
      log(`Engine resumed：检测到 interval 模式错过执行，已触发一次补跑（原计划时间=${catchUpContext.scheduledAt}）`);
      void runScheduledTick({
        trigger: "scheduler_catchup",
        catchUpContext
      }).catch((error) => {
        log(error instanceof Error ? error.message : String(error));
      });
    } else {
      void runScheduledTick({ trigger: "scheduler" }).catch((error) => {
        log(error instanceof Error ? error.message : String(error));
      });
    }

    scheduleIntervalRepeats(intervalMs);

    if (sourceMode === "daily") {
      log("Invalid dailyTime, fallback to interval mode");
    } else if (autoResume) {
      log("Engine resumed");
    } else {
      log("Engine started");
    }
    return emitSchedulerStatus();
  }

  function scheduleDailyLoop({
    dailyTime,
    weekdaysOnly,
    cfg,
    scheduler,
    firstRunAt = null,
    autoResume = false,
    catchUpContext = null
  }) {
    const explicitFirstRun = parseDateOrNull(firstRunAt);
    const nextRunDate = explicitFirstRun && explicitFirstRun.getTime() > Date.now()
      ? explicitFirstRun
      : computeNextDailyRunDate({ timeHHMM: dailyTime, weekdaysOnly });
    if (!nextRunDate) {
      return startIntervalLoop({ cfg, scheduler, sourceMode: "daily", autoResume, catchUpContext });
    }

    updateSchedulerStatus({
      isRunning: true,
      desiredRunning: true,
      mode: "daily",
      nextRunAt: nextRunDate.toISOString(),
      lastStopReason: null,
      lastResumedAt: autoResume ? new Date().toISOString() : schedulerStatus.lastResumedAt,
      lastResumeReason: autoResume
        ? buildSchedulerReason("auto_resume", "检测到上次退出前处于常驻状态，已自动恢复", {
          mode: "daily"
        })
        : null,
      lastMissedRun: catchUpContext
        ? buildSchedulerReason("missed_run", "检测到关闭期间错过一次执行，启动后将自动补跑一次", {
          mode: "daily",
          scheduledAt: catchUpContext.scheduledAt
        })
        : schedulerStatus.lastMissedRun
    });

    if (catchUpContext) {
      log(`Engine resumed：检测到 daily 模式错过执行，已触发一次补跑（原计划时间=${catchUpContext.scheduledAt}）`);
      void runScheduledTick({
        trigger: "scheduler_catchup",
        catchUpContext
      }).catch((error) => {
        log(error instanceof Error ? error.message : String(error));
      }).finally(() => {
        if (schedulerStatus.isRunning) {
          void scheduleDailyLoop({ dailyTime, weekdaysOnly, cfg, scheduler, autoResume: false });
        }
      });
      log("Engine resumed");
      return emitSchedulerStatus();
    }

    dailyTimeout = setTimeout(() => {
      dailyTimeout = null;
      void (async () => {
        try {
          await runScheduledTick({ trigger: explicitFirstRun && autoResume ? "scheduler_resume" : "scheduler" });
        } catch (error) {
          log(error instanceof Error ? error.message : String(error));
        } finally {
          if (schedulerStatus.isRunning) {
            void scheduleDailyLoop({ dailyTime, weekdaysOnly, cfg, scheduler });
          }
        }
      })();
    }, Math.max(0, nextRunDate.getTime() - Date.now()));

    log(autoResume ? "Engine resumed" : "Engine started");
    return emitSchedulerStatus();
  }

  return {
    start: async ({ autoResume = false, resumeState = null } = {}) => {
      if (timer || dailyTimeout || schedulerStatus.isRunning) {
        return emitSchedulerStatus();
      }

      const cfg = await loadConfig();
      const scheduler = cfg.scheduler || {
        mode: "interval",
        intervalSec: cfg.pollIntervalSec || 60,
        dailyTime: "09:30",
        weekdaysOnly: true
      };
      const mode = String(scheduler.mode || "interval");
      const dailyTime = String(scheduler.dailyTime || "09:30");
      const weekdaysOnly = Boolean(scheduler.weekdaysOnly);
      const startedAt = new Date().toISOString();
      const savedNextRunAt = parseDateOrNull(resumeState?.nextRunAt);
      const missedRunDate = autoResume && savedNextRunAt && savedNextRunAt.getTime() <= Date.now() ? savedNextRunAt : null;
      const catchUpContext = missedRunDate
        ? {
          scheduledAt: missedRunDate.toISOString()
        }
        : null;

      schedulerStatus = {
        ...schedulerStatus,
        isRunning: true,
        desiredRunning: true,
        mode,
        lastStartedAt: startedAt,
        lastStopReason: null,
        lastResumeReason: autoResume ? buildSchedulerReason("auto_resume", "检测到上次退出前处于常驻状态，已自动恢复", { mode }) : null
      };

      if (mode === "daily") {
        return scheduleDailyLoop({
          dailyTime,
          weekdaysOnly,
          cfg,
          scheduler,
          firstRunAt: !missedRunDate ? savedNextRunAt?.toISOString() : "",
          autoResume,
          catchUpContext
        });
      }

      return startIntervalLoop({
        cfg,
        scheduler,
        autoResume,
        resumeNextRunAt: !missedRunDate ? savedNextRunAt?.toISOString() : "",
        catchUpContext
      });
    },
    stop: () => {
      clearTimers();
      const stopReason = buildSchedulerReason("manual_stop", "用户主动停止，后续不再调度");
      schedulerStatus = {
        ...schedulerStatus,
        isRunning: false,
        desiredRunning: false,
        nextRunAt: "",
        lastStoppedAt: stopReason.at,
        lastStopReason: stopReason
      };
      log("Engine stopped");
      return emitSchedulerStatus();
    },
    getStatus: () => ({
      ...schedulerStatus
    }),
    getDefaultStatus: (mode = "interval") => getDefaultSchedulerStatus(mode)
  };
}
