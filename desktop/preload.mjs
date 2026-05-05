import { contextBridge, ipcRenderer } from "electron";

function createRendererError(channel, error) {
  const nextError = new Error(error?.message || `${channel} 调用失败`);
  nextError.name = "DesktopIpcInvokeError";
  nextError.code = typeof error?.code === "string" && error.code ? error.code : "IPC_ERROR";
  nextError.channel = channel;
  if (error?.details !== undefined) {
    nextError.details = error.details;
  }
  return nextError;
}

function unwrapIpcResult(channel, result) {
  if (!result || typeof result !== "object" || !Object.prototype.hasOwnProperty.call(result, "ok")) {
    return result;
  }
  if (result.ok) {
    return result.data;
  }
  throw createRendererError(channel, result.error);
}

const invoke = (channel) => async (...args) => unwrapIpcResult(channel, await ipcRenderer.invoke(channel, ...args));
const subscribe = (channel) => (cb) => ipcRenderer.on(channel, (_evt, payload) => cb(payload));

const groupedApi = {
  paths: {
    get: invoke("paths:get")
  },
  config: {
    load: invoke("config:load"),
    save: invoke("config:save")
  },
  rules: {
    load: invoke("rules:load"),
    save: invoke("rules:save")
  },
  engine: {
    runOnce: invoke("engine:runOnce"),
    runScreener: invoke("engine:screener"),
    runFinancialScreener: invoke("engine:financialScreener"),
    explainAiTarget: invoke("engine:aiExplain"),
    explainFinancialRow: invoke("engine:financialExplain"),
    start: invoke("engine:start"),
    stop: invoke("engine:stop")
  },
  dev: {
    resetTestData: invoke("dev:resetTestData")
  },
  legal: {
    getInfo: invoke("legal:get")
  },
  shell: {
    openExternal: invoke("shell:openExternal")
  },
  events: {
    onLog: subscribe("log"),
    onEvent: subscribe("event")
  }
};

const legacyApi = {
  getPaths: groupedApi.paths.get,
  loadConfig: groupedApi.config.load,
  saveConfig: groupedApi.config.save,
  loadRules: groupedApi.rules.load,
  saveRules: groupedApi.rules.save,
  runScreener: groupedApi.engine.runScreener,
  runFinancialScreener: groupedApi.engine.runFinancialScreener,
  explainAiTarget: groupedApi.engine.explainAiTarget,
  explainFinancialRow: groupedApi.engine.explainFinancialRow,
  runOnce: groupedApi.engine.runOnce,
  start: groupedApi.engine.start,
  stop: groupedApi.engine.stop,
  resetTestData: groupedApi.dev.resetTestData,
  getLegalInfo: groupedApi.legal.getInfo,
  openExternal: groupedApi.shell.openExternal,
  onLog: groupedApi.events.onLog,
  onEvent: groupedApi.events.onEvent
};

contextBridge.exposeInMainWorld("api", {
  ...groupedApi,
  ...legacyApi
});
