#!/usr/bin/env node
/* dsh 反代信任补丁——可独立运行,也可被 serve.js 复用。
 *
 * dsh 对"经反代访问"的场景有双保险,都会让远程浏览器打不开 设置→模型:
 *  1. 服务端(dsh-client-connection/lib/index.js):PRIVILEGED_METHODS(agentPreset/
 *     settings/credentials 等)与 Origin 比对只认 loopback → 整页 403。
 *  2. 前端(dsh-client-connection/lib/client.js):ctx.connection.isLoopback 按
 *     页面 hostname 判定,非回环时设置镜像直接置 unavailable →
 *     "settings are unavailable in this browser"。
 * 本补丁把两处的信任集都扩展到显式配置的受信主机(YUREN_TRUSTED_HOSTS 派生):
 * loopback 直连行为不变;公网入口仍有 nginx token cookie 网关挡着,不新增暴露面。
 *
 * 为什么是独立脚本:服务器上 systemd 服务以 yuren 用户运行,而仓库(含 node_modules)
 * 属于 deploy——serve.js 运行时无权改写,必须在 CI 的 SSH 会话(deploy 身份)里执行:
 *   YUREN_TRUSTED_HOSTS=<host:port>[,...] node patch-dsh-trust.cjs
 *
 * dsh 升级导致锚点失配时该目标跳过并告警,退回原生行为(远程设置页 403/unavailable)。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MARKER = 'yuren-trusted-proxy';

function syntaxOk(file, code) {
  const check = path.join(path.dirname(file), '.yuren-patch-check.mjs');
  try {
    fs.writeFileSync(check, code, 'utf8');
    const r = spawnSync(process.execPath, ['--check', check], { encoding: 'utf8' });
    return r.status === 0 ? '' : (r.stderr || '').split('\n').slice(0, 3).join(' ');
  } catch (e) {
    // 无写权限(如服务器上服务用户 yuren × 目录属主 deploy):返回错误而不是抛出,
    // 运行时兜底路径必须永不致命——CI 期才是权威打补丁时机
    return `无法写入校验文件(${e.code || e.message});若在服务器上属预期,补丁由 CI 期完成`;
  } finally {
    try { fs.unlinkSync(check); } catch { /* 临时文件不存在 */ }
  }
}

function rewrite(file, next, log) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, next, 'utf8');
  fs.renameSync(tmp, file);
  log(`已应用反代信任补丁: ${path.basename(path.dirname(path.dirname(path.dirname(file))))}`);
}

/** 服务端 /api 闸门 */
function patchServerIndex(file, trustedHosts, log) {
  if (srcHas(file, MARKER)) return 'already';
  const aFn = 'function isTrustedApiRequest(request, trustedHosts) {';
  const aPriv = 'PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, [])';
  const aOrigin = 'return new URL(origin).host === hostUrl.host;';
  const src = read(file);
  if (!src || !src.includes(aFn) || !src.includes(aPriv) || !src.includes(aOrigin)) {
    log('告警: dsh-client-connection/lib/index.js 结构与预期不符,跳过(远程设置页可能 403)');
    return 'anchor-mismatch';
  }
  const next = src
    .replace(aFn, `/* ${MARKER} */const YUREN_API_TRUST=(process.env.YUREN_TRUSTED_API_HOSTS||"").split(",").map((s)=>s.trim()).filter(Boolean);\n` + aFn)
    .replace(aPriv, 'PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, YUREN_API_TRUST)')
    .replace(aOrigin, 'const yurenOrigin=new URL(origin);return yurenOrigin.host===hostUrl.host||isTrustedAuthority(yurenOrigin,YUREN_API_TRUST);');
  const err = syntaxOk(file, next);
  if (err) { log(`告警: 服务端补丁语法校验失败,保持原样 | ${err}`); return 'error'; }
  rewrite(file, next, log);
  return 'patched';
}

/** 前端 isLoopback 判定(设置镜像 writable 的开关) */
function patchClientIndex(file, trustedHosts, log) {
  const aDef = 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),';
  const aApply = 'function apply(ctx) {';
  const src = read(file);
  if (!src) {
    log('告警: dsh-client-connection/lib/client.js 不可读,跳过(设置页可能显示 unavailable)');
    return 'error';
  }
  const list = trustedHosts.map((h) => JSON.stringify(h)).join(',');
  const setLine = `/* ${MARKER} */const YUREN_PAGE_TRUST=new Set([${list}]);`;
  if (src.includes(MARKER)) {
    // 已打过:受信清单变化时刷新(域名接入/更换入口都靠这里,否则设置页再次 unavailable)
    const refreshed = src.replace(
      new RegExp(`${MARKER} \\*/const YUREN_PAGE_TRUST=new Set\\(\\[[^\\]]*\\]\\);`),
      setLine
    );
    if (refreshed !== src) {
      const err = syntaxOk(file, refreshed);
      if (err) { log(`告警: 前端信任清单刷新校验失败,保持原样 | ${err}`); return 'error'; }
      rewrite(file, refreshed, log);
      return 'refreshed';
    }
    return 'already';
  }
  if (!src.includes(aDef) || !src.includes(aApply)) {
    log('告警: dsh-client-connection/lib/client.js 结构与预期不符,跳过(设置页可能显示 unavailable)');
    return 'anchor-mismatch';
  }
  const next = src
    .replace(aApply, setLine + '\n' + aApply)
    .replace(aDef, 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname) || (pageLocation !== void 0 && (YUREN_PAGE_TRUST.has(pageLocation.host) || YUREN_PAGE_TRUST.has(pageLocation.hostname))),');
  const err = syntaxOk(file, next);
  if (err) { log(`告警: 前端补丁语法校验失败,保持原样 | ${err}`); return 'error'; }
  rewrite(file, next, log);
  return 'patched';
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
function srcHas(file, needle) {
  const src = read(file);
  return src !== null && src.includes(needle);
}

function applyDshTrustPatch({ dshRoot, trustedHosts, log = (m) => console.log(m) } = {}) {
  if (!trustedHosts || !trustedHosts.length) return { server: 'no-hosts', client: 'no-hosts' };
  const root = dshRoot || path.join(__dirname, 'node_modules');
  const base = path.join(root, '@deepseek-ai', 'dsh-client-connection', 'lib');
  const server = patchServerIndex(path.join(base, 'index.js'), trustedHosts, log);
  const client = patchClientIndex(path.join(base, 'client.js'), trustedHosts, log);
  return { server, client };
}

/** 展开成带端口/不带端口两种形态(dsh 逐字匹配;nginx $host 会剥端口) */
function expandTrustedHosts(raw) {
  const out = new Set();
  for (const h of String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    out.add(h);
    out.add(h.replace(/:\d+$/, ''));
  }
  return [...out];
}

module.exports = { applyDshTrustPatch, expandTrustedHosts };

if (require.main === module) {
  const hosts = expandTrustedHosts(process.env.YUREN_TRUSTED_HOSTS);
  if (!hosts.length) {
    console.error('用法: YUREN_TRUSTED_HOSTS=<host[:port][,...]> node patch-dsh-trust.cjs');
    process.exit(1);
  }
  const result = applyDshTrustPatch({ trustedHosts: hosts });
  const ok = (v) => v === 'patched' || v === 'already' || v === 'refreshed';
  if (!ok(result.server) || !ok(result.client)) process.exit(2);
}
