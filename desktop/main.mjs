import { app, BrowserWindow, Menu, shell } from "electron";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopAgentService } from "./agent/create-desktop-agent-service.mjs";
import { createAlertsEngine } from "./engine.mjs";
import { createFeishuBridgeService } from "./feishu/feishu-bridge-service.mjs";
import { ensureDir, getDataPaths, initializeDesktopStorage, loadDesktopConfig, readJSON, writeJSON } from "./main/data-store.mjs";
import { registerDesktopIpc } from "./main/ipc.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_REPO_URL = "https://github.com/gaoyuancnpe/openstockg";
const UPSTREAM_REPO_URL = "https://github.com/Open-Dev-Society/OpenStock";
const LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 820,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

function installAppMenu(win) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
        label: "应用",
        submenu: [
          { role: "about", label: "关于" },
          { type: "separator" },
          { role: "services", label: "服务" },
          { type: "separator" },
          { role: "hide", label: "隐藏" },
          { role: "hideOthers", label: "隐藏其他" },
          { role: "unhide", label: "显示全部" },
          { type: "separator" },
          { role: "quit", label: "退出" }
        ]
      }]
      : []),
    {
      label: "文件",
      submenu: isMac
        ? [
          { role: "close", label: "关闭窗口" }
        ]
        : [
          { role: "quit", label: "退出" }
        ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "forceReload", label: "强制重新加载" },
        { type: "separator" },
        { role: "toggleDevTools", label: "切换开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏" }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front", label: "置于最前" }
        ] : [
          { type: "separator" },
          { role: "close", label: "关闭窗口" }
        ])
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "打开当前源码仓库",
          click: () => shell.openExternal(SOURCE_REPO_URL)
        },
        {
          label: "打开上游仓库",
          click: () => shell.openExternal(UPSTREAM_REPO_URL)
        },
        {
          label: "查看 AGPL 许可证",
          click: () => shell.openExternal(LICENSE_URL)
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  if (win) win.setMenu(menu);
}

async function main() {
  const forcedUserDataDir = process.env.OPENSTOCK_USER_DATA_DIR;
  if (forcedUserDataDir) {
    app.setPath("userData", forcedUserDataDir);
  }

  await app.whenReady();

  const win = createWindow();
  installAppMenu(win);
  const paths = getDataPaths(app);
  await ensureDir(paths.base);
  const storageInit = await initializeDesktopStorage(paths);

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const source = sourceId ? String(sourceId) : "renderer";
    const levelText = level >= 3 ? "error" : "info";
    void appendFile(paths.runtimeLog, `[${new Date().toISOString()}] [${levelText}] [renderer-console] ${source}:${line} ${String(message || "")}\n`, "utf8")
      .catch(() => {});
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    void appendFile(paths.runtimeLog, `[${new Date().toISOString()}] [error] [renderer-load] did-fail-load code=${errorCode} url=${validatedURL || "-"} desc=${errorDescription || "-"}\n`, "utf8")
      .catch(() => {});
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    void appendFile(paths.runtimeLog, `[${new Date().toISOString()}] [error] [renderer-process] gone reason=${details?.reason || "-"} exitCode=${details?.exitCode ?? "-"}\n`, "utf8")
      .catch(() => {});
  });

  console.log(`[desktop] userData=${paths.base}`);
  console.log(`[desktop] customUserDataDir=${forcedUserDataDir ? "yes" : "no"}`);
  for (const report of storageInit.reports) {
    if (!Array.isArray(report.actions) || report.actions.length === 0) continue;
    console.log(`[desktop] storage ${report.key}: ${report.actions.join("，")}`);
  }

  const writeRuntimeLog = async (line, level = "info") => {
    const timestamp = new Date().toISOString();
    const text = `[${timestamp}] [${level}] ${String(line || "")}\n`;
    await appendFile(paths.runtimeLog, text, "utf-8").catch(() => {});
  };

  const publishLog = (line, level = "info") => {
    const text = String(line || "");
    writeRuntimeLog(text, level);
    win.webContents.send("log", { line: text, level });
  };

  const persistDiagnostics = async (patch) => {
    const current = await readJSON(paths.diagnostics, {});
    const next = {
      ...(current && typeof current === "object" ? current : {}),
      ...(patch && typeof patch === "object" ? patch : {}),
      updatedAt: new Date().toISOString()
    };
    await writeJSON(paths.diagnostics, next).catch(() => {});
    return next;
  };

  const engine = createAlertsEngine({
    dataPaths: paths,
    onLog: (line) => {
      publishLog(line);
    },
    onEvent: async (event) => {
      writeRuntimeLog(JSON.stringify(event), "event");
      if (event?.type === "run_status") {
        const currentScheduler = await readJSON(paths.diagnostics, {});
        const previousScheduler = currentScheduler?.scheduler && typeof currentScheduler.scheduler === "object"
          ? currentScheduler.scheduler
          : {};
        await persistDiagnostics({
          lastRun: event,
          scheduler: {
            ...previousScheduler,
            lastRunAt: event.phase === "finished"
              ? String(event.finishedAt || new Date().toISOString())
              : String(previousScheduler.lastRunAt || "")
          }
        });
      } else if (event?.type === "scheduler_status") {
        await persistDiagnostics({ scheduler: event });
      }
      win.webContents.send("event", event);
    }
  });

  const agentService = createDesktopAgentService({
    dataPaths: paths,
    log: publishLog,
    emitEvent: async (event) => {
      if (event?.type === "agent_proposal_status") {
        win.webContents.send("event", event);
      }
    }
  });

  const feishuBridge = createFeishuBridgeService({
    loadConfig: () => loadDesktopConfig(paths),
    agentService,
    log: publishLog,
    emitEvent: async (event) => {
      if (event?.type === "feishu_bridge_status") {
        await persistDiagnostics({ feishuBridge: event });
      }
      win.webContents.send("event", event);
    }
  });

  registerDesktopIpc({
    desktopDir: __dirname,
    engine,
    afterConfigSave: async () => {
      await feishuBridge.reconnect();
    },
    forcedUserDataDir,
    paths,
    log: publishLog,
    sourceRepoUrl: SOURCE_REPO_URL,
    upstreamRepoUrl: UPSTREAM_REPO_URL,
    licenseUrl: LICENSE_URL,
    agentService
  });

  const previousDiagnostics = await readJSON(paths.diagnostics, {});
  const previousScheduler = previousDiagnostics?.scheduler && typeof previousDiagnostics.scheduler === "object"
    ? previousDiagnostics.scheduler
    : null;
  const shouldAutoResume = Boolean(previousScheduler?.desiredRunning ?? previousScheduler?.isRunning);
  if (shouldAutoResume) {
    publishLog("检测到应用上次退出前处于常驻状态，正在自动恢复调度...");
    try {
      const resumedScheduler = await engine.start({
        autoResume: true,
        resumeState: previousScheduler
      });
      await persistDiagnostics({
        scheduler: resumedScheduler
      });
      publishLog("常驻调度已自动恢复。");
    } catch (error) {
      publishLog(`自动恢复常驻失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  await feishuBridge.reconnect();

  process.on("uncaughtException", (error) => {
    const message = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error);
    publishLog(`Main uncaughtException ${message}`, "error");
  });
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? `${reason.message}\n${reason.stack || ""}` : String(reason);
    publishLog(`Main unhandledRejection ${message}`, "error");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", () => {
    feishuBridge.stop();
    if (process.platform !== "darwin") app.quit();
  });
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
