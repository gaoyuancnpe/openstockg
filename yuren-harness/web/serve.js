#!/usr/bin/env node
'use strict';
/* Yuren Harness — Web 形态启动器(主形态)。
 *
 * 职责: 生成补丁(按本机路径填充品牌插件/记忆MCP) -> 准备数据目录
 *       (AGENTS.md 副本 + workspace + 技能同步 + 密钥预置导入,全部幂等)
 *       -> 拉起 dsh web 服务(前后端一进程,浏览器访问;可用 nginx 分离部署,见 README)。
 *
 * 常用环境变量:
 *   YUREN_INSTANCE=market        实例名:数据目录自动落到 ~/.yuren-instances/<name>,
 *                                DSH_HOME 自动落到 <数据目录>/dsh-home,与其他实例完全隔离;
 *                                多实例请用 web/instance.sh 启动(自动设置本变量与端口)
 *   YUREN_HOST=0.0.0.0        监听地址(默认 127.0.0.1;对外/容器部署改 0.0.0.0)
 *   YUREN_PORT=3080           监听端口
 *   YUREN_TRUSTED_HOSTS=api.example.com,localhost:3080
 *                             /api 浏览器信任域(前端从其它域名访问时必须加)
 *   YUREN_DATA_DIR=~/.yuren-harness   项目数据目录(AGENTS.md/workspace/技能/补丁;设置
 *                                YUREN_INSTANCE 时被忽略,除非显式指定本变量)
 *   DSH_HOME=~/.dsh          会话与密钥目录(dsh 原生约定;设置 YUREN_INSTANCE 时
 *                                自动改为 <数据目录>/dsh-home,避免多实例共仓互污)
 *   YUREN_DSH=<node_modules 路径>  复用别处安装的 dsh 运行时(默认 ./node_modules)
 */
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(ROOT, 'harness');
const APP_TITLE = 'Yuren Harness';

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

/* ---------- 路径与环境 ---------- */
function dshRoot() {
  const env = process.env.YUREN_DSH;
  if (env) return path.resolve(env);
  return path.join(__dirname, 'node_modules');
}
function dataDir() {
  if (process.env.YUREN_DATA_DIR) return path.resolve(process.env.YUREN_DATA_DIR);
  if (process.env.YUREN_INSTANCE) {
    return path.join(os.homedir(), '.yuren-instances', process.env.YUREN_INSTANCE);
  }
  return path.join(os.homedir(), '.yuren-harness');
}
function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME;
  // 实例模式独占会话/密钥仓;默认模式沿用全局 ~/.dsh(可能与其他 dsh 使用者共享)
  if (process.env.YUREN_INSTANCE) return path.join(dataDir(), 'dsh-home');
  return path.join(os.homedir(), '.dsh');
}
function pick(root, rel) {
  const p = path.join(root, ...rel);
  return fs.existsSync(p) ? p : null;
}

/* ---------- 原子写 ---------- */
function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/* ---------- 数据目录准备(全部幂等,失败只告警) ---------- */
function ensureDataDir() {
  const D = dataDir();
  for (const sub of ['workspace/inputs', 'workspace/outputs', 'dsh', 'provision']) {
    fs.mkdirSync(path.join(D, sub), { recursive: true });
  }
  const agentsDst = path.join(D, 'AGENTS.md');
  if (!fs.existsSync(agentsDst)) {
    try { fs.copyFileSync(path.join(ROOT, 'AGENTS.md'), agentsDst); }
    catch (e) { log(`AGENTS.md 副本跳过: ${e.message}`); }
  }
  syncSkills(D);
  return D;
}

function fingerprint(dir) {
  const parts = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { parts.push(name + '/'); walk(p); }
      else parts.push(`${name}:${st.size}:${st.mtimeMs}`);
    }
  };
  walk(dir);
  return parts.join('|');
}

function syncSkills(D) {
  const src = path.join(HARNESS, 'skills');
  const dst = path.join(D, '.dsh', 'skills');
  if (!fs.existsSync(src)) return;
  try {
    const fp = fingerprint(src);
    const marker = path.join(D, '.dsh', '.skills-sync');
    if (fs.existsSync(dst) && fs.existsSync(marker)
        && fs.readFileSync(marker, 'utf8') === fp) return;
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
    writeFileAtomic(marker, fp);
    log('技能已同步');
  } catch (e) { log(`技能同步跳过(不影响使用): ${e.message}`); }
}

/* ---------- 补丁生成 ---------- */
function generatePatch(D) {
  const root = dshRoot();
  const brandPkg = require('url').pathToFileURL(
    path.join(HARNESS, 'brand', 'lib', 'index.js')).href;
  // 记忆包优先从 dsh 运行时根找(与 dsh 同源安装),找不到再回退本地 ./node_modules
  const candidates = [
    pick(root, ['@modelcontextprotocol', 'server-memory', 'dist', 'index.js']),
    pick(path.join(__dirname, 'node_modules'),
      ['@modelcontextprotocol', 'server-memory', 'dist', 'index.js']),
  ];
  const memoryScript = candidates.find(Boolean);
  const tpl = fs.readFileSync(path.join(HARNESS, 'cordis.template.yml'), 'utf8');
  let text = tpl
    .replaceAll('{{BRAND_PKG}}', brandPkg)
    .replaceAll('{{MEMORY_SCRIPT}}', memoryScript || 'MEMORY_SCRIPT_MISSING');
  if (!memoryScript) {
    log('警告: 未找到 @modelcontextprotocol/server-memory,记忆 MCP 将不可用(npm install 了吗?)');
  }
  writeFileAtomic(path.join(D, 'dsh', 'cordis.patch.yml'), text);
  return path.join(D, 'dsh', 'cordis.patch.yml');
}

/* ---------- 工作区种子注册(文件必须带 unit 头,dsh-storage-json 硬校验) ---------- */
function seedWorkspace(D) {
  try {
    const wsFile = path.join(dshHome(), 'storages', 'workspace.json');
    let data = {};
    if (fs.existsSync(wsFile)) {
      try { data = JSON.parse(fs.readFileSync(wsFile, 'utf8')); } catch { data = {}; }
    }
    data.unit = Object.assign({ name: 'workspace', version: 2 }, data.unit || {});
    data = { unit: data.unit, ...data };
    data.tables = data.tables || {};
    data.tables.workspaces = data.tables.workspaces || {};
    data.global = data.global || {};
    const ids = data.global.workspaceIds = data.global.workspaceIds || [];
    data.global.archivedSessionIds = data.global.archivedSessionIds || [];
    const canon = (p) => String(p).replace(/[\\/]+$/, '');
    for (const [k, rec] of Object.entries(data.tables.workspaces)) {
      if (!fs.existsSync(String(rec.path || ''))) {
        delete data.tables.workspaces[k];
        const i = ids.indexOf(k);
        if (i >= 0) ids.splice(i, 1);
      }
    }
    if (!Object.values(data.tables.workspaces).some((r) => canon(r.path) === canon(D))) {
      const id = randomUUID();
      const now = new Date().toISOString();
      data.tables.workspaces[id] = { id, path: D, title: APP_TITLE, createdAt: now, updatedAt: now, sessionIds: [] };
      ids.push(id);
      data.global.initialized = true;
    }
    fs.mkdirSync(path.dirname(wsFile), { recursive: true });
    writeFileAtomic(wsFile, JSON.stringify(data, null, 2) + '\n');
  } catch (e) { log(`工作区预注册跳过: ${e.message}`); }
}

/* ---------- 管理员预置导入(幂等,只补不覆盖) ---------- */
function importProvision() {
  const prov = path.join(dataDir(), 'provision', 'profile.yaml');
  if (!fs.existsSync(prov)) return;
  try {
    const text = fs.readFileSync(prov, 'utf8');
    const body = text.split('--- settings ---')[1];
    if (!body) { log('预置导入跳过: 格式不对(缺分段标记)'); return; }
    const [settingsPart, credsPart] = body.split('--- credentials ---');
    const home = dshHome();
    const settingsFile = path.join(home, 'settings.yaml');
    let cur = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : '';
    if (!/^llm-pi-ai:/m.test(cur)) {
      const blocks = {};
      let name = null;
      for (const line of settingsPart.split('\n')) {
        const m = /^([A-Za-z][A-Za-z0-9_-]*):/.exec(line);
        if (m) { name = m[1]; blocks[name] = [line]; }
        else if (name) blocks[name].push(line);
      }
      const add = Object.entries(blocks)
        .filter(([k]) => !new RegExp(`^${k}:`, 'm').test(cur))
        .flatMap(([, lines]) => lines);
      if (add.length) {
        cur = (cur.trim() ? cur.replace(/\s+$/, '') + '\n\n' : '') + add.join('\n').replace(/\s+$/, '') + '\n';
        fs.mkdirSync(home, { recursive: true });
        writeFileAtomic(settingsFile, cur);
        log('预置导入: settings 已写入');
      }
    }
    const rows = credsPart.split('\n').filter((l) => /^[A-Za-z0-9_]+:\s*\S+$/.test(l));
    if (rows.length) {
      const credFile = path.join(home, '.credentials.yaml');
      let c = fs.existsSync(credFile) ? fs.readFileSync(credFile, 'utf8') : '';
      const have = new Set((c.match(/^\s+([A-Za-z0-9_]+):/gm) || []).map((l) => l.trim().split(':')[0]));
      const miss = rows.filter((l) => !have.has(l.split(':', 1)[0]));
      if (miss.length) {
        if (!c.includes('refs:')) c = c.replace(/\s+$/, '') + (c.trim() ? '\n' : 'version: 1\n') + 'refs:\n';
        c = c.replace(/\s+$/, '') + '\n' + miss.map((l) => '  ' + l).join('\n') + '\n';
        fs.mkdirSync(home, { recursive: true });
        writeFileAtomic(credFile, c);
        log(`预置导入: credentials ${miss.length} 项`);
      }
    }
  } catch (e) { log(`预置导入跳过: ${e.message}`); }
}

/* ---------- 启动 ---------- */
async function main() {
  const root = dshRoot();
  const bin = path.join(root, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!fs.existsSync(bin)) {
    console.error(`未找到 dsh 运行时: ${bin}
请在 web/ 下执行 npm install,或用 YUREN_DSH 指向一个已装 @deepseek-ai/dsh 的 node_modules。`);
    process.exit(1);
  }
  const D = ensureDataDir();
  const patch = generatePatch(D);
  seedWorkspace(D);
  importProvision();
  if (!process.env.YUREN_INSTANCE && !process.env.YUREN_DATA_DIR && !process.env.DSH_HOME) {
    log('提示: 未设置 YUREN_INSTANCE,正在使用共享默认目录(~/.yuren-harness + ~/.dsh);'
      + '多实例部署请用 web/instance.sh,避免实例间互相污染');
  }
  log(`数据目录: ${D}`);

  const host = process.env.YUREN_HOST || '127.0.0.1';
  const port = process.env.YUREN_PORT || '3080';
  const args = ['web', '--patch', patch, '--no-open', '--host', host, '--port', port];
  for (const h of (process.env.YUREN_TRUSTED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    args.push('--trusted-host', h);
  }

  log(`启动 dsh: ${bin} ${args.join(' ')}`);
  // Linux 下 detached+进程组,退出时整组清理(连带 MCP 子进程)
  const child = spawn(process.execPath, [bin, ...args], {
    stdio: ['ignore', 'inherit', 'inherit'], detached: true, env: { ...process.env },
  });
  const killAll = () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* 已退出 */ }
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000);
  };
  process.on('SIGINT', () => { killAll(); process.exit(0); });
  process.on('SIGTERM', () => { killAll(); process.exit(0); });
  child.on('exit', (code, sig) => {
    log(`dsh 已退出(code=${code} signal=${sig})`);
    process.exit(code == null ? 1 : code);
  });

  const started = Date.now();
  const timer = setInterval(() => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (r) => {
      r.resume();
      if (r.statusCode > 0) {
        clearInterval(timer);
        log(`就绪: http://${host === '0.0.0.0' ? '本机IP' : host}:${port}/  (首启配置模型 API 后即可使用)`);
      }
    });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    if (Date.now() - started > 120000) {
      clearInterval(timer);
      log('警告: 120 秒仍未就绪,请检查上方 dsh 输出');
    }
  }, 1500);
}

main().catch((e) => { console.error('启动失败:', e); process.exit(1); });
