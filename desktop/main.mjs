import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAlertsEngine } from "./engine.mjs";
import { ensureDir, getDataPaths, initializeDesktopStorage } from "./main/data-store.mjs";
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
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.mjs")
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

  console.log(`[desktop] userData=${paths.base}`);
  console.log(`[desktop] customUserDataDir=${forcedUserDataDir ? "yes" : "no"}`);
  for (const report of storageInit.reports) {
    if (!Array.isArray(report.actions) || report.actions.length === 0) continue;
    console.log(`[desktop] storage ${report.key}: ${report.actions.join("，")}`);
  }

  const engine = createAlertsEngine({
    dataPaths: paths,
    onLog: (line) => {
      console.log(`[engine] ${line}`);
      win.webContents.send("log", { line });
    },
    onEvent: (event) => {
      console.log(`[event] ${event?.symbol || "-"} ${event?.conditionText || ""}`.trim());
      win.webContents.send("event", event);
    }
  });

  registerDesktopIpc({
    desktopDir: __dirname,
    engine,
    forcedUserDataDir,
    paths,
    sourceRepoUrl: SOURCE_REPO_URL,
    upstreamRepoUrl: UPSTREAM_REPO_URL,
    licenseUrl: LICENSE_URL
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
