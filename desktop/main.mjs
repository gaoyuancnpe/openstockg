import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createAlertsEngine } from "./engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_REPO_URL = "https://github.com/gaoyuancnpe/openstockg";
const UPSTREAM_REPO_URL = "https://github.com/Open-Dev-Society/OpenStock";
const LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

function safeParseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function readJSON(filePath, fallback) {
  try {
    const txt = await readFile(filePath, "utf-8");
    return safeParseJSON(txt, fallback);
  } catch {
    return fallback;
  }
}

async function writeJSON(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function getDataPaths() {
  const base = app.getPath("userData");
  return {
    base,
    config: path.join(base, "config.json"),
    rules: path.join(base, "rules.json"),
    state: path.join(base, "state.json"),
    events: path.join(base, "events.jsonl"),
    universeUS: path.join(base, "universe_us_symbols.json"),
    universeFmpDefault: path.join(base, "universe_fmp_default.json"),
    universeFmpFinancial: path.join(base, "universe_fmp_financial.json")
  };
}

async function resetTestDataFiles(paths) {
  const files = [
    paths.config,
    paths.rules,
    paths.state,
    paths.events,
    paths.universeUS,
    paths.universeFmpDefault,
    paths.universeFmpFinancial
  ];
  const removed = [];
  for (const filePath of files) {
    await rm(filePath, { force: true }).catch(() => {});
    removed.push(filePath);
  }
  return removed;
}

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

let engine = null;
let engineRunning = false;

async function main() {
  const forcedUserDataDir = process.env.OPENSTOCK_USER_DATA_DIR;
  if (forcedUserDataDir) {
    app.setPath("userData", forcedUserDataDir);
  }

  await app.whenReady();

  const win = createWindow();
  installAppMenu(win);
  const paths = getDataPaths();
  await ensureDir(paths.base);
  const usingCustomDataDir = Boolean(forcedUserDataDir);

  console.log(`[desktop] userData=${paths.base}`);
  console.log(`[desktop] customUserDataDir=${usingCustomDataDir ? "yes" : "no"}`);

  engine = createAlertsEngine({
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

  ipcMain.handle("paths:get", async () => ({
    ...paths,
    usingCustomDataDir,
    forcedUserDataDir: forcedUserDataDir || ""
  }));

  ipcMain.handle("config:load", async () => {
    const cfg = await readJSON(paths.config, {
      dataProvider: "fmp",
      finnhubBaseUrl: "https://finnhub.io/api/v1",
      finnhubApiKey: "",
      fmpBaseUrl: "https://financialmodelingprep.com",
      fmpApiKey: "",
      ai: {
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "",
        model: "deepseek-v4-flash",
        thinkingEnabled: false,
        reasoningEffort: "high"
      },
      pollIntervalSec: 60,
      scheduler: { mode: "interval", intervalSec: 60, dailyTime: "09:30", weekdaysOnly: true },
      defaultEmailTo: "",
      email: { provider: "gmail", user: "", pass: "" },
      defaultWebhookUrl: ""
    });
    return cfg;
  });

  ipcMain.handle("config:save", async (_evt, cfg) => {
    await writeJSON(paths.config, cfg);
    return { ok: true };
  });

  ipcMain.handle("rules:load", async () => {
    const rules = await readJSON(paths.rules, []);
    return Array.isArray(rules) ? rules : [];
  });

  ipcMain.handle("rules:save", async (_evt, rules) => {
    await writeJSON(paths.rules, rules);
    return { ok: true };
  });

  ipcMain.handle("engine:runOnce", async (_evt, { dryRun }) => {
    await engine.runOnce({ dryRun: Boolean(dryRun) });
    return { ok: true };
  });

  ipcMain.handle("engine:screener", async (_evt, payload) => {
    const res = await engine.runScreener(payload || {});
    return res;
  });

  ipcMain.handle("engine:financialScreener", async (_evt, payload) => {
    const res = await engine.runFinancialScreener(payload || {});
    return res;
  });

  ipcMain.handle("engine:financialExplain", async (_evt, payload) => {
    const res = await engine.explainFinancialRow(payload || {});
    return res;
  });

  ipcMain.handle("engine:start", async () => {
    if (engineRunning) return { ok: true };
    engine.start();
    engineRunning = true;
    return { ok: true };
  });

  ipcMain.handle("engine:stop", async () => {
    if (!engineRunning) return { ok: true };
    engine.stop();
    engineRunning = false;
    return { ok: true };
  });

  ipcMain.handle("dev:resetTestData", async () => {
    if (engineRunning) {
      engine.stop();
      engineRunning = false;
    }
    const removedFiles = await resetTestDataFiles(paths);
    console.log(`[desktop] reset test data in ${paths.base}`);
    return { ok: true, removedFiles, base: paths.base };
  });

  ipcMain.handle("legal:get", async () => {
    const legalNoticePath = path.join(__dirname, "LEGAL_NOTICE.md");
    const noticeText = await readFile(legalNoticePath, "utf-8").catch(() => "");
    return {
      sourceRepoUrl: SOURCE_REPO_URL,
      upstreamRepoUrl: UPSTREAM_REPO_URL,
      licenseUrl: LICENSE_URL,
      noticeText
    };
  });

  ipcMain.handle("shell:openExternal", async (_evt, url) => {
    if (!url || typeof url !== "string") return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
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
