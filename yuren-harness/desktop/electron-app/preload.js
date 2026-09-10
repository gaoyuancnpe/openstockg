'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yuren', {
  // 主进程 -> 加载页: {phase: 'loading'|'failed', text, log: string[]}
  onStatus: (cb) => ipcRenderer.on('status', (_e, msg) => cb(msg)),
  // 加载页 -> 主进程: 重试启动
  retry: () => ipcRenderer.invoke('retry'),
});
