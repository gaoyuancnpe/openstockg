import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getPaths: () => ipcRenderer.invoke("paths:get"),
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),
  loadRules: () => ipcRenderer.invoke("rules:load"),
  saveRules: (rules) => ipcRenderer.invoke("rules:save", rules),
  runScreener: (payload) => ipcRenderer.invoke("engine:screener", payload),
  runFinancialScreener: (payload) => ipcRenderer.invoke("engine:financialScreener", payload),
  explainFinancialRow: (payload) => ipcRenderer.invoke("engine:financialExplain", payload),
  runOnce: ({ dryRun }) => ipcRenderer.invoke("engine:runOnce", { dryRun }),
  start: () => ipcRenderer.invoke("engine:start"),
  stop: () => ipcRenderer.invoke("engine:stop"),
  resetTestData: () => ipcRenderer.invoke("dev:resetTestData"),
  getLegalInfo: () => ipcRenderer.invoke("legal:get"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  onLog: (cb) => ipcRenderer.on("log", (_evt, payload) => cb(payload)),
  onEvent: (cb) => ipcRenderer.on("event", (_evt, payload) => cb(payload))
});
