import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getPaths: () => ipcRenderer.invoke("paths:get"),
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),
  loadRules: () => ipcRenderer.invoke("rules:load"),
  saveRules: (rules) => ipcRenderer.invoke("rules:save", rules),
  runScreener: (payload) => ipcRenderer.invoke("engine:screener", payload),
  runOnce: ({ dryRun }) => ipcRenderer.invoke("engine:runOnce", { dryRun }),
  start: () => ipcRenderer.invoke("engine:start"),
  stop: () => ipcRenderer.invoke("engine:stop"),
  onLog: (cb) => ipcRenderer.on("log", (_evt, payload) => cb(payload)),
  onEvent: (cb) => ipcRenderer.on("event", (_evt, payload) => cb(payload))
});
