/* Yuren Harness - 品牌插件(host 半)
 * 通过补丁覆盖默认装配的 ui-brand-official 行接入。
 * 职责:
 *   1. tapIndex 改写所有 index.html 响应: 浏览器标签标题 + 把本插件的浏览器半
 *      (yuren-brand)追加进 __DSH_BOOT__ 启动图(它由 /branding/client.js 路由提供)
 *   2. 注册精确路由,用本项目自己的 favicon.svg / manifest.webmanifest 覆盖默认静态文件
 * 注: 浏览器半不走 dsh.client 自动发现 —— 加载器要求 name 为 file:// URL(ESM 导入),
 *     而 client-modules 扫描器用 require.resolve(仅接受 Windows 路径),二者互斥,
 *     所以浏览器半通过 tapIndex 注入 boot 图 + 自定义路由提供。
 */
import { readFile, appendFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createAlertsEngine } from "../../../../desktop/engine.mjs";
import { buildTransport, sendEmail, sendNotificationWebhook } from "../../../../desktop/engine/notification-domain.mjs";
import { normalizeDesktopConfig } from "../../../../desktop/shared-config.mjs";
import {
  getDataPathsFromBase,
  initializeDesktopStorage,
  loadDesktopConfig,
  loadDesktopEvents,
  loadDesktopMarketAmvHistory,
  loadDesktopRules,
  readJSON,
  saveDesktopConfig,
  saveDesktopRules
} from "../../../../desktop/main/data-store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = dirname(HERE);
const APP_TITLE = "Yuren Harness";

const inject = ["webServer"];

/* OpenStock 共享数据目录(与 desktop/mcp/mcp-server.mjs 同一约定) */
function openstockDataDir() {
  return process.env.OPENSTOCK_USER_DATA_DIR
    ? process.env.OPENSTOCK_USER_DATA_DIR
    : join(homedir(), ".config", "openstock-alerts-desktop");
}

function maskEmail(email) {
  const text = String(email || "");
  const at = text.indexOf("@");
  if (at <= 0) return text ? `${text.slice(0, 2)}***` : "";
  return `${text.slice(0, 2)}***${text.slice(at)}`;
}

function maskUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return `${parsed.protocol}//${parsed.host}/***`;
  } catch {
    return String(url || "") ? "***" : "";
  }
}

function describeRule(rule) {
  const isUsAll = rule?.universe?.type === "us_all";
  const universe = isUsAll
    ? {
      type: "us_all",
      maxScan: rule.universe.maxScan ?? null,
      // FMP 规则包的门槛条件放在 universe 层,面板需要一并透出
      minPrice: rule.universe.minPrice ?? null,
      minMarketCap: rule.universe.minMarketCap ?? null,
      minTurnoverM: rule.universe.minTurnoverM ?? null,
      minVolumeRatio: rule.universe.minVolumeRatio ?? null,
      requireRecent5dCloseAth: rule.universe.requireRecent5dCloseAth === undefined
        ? null
        : Boolean(rule.universe.requireRecent5dCloseAth)
    }
    : { type: "manual", symbols: Array.isArray(rule?.symbols) ? rule.symbols : [] };
  return {
    name: String(rule?.name || "未命名规则"),
    enabled: Boolean(rule?.enabled),
    universe,
    groupOp: String(rule?.groupOp || rule?.ui?.groupOp || "and"),
    // 兼容两种落盘形状:UI 形状顶层 conditions;引擎形状收在 ui.items
    conditions: Array.isArray(rule?.conditions) ? rule.conditions
      : Array.isArray(rule?.ui?.items) ? rule.ui.items : [],
    cooldownSec: rule?.cooldownSec ?? null,
    notify: rule?.notify
      ? {
        email: rule.notify.email ? maskEmail(rule.notify.email) : null,
        webhookUrl: rule.notify.webhookUrl ? maskUrl(rule.notify.webhookUrl) : null,
        webhookType: rule.notify.webhookType || null
      }
      : null
  };
}

/* 资产区数据接口: 只读,密钥/地址脱敏,与静态路由同一注册通道 */
async function serveRules(_req, res) {
  const file = join(openstockDataDir(), "rules.json");
  try {
    const raw = await readFile(file, "utf-8");
    const rules = JSON.parse(raw);
    const list = Array.isArray(rules) ? rules : [];
    const body = JSON.stringify({
      total: list.length,
      enabledCount: list.filter((rule) => rule?.enabled).length,
      rules: list.map(describeRule)
    });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  } catch (error) {
    const missing = error?.code === "ENOENT";
    res.writeHead(missing ? 404 : 500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      error: missing ? "未找到规则文件(OpenStock 数据目录里还没有 rules.json)" : "规则文件读取失败"
    }));
  }
}

/* ───────── 引擎接入(筛选/调度/运行,与 MCP 子进程共用同一数据目录) ───────── */

let openstockPaths = null;
let enginePromise = null;

function getOpenstockPaths() {
  if (!openstockPaths) {
    openstockPaths = getDataPathsFromBase(openstockDataDir());
  }
  return openstockPaths;
}

async function persistEngineEvent(event) {
  const paths = getOpenstockPaths();
  await appendFile(paths.events, `${JSON.stringify(event)}\n`, "utf-8").catch(() => {});
  // 诊断落盘(镜像桌面端 main.mjs):Web/MCP 部署没有 Electron,MCP 的 get_status
  // 与面板状态全靠 diagnostics.json,不写就永远是 null。
  // 注意:调度启停/运行会连发事件,读-合-写必须串行化 + 原子换名,否则并发写会写花文件
  if (event?.type === "run_status" || event?.type === "scheduler_status") {
    enqueueDiagnosticsWrite(paths, event);
  }
}

let diagnosticsWriteQueue = Promise.resolve();
function enqueueDiagnosticsWrite(paths, event) {
  const task = async () => {
    try {
      const current = await readJSON(paths.diagnostics, {});
      const base = current && typeof current === "object" ? current : {};
      const next = event.type === "run_status"
        ? {
          ...base,
          lastRun: event,
          scheduler: {
            ...(base.scheduler && typeof base.scheduler === "object" ? base.scheduler : {}),
            lastRunAt: event.phase === "finished"
              ? String(event.finishedAt || new Date().toISOString())
              : String(base.scheduler?.lastRunAt || "")
          },
          updatedAt: new Date().toISOString()
        }
        : { ...base, scheduler: event, updatedAt: new Date().toISOString() };
      const tmp = `${paths.diagnostics}.brand.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2), "utf-8");
      await rename(tmp, paths.diagnostics);
    } catch { /* 诊断失败不阻塞事件流 */ }
  };
  diagnosticsWriteQueue = diagnosticsWriteQueue.then(task, task);
}

async function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const paths = getOpenstockPaths();
      await initializeDesktopStorage(paths);
      return createAlertsEngine({
        dataPaths: paths,
        onLog: () => {},
        onEvent: persistEngineEvent
      });
    })();
  }
  return enginePromise;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function replyJson(res, code, payload) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

function toNumOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/* 统一筛选入口: 手动列表或全量美股(与规则共用同一套 criteria 形状) */
async function serveScreen(req, res) {
  try {
    const paths = getOpenstockPaths();
    const cfg = await loadDesktopConfig(paths);
    const provider = String(cfg.dataProvider || "finnhub").toLowerCase();
    const providerKey = provider === "fmp" ? cfg.fmpApiKey : cfg.finnhubApiKey;
    if (!String(providerKey || "").trim()) {
      return replyJson(res, 400, {
        error: `数据源 ${provider} 的 API Key 未配置——先让智能体执行 update_config 填入 fmpApiKey,再回来筛选`
      });
    }
    const body = await readJsonBody(req);
    const engine = await getEngine();
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)
      : [];
    const c = body.criteria && typeof body.criteria === "object" ? body.criteria : {};
    const criteria = {
      universe: symbols.length > 0 ? "manual" : String(c.universe || "us_all"),
      symbols,
      maxScan: toNumOrNull(c.maxScan) ?? 300,
      minPrice: toNumOrNull(c.minPrice),
      maxPrice: toNumOrNull(c.maxPrice),
      minMarketCap: toNumOrNull(c.minMarketCap),
      maxMarketCap: toNumOrNull(c.maxMarketCap),
      minTurnoverM: toNumOrNull(c.minTurnoverM),
      minVolumeRatio: toNumOrNull(c.minVolumeRatio),
      requireRecent5dCloseAth: Boolean(c.requireRecent5dCloseAth)
    };
    const rows = await engine.runScreener({ symbols, criteria });
    const list = Array.isArray(rows) ? rows : [];
    replyJson(res, 200, {
      total: list.length,
      truncated: list.length > 100,
      rows: list.slice(0, 100)
    });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "筛选失败" });
  }
}

/* 规则写操作: toggle / delete / add(与桌面端同源,经 data-store 归一化落盘) */
async function serveRulesUpdate(req, res) {
  try {
    const body = await readJsonBody(req);
    const action = String(body.action || "");
    const paths = getOpenstockPaths();
    const rules = await loadDesktopRules(paths);

    if (action === "toggle" || action === "delete") {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
        return replyJson(res, 400, { error: "规则下标非法" });
      }
      if (action === "toggle") {
        rules[index] = { ...rules[index], enabled: !rules[index]?.enabled };
      } else {
        rules.splice(index, 1);
      }
    } else if (action === "add") {
      const rule = body.rule;
      if (!rule || typeof rule !== "object" || !String(rule.name || "").trim()) {
        return replyJson(res, 400, { error: "规则缺少名称" });
      }
      rules.push(rule);
    } else {
      return replyJson(res, 400, { error: "未知操作" });
    }

    await saveDesktopRules(paths, rules);
    // 创建期冲突提醒(只提醒不阻断):门槛低于实际扫描边界 / 数据源不支持的变量
    let conflictWarnings = [];
    if (action === "add") {
      try {
        const cfg = await loadDesktopConfig(paths);
        const { detectRuleSetupConflicts } = await import("../../../../desktop/engine/fmp-domain.mjs");
        conflictWarnings = await detectRuleSetupConflicts({ dataPaths: paths, rule: body.rule, dataProvider: cfg.dataProvider });
      } catch { /* 冲突检测失败不阻塞保存 */ }
    }
    const list = await loadDesktopRules(paths);
    replyJson(res, 200, {
      ok: true,
      total: list.length,
      enabledCount: list.filter((rule) => rule?.enabled).length,
      rules: list.map(describeRule),
      conflictWarnings
    });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "规则更新失败" });
  }
}

async function serveStatus(_req, res) {
  try {
    const engine = await getEngine();
    const scheduler = typeof engine.getSchedulerStatus === "function" ? engine.getSchedulerStatus() : null;
    replyJson(res, 200, { scheduler });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "状态读取失败" });
  }
}

/** 调度意图落盘:CI 每次部署都会重启服务,autoStart 让"已启动"状态跨重启存活 */
async function setSchedulerAutoStart(enabled) {
  const paths = getOpenstockPaths();
  const current = await loadDesktopConfig(paths);
  const next = normalizeDesktopConfig({
    ...current,
    scheduler: { ...(current?.scheduler || {}), autoStart: Boolean(enabled) }
  });
  await saveDesktopConfig(paths, next);
}

async function serveScheduler(req, res) {
  try {
    const body = await readJsonBody(req);
    const engine = await getEngine();
    if (body.action === "start") {
      await setSchedulerAutoStart(true);
      const status = await engine.start();
      return replyJson(res, 200, { ok: true, scheduler: status || engine.getSchedulerStatus() });
    }
    if (body.action === "stop") {
      await setSchedulerAutoStart(false);
      const status = engine.stop();
      return replyJson(res, 200, { ok: true, scheduler: status || engine.getSchedulerStatus() });
    }
    replyJson(res, 400, { error: "action 仅支持 start/stop" });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "调度操作失败" });
  }
}

/* 模拟跑一轮: 异步执行,前端轮询事件流看结果;真实通知仍只走 MCP 对话确认 */
async function serveRunOnce(req, res) {
  try {
    const body = await readJsonBody(req);
    if (body.dryRun === false) {
      return replyJson(res, 403, { error: "面板只允许模拟运行;真实发送通知请走智能体对话确认" });
    }
    const engine = await getEngine();
    replyJson(res, 202, { started: true, dryRun: true });
    engine.runOnce({ dryRun: true, ignoreCooldown: Boolean(body.ignoreCooldown) }).catch(() => {});
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "启动运行失败" });
  }
}

async function serveEvents(_req, res) {
  try {
    const events = await loadDesktopEvents(getOpenstockPaths(), { limit: 30 });
    replyJson(res, 200, { count: events.length, events });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "事件读取失败" });
  }
}

/* ───────── 设置与 0AMV ───────── */

function describeConfigMasked(cfg) {
  return {
    dataProvider: cfg.dataProvider,
    fmpApiKeySet: Boolean(String(cfg.fmpApiKey || "").trim()),
    finnhubApiKeySet: Boolean(String(cfg.finnhubApiKey || "").trim()),
    defaultEmailTo: cfg.defaultEmailTo || "",
    emailUserSet: Boolean(String(cfg.email?.user || "").trim()),
    defaultWebhookType: cfg.defaultWebhookType || "generic",
    defaultWebhookUrlSet: Boolean(String(cfg.defaultWebhookUrl || "").trim()),
    scheduler: {
      mode: cfg.scheduler?.mode || "interval",
      intervalSec: cfg.scheduler?.intervalSec ?? null,
      dailyTime: cfg.scheduler?.dailyTime || "09:30",
      weekdaysOnly: cfg.scheduler?.weekdaysOnly !== false,
      usMarketHoursOnly: cfg.scheduler?.usMarketHoursOnly === true
    },
    ai: {
      orchestration: {
        mode: cfg.ai?.orchestration?.mode || "agent_pipeline",
        planner: cfg.ai?.orchestration?.planner || "role_pipeline",
        validatorEnabled: cfg.ai?.orchestration?.validatorEnabled !== false,
        maxSteps: cfg.ai?.orchestration?.maxSteps ?? 4
      }
    }
  };
}

async function serveConfig(_req, res) {
  try {
    const cfg = await loadDesktopConfig(getOpenstockPaths());
    replyJson(res, 200, describeConfigMasked(cfg));
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "配置读取失败" });
  }
}

function deepMergePatch(target, patch) {
  const next = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)
      && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
      next[key] = deepMergePatch(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

const CONFIG_PATCHABLE_KEYS = new Set([
  "fmpApiKey", "finnhubApiKey", "defaultEmailTo", "defaultWebhookType", "defaultWebhookUrl",
  "email", "scheduler", "pollIntervalSec", "ai"
]);

async function serveConfigUpdate(req, res) {
  try {
    const body = await readJsonBody(req);
    const patch = body.patch && typeof body.patch === "object" ? body.patch : {};
    const illegal = Object.keys(patch).filter((key) => !CONFIG_PATCHABLE_KEYS.has(key));
    if (illegal.length > 0) {
      return replyJson(res, 400, { error: `面板仅允许改这些字段:${[...CONFIG_PATCHABLE_KEYS].join("/")};${illegal.join(",")} 不在其中` });
    }
    const paths = getOpenstockPaths();
    const current = await loadDesktopConfig(paths);
    const next = normalizeDesktopConfig(deepMergePatch(current, patch));
    await saveDesktopConfig(paths, next);
    replyJson(res, 200, { ok: true, config: describeConfigMasked(next) });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "配置更新失败" });
  }
}

async function serveTestEmail(_req, res) {
  try {
    const paths = getOpenstockPaths();
    const cfg = await loadDesktopConfig(paths);
    const to = String(cfg.defaultEmailTo || "");
    if (!to) return replyJson(res, 400, { error: "默认收件人未配置" });
    if (!String(cfg.email?.user || "")) return replyJson(res, 400, { error: "发件邮箱(Gmail 账号)未配置" });
    const transport = buildTransport(cfg.email);
    await sendEmail(transport, {
      fromUser: String(cfg.email.user || ""),
      to,
      subject: "OpenStock 面板测试邮件",
      text: `这是来自资产区「设置」页签的测试邮件。\n时间: ${new Date().toISOString()}`
    });
    replyJson(res, 200, { ok: true, to: maskEmail(to) });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "测试邮件发送失败" });
  }
}

async function serveTestWebhook(_req, res) {
  try {
    const paths = getOpenstockPaths();
    const cfg = await loadDesktopConfig(paths);
    const url = String(cfg.defaultWebhookUrl || "");
    if (!url) return replyJson(res, 400, { error: "默认回调地址未配置" });
    const result = await sendNotificationWebhook({
      target: { type: String(cfg.defaultWebhookType || "generic"), url },
      payload: { type: "panel_webhook_test", sentAt: new Date().toISOString() },
      title: "OpenStock 面板测试回调",
      lines: [`时间: ${new Date().toISOString()}`]
    });
    replyJson(res, 200, { ok: true, partsSent: result?.partsSent || 1 });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "测试回调发送失败" });
  }
}

/* ── 智能体产出文件:云端工作区列表与下载 ──────────────────────────────
 *  智能体跑在云端,产出落服务器磁盘;下载走本域名,天然继承 market 的账户门禁。
 *  目录与 AGENTS.md 交付规范一致(/srv/yuren/workspace),可用 YUREN_WORKSPACE_DIR 覆盖。 */
function workspaceOutputDir() {
  if (process.env.YUREN_WORKSPACE_DIR) return process.env.YUREN_WORKSPACE_DIR;
  return "/srv/yuren/workspace";
}

const WORKSPACE_MIME = {
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

async function collectWorkspaceFiles(dir, prefix = "", depth = 0, out = []) {
  if (depth > 2 || out.length >= 200) return out;
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectWorkspaceFiles(join(dir, entry.name), rel, depth + 1, out);
    } else {
      try {
        const info = await stat(join(dir, entry.name));
        out.push({ name: rel, size: info.size, mtime: info.mtime.toISOString() });
      } catch { /* 文件消失则跳过 */ }
    }
  }
  return out;
}

/* 交付物判定:outputs/ 约定目录(任意扩展名)或文档类扩展名,且不在噪声目录里。
 *  噪声目录=原始拉取数据(raw)、字节码/依赖缓存;脚本与 .patch 等构建产物
 *  靠扩展名天然落选——它们单独下载没有意义,只会在列表里淹没真正的交付物。 */
const WORKSPACE_NOISE_SEGMENTS = new Set(["__pycache__", "node_modules", "site-packages", "raw", ".pylibs", ".venv"]);
const WORKSPACE_DELIVERABLE_EXTS = new Set([".md", ".csv", ".xlsx", ".pdf", ".html", ".png", ".jpg", ".jpeg"]);
/* .txt 不在白名单:控制台转储(step*_out.txt)常以 .txt 落盘,真要交付就放 outputs/ */

function isWorkspaceDeliverable(name) {
  const segments = String(name).split("/");
  if (segments.some((s) => WORKSPACE_NOISE_SEGMENTS.has(s))) return false;
  if (segments[0] === "outputs") return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && WORKSPACE_DELIVERABLE_EXTS.has(name.slice(dot).toLowerCase());
}

async function serveWorkspaceFiles(req, res) {
  try {
    const url = new URL(req.url, "http://local");
    const scope = url.searchParams.get("scope") === "all" ? "all" : "deliverables";
    const rows = await collectWorkspaceFiles(workspaceOutputDir());
    rows.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
    const deliverables = rows.filter((r) => isWorkspaceDeliverable(r.name));
    const list = scope === "all" ? rows : deliverables;
    replyJson(res, 200, {
      scope,
      total: rows.length,
      deliverableTotal: deliverables.length,
      files: list.slice(0, 100)
    });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "产出文件读取失败" });
  }
}

async function serveWorkspaceDownload(req, res) {
  try {
    const url = new URL(req.url, "http://local");
    const name = String(url.searchParams.get("name") || "").trim();
    const root = resolve(workspaceOutputDir());
    // 防目录穿越:解析后的绝对路径必须仍在工作区内
    const target = resolve(root, name);
    if (!name || !target.startsWith(root + sep)) {
      return replyJson(res, 400, { error: "非法的文件名" });
    }
    const body = await readFile(target);
    const ext = String(target.slice(target.lastIndexOf("."))).toLowerCase();
    const fileName = target.slice(target.lastIndexOf(sep) + 1);
    res.writeHead(200, {
      "content-type": WORKSPACE_MIME[ext] || "application/octet-stream",
      "content-disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "cache-control": "no-store"
    });
    res.end(body);
  } catch (error) {
    replyJson(res, 404, { error: error?.message || "文件不存在" });
  }
}

async function serveAmvHistory(_req, res) {
  try {
    const url = new URL(_req.url, "http://local");
    const index = url.searchParams.get("index") || undefined;
    const history = await loadDesktopMarketAmvHistory(getOpenstockPaths(), { index });
    replyJson(res, 200, { count: history.length, history: history.slice(-60) });
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "0AMV 历史读取失败" });
  }
}

/* 0AMV 计算: 异步执行(全成分股扫描较慢),前端轮询 history 看结果 */
async function serveAmvCompute(req, res) {
  try {
    const body = await readJsonBody(req);
    const engine = await getEngine();
    const cfg = await loadDesktopConfig(getOpenstockPaths());
    if (!String(cfg.fmpApiKey || "").trim()) {
      return replyJson(res, 400, { error: "FMP API Key 未配置,无法计算 0AMV" });
    }
    const index = ["sp500", "nasdaq", "all"].includes(body.index) ? body.index : "sp500";
    replyJson(res, 202, { started: true, index });
    engine.runMarketAmv({ index, limit: body.limit == null ? undefined : Number(body.limit), useFmp: true }).catch(() => {});
  } catch (error) {
    replyJson(res, 500, { error: error?.message || "0AMV 计算启动失败" });
  }
}

/* 静态资源路由: 精确路由优先于前端 dist 的 fallback 静态服务 */
const STATIC_ROUTES = [
  ["/favicon.svg", join(PKG_ROOT, "favicon.svg"), "image/svg+xml"],
  ["/manifest.webmanifest", join(PKG_ROOT, "manifest.webmanifest"), "application/manifest+json"],
  ["/branding/client.js", join(HERE, "client.js"), "text/javascript; charset=utf-8"],
];

function revisionOf(buf) {
  return createHash("sha1").update(buf).digest("hex").slice(0, 12);
}

/* 把浏览器半追加进启动图;boot 图由 client-modules 以结构化注入行写进 HTML,
 * tapIndex 在其后运行,因此能拿到完整 JSON 后再改写。 */
function appendBootEntry(html, rev) {
  const marker = 'globalThis["__DSH_BOOT__"] = ';
  const at = html.indexOf(marker);
  if (at === -1) return html;
  const start = at + marker.length;
  const end = html.indexOf("</script>", start);
  if (end === -1) return html;
  let boot;
  try {
    boot = JSON.parse(html.slice(start, end));
  } catch {
    return html;
  }
  if (!Array.isArray(boot.entries) || boot.entries.some((e) => e && e.id === "yuren-brand")) {
    return html;
  }
  boot.entries.push({
    id: "yuren-brand",
    url: `/branding/client.js?rev=${rev}`,
    rev,
    inject: [
      "@deepseek-ai/dsh-client-runtime",
      "@deepseek-ai/dsh-client-ui-conversation",
      "@deepseek-ai/dsh-client-ui-sidebar",
      // 词条覆盖目标:必须等 settings-models 注册完词典后再改,否则会被整体替换
      "@deepseek-ai/dsh-client-ui-settings-models",
    ],
  });
  return html.slice(0, start) + JSON.stringify(boot) + html.slice(end);
}

async function apply(ctx) {
  const clientJs = await readFile(join(HERE, "client.js"));
  const rev = revisionOf(clientJs);

  ctx.webServer.tapIndex((html) => {
    let out = html.replaceAll("<title>DeepSeek Harness</title>", `<title>${APP_TITLE}</title>`);
    out = appendBootEntry(out, rev);
    return out;
  });

  const serve = (file, type) => async (_req, res) => {
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  };
  for (const [route, file, type] of STATIC_ROUTES) {
    ctx.webServer.register({ kind: "exact", path: route, handler: serve(file, type) });
  }
  ctx.webServer.register({ kind: "exact", path: "/branding/api/rules.json", handler: serveRules });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/screen", handler: serveScreen });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/rules/update", handler: serveRulesUpdate });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/status.json", handler: serveStatus });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/scheduler", handler: serveScheduler });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/run-once", handler: serveRunOnce });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/events.json", handler: serveEvents });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/config.json", handler: serveConfig });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/config/update", handler: serveConfigUpdate });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/test-email", handler: serveTestEmail });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/test-webhook", handler: serveTestWebhook });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/workspace/files", handler: serveWorkspaceFiles });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/workspace/download", handler: serveWorkspaceDownload });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/amv/history.json", handler: serveAmvHistory });
  ctx.webServer.register({ kind: "exact", path: "/branding/api/amv/compute", handler: serveAmvCompute });

  // 自启恢复:服务(CI 部署)重启后,若调度意图为开启则自动拉起,避免"静默停摆"
  getEngine().then(async (engine) => {
    try {
      const cfg = await loadDesktopConfig(getOpenstockPaths());
      if (cfg.scheduler?.autoStart) {
        await engine.start();
        console.log("[yuren-brand] 调度器已按 autoStart 自启恢复");
      }
    } catch (error) {
      console.error("[yuren-brand] 调度器自启失败:", error?.message || error);
    }
  }).catch(() => { /* 引擎惰性初始化,失败留给首次请求时重试 */ });
}

export { apply, inject };
