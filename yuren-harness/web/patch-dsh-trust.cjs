#!/usr/bin/env node
/* dsh 反代信任补丁——可独立运行,也可被 serve.js 复用。
 *
 * dsh-client-connection 对 PRIVILEGED_METHODS(agentPreset/settings/credentials 等)
 * 与 Origin 比对只认 loopback:经反代访问(Host 为公网 IP)时,设置页/Agent 预设会整页 403。
 * 本补丁把判定信任集扩展到显式配置的受信主机(YUREN_TRUSTED_API_HOSTS 环境变量,
 * 由 YUREN_TRUSTED_HOSTS 派生):loopback 直连行为不变;公网入口仍有 nginx token cookie
 * 网关挡着,不新增暴露面。
 *
 * 为什么是独立脚本:服务器上 systemd 服务以 yuren 用户运行,而仓库(含 node_modules)
 * 属于 deploy——serve.js 运行时无权改写,必须在 CI 的 SSH 会话(deploy 身份)里执行:
 *   YUREN_TRUSTED_HOSTS=<host:port>[,...] node patch-dsh-trust.cjs
 *
 * dsh 升级导致锚点失配时退出码 2 并告警,退回原生行为(仅表现为远程设置页 403,无安全风险)。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MARKER = 'yuren-trusted-proxy';

function applyDshTrustPatch({ dshRoot, trustedHosts, log = (m) => console.log(m) } = {}) {
  if (!trustedHosts || !trustedHosts.length) return { applied: false, reason: 'no-hosts' };
  const root = dshRoot || path.join(__dirname, 'node_modules');
  const file = path.join(root, '@deepseek-ai', 'dsh-client-connection', 'lib', 'index.js');
  if (!fs.existsSync(file)) {
    log('告警: 未找到 dsh-client-connection,跳过反代信任补丁');
    return { applied: false, reason: 'missing-file' };
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) return { applied: true, reason: 'already' }; // 已打过
  const aFn = 'function isTrustedApiRequest(request, trustedHosts) {';
  const aPriv = 'PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, [])';
  const aOrigin = 'return new URL(origin).host === hostUrl.host;';
  if (!src.includes(aFn) || !src.includes(aPriv) || !src.includes(aOrigin)) {
    log('告警: dsh-client-connection 与预期结构不符,跳过反代信任补丁(远程设置页可能 403)');
    return { applied: false, reason: 'anchor-mismatch' };
  }
  const next = src
    .replace(aFn, `/* ${MARKER} */const YUREN_API_TRUST=(process.env.YUREN_TRUSTED_API_HOSTS||"").split(",").map((s)=>s.trim()).filter(Boolean);\n` + aFn)
    .replace(aPriv, 'PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, YUREN_API_TRUST)')
    .replace(aOrigin, 'const yurenOrigin=new URL(origin);return yurenOrigin.host===hostUrl.host||isTrustedAuthority(yurenOrigin,YUREN_API_TRUST);');
  const check = path.join(path.dirname(file), '.yuren-patch-check.mjs');
  try {
    fs.writeFileSync(check, next, 'utf8');
    const r = spawnSync(process.execPath, ['--check', check], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || '').split('\n').slice(0, 3).join(' '));
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, next, 'utf8');
    fs.renameSync(tmp, file);
    log('已应用反代信任补丁: 受信主机可调用设置/预设等特权接口');
    return { applied: true, reason: 'patched' };
  } catch (e) {
    log(`告警: 反代信任补丁校验/写入失败,保持原样 | ${e.message}`);
    return { applied: false, reason: 'error' };
  } finally {
    try { fs.unlinkSync(check); } catch { /* 临时文件不存在 */ }
  }
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
  if (!result.applied) process.exit(result.reason === 'already' ? 0 : 2);
}
