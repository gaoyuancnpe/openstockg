import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createAlertsEngine } from "./engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    universeUS: path.join(base, "universe_us_symbols.json")
  };
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

let engine = null;
let engineRunning = false;

async function main() {
  const forcedUserDataDir = process.env.OPENSTOCK_USER_DATA_DIR;
  if (forcedUserDataDir) {
    app.setPath("userData", forcedUserDataDir);
  }

  await app.whenReady();

  const win = createWindow();
  const paths = getDataPaths();
  await ensureDir(paths.base);

  engine = createAlertsEngine({
    dataPaths: paths,
    onLog: (line) => {
      win.webContents.send("log", { line });
    },
    onEvent: (event) => {
      win.webContents.send("event", event);
    }
  });

  ipcMain.handle("paths:get", async () => paths);

  ipcMain.handle("config:load", async () => {
    const cfg = await readJSON(paths.config, {
      dataProvider: "fmp",
      finnhubBaseUrl: "https://finnhub.io/api/v1",
      finnhubApiKey: "",
      fmpBaseUrl: "https://financialmodelingprep.com",
      fmpApiKey: "",
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
