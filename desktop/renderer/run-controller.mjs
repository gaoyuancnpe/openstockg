export function createRunController({ el, state, appendLog, getConfigFromInputs }) {
  function setRunButtonsBusy(busy) {
    state.runBusy = Boolean(busy);
    const disabled = state.runBusy;
    for (const button of [el.btnDryRunOnce, el.btnRunOnce, el.btnRunOnceIgnoreCooldown, el.btnStart]) {
      if (!button) continue;
      button.disabled = disabled;
    }
  }

  async function syncRuntimeInputs() {
    const cfg = typeof getConfigFromInputs === "function" ? getConfigFromInputs() : null;
    if (cfg) {
      await window.api.saveConfig(cfg);
      state.config = cfg;
    }
    await window.api.saveRules(state.rules);
  }

  async function runOnce({ dryRun, provider, ignoreCooldown = false }) {
    if (state.runBusy) {
      appendLog("当前已有运行任务进行中，请稍候。");
      return;
    }

    setRunButtonsBusy(true);
    if (dryRun) {
      appendLog("开始模拟运行...");
    } else if (ignoreCooldown) {
      appendLog("开始真实跑一次（忽略冷却）...");
      appendLog("本次调试运行将忽略冷却限制，命中后会直接进入通知链路。");
    } else {
      appendLog("开始真实跑一次...");
    }
    if (dryRun && provider === "fmp") {
      appendLog("当前为 FMP 模式：首次冷启动可能需要数分钟，日志会持续刷新进度。");
    }

    try {
      await syncRuntimeInputs();
      await window.api.runOnce({ dryRun, ignoreCooldown });
      appendLog(dryRun ? "模拟运行完成" : (ignoreCooldown ? "执行完成（忽略冷却）" : "执行完成"));
    } catch (error) {
      appendLog(`${dryRun ? "模拟运行失败" : (ignoreCooldown ? "执行失败（忽略冷却）" : "执行失败")}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunButtonsBusy(false);
    }
  }

  async function start() {
    if (state.runBusy) {
      appendLog("当前已有运行任务进行中，请稍候。");
      return;
    }
    try {
      await syncRuntimeInputs();
    } catch (error) {
      appendLog(`启动前同步失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const result = await window.api.start();
    const scheduler = result?.scheduler || null;
    const mode = String(scheduler?.mode || state.config?.scheduler?.mode || "interval");
    const nextRunAt = scheduler?.nextRunAt ? new Date(String(scheduler.nextRunAt)) : null;
    if (mode === "daily") {
      appendLog(`已启动常驻：daily 模式将等待到下一次设定时间执行${nextRunAt && !Number.isNaN(nextRunAt.getTime()) ? `，下次执行=${nextRunAt.toLocaleString("zh-CN", { hour12: false })}` : ""}`);
    } else {
      appendLog("已启动常驻：interval 模式会立即执行一轮，并继续按间隔调度");
    }
  }

  async function stop() {
    const result = await window.api.stop();
    const stopReason = result?.scheduler?.lastStopReason?.message || "用户主动停止，后续不再调度";
    appendLog(`已停止：${stopReason}`);
  }

  return {
    runOnce,
    setRunButtonsBusy,
    start,
    stop
  };
}
