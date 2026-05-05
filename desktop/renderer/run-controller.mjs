export function createRunController({ el, state, appendLog }) {
  function setRunButtonsBusy(busy) {
    state.runBusy = Boolean(busy);
    const disabled = state.runBusy;
    for (const button of [el.btnDryRunOnce, el.btnRunOnce, el.btnStart]) {
      if (!button) continue;
      button.disabled = disabled;
    }
  }

  async function runOnce({ dryRun, provider }) {
    if (state.runBusy) {
      appendLog("当前已有运行任务进行中，请稍候。");
      return;
    }

    setRunButtonsBusy(true);
    appendLog(dryRun ? "开始模拟运行..." : "开始真实跑一次...");
    if (dryRun && provider === "fmp") {
      appendLog("当前为 FMP 模式：首次冷启动可能需要数分钟，日志会持续刷新进度。");
    }

    try {
      await window.api.runOnce({ dryRun });
      appendLog(dryRun ? "模拟运行完成" : "执行完成");
    } catch (error) {
      appendLog(`${dryRun ? "模拟运行失败" : "执行失败"}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunButtonsBusy(false);
    }
  }

  async function start() {
    if (state.runBusy) {
      appendLog("当前已有运行任务进行中，请稍候。");
      return;
    }
    await window.api.start();
    appendLog("已启动常驻");
  }

  async function stop() {
    await window.api.stop();
    appendLog("已停止");
  }

  return {
    runOnce,
    setRunButtonsBusy,
    start,
    stop
  };
}
