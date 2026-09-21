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
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

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
}

export { apply, inject };
