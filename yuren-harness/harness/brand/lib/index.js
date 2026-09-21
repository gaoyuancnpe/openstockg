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
import { readFile, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createAlertsEngine } from "../../../../desktop/engine.mjs";
import {
  getDataPathsFromBase,
  initializeDesktopStorage,
  loadDesktopConfig,
  loadDesktopEvents,
  loadDesktopRules,
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
    groupOp: String(rule?.groupOp || "and"),
    conditions: Array.isArray(rule?.conditions) ? rule.conditions : [],
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
    const list = await loadDesktopRules(paths);
    replyJson(res, 200, {
      ok: true,
      total: list.length,
      enabledCount: list.filter((rule) => rule?.enabled).length,
      rules: list.map(describeRule)
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

async function serveScheduler(req, res) {
  try {
    const body = await readJsonBody(req);
    const engine = await getEngine();
    if (body.action === "start") {
      const status = await engine.start();
      return replyJson(res, 200, { ok: true, scheduler: status || engine.getSchedulerStatus() });
    }
    if (body.action === "stop") {
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
}

export { apply, inject };
