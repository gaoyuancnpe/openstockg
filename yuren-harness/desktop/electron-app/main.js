'use strict';
/* Yuren Harness - Electron 桌面壳(分支形态;主形态是 web/,见仓库根 README)
 * 自包含形态: 运行资产内嵌 resources\
 *   (app-full 全量 node_modules / assets 只读资产 / vendor-memory),
 * 本文件内置 Node 版生成器,每次启动:
 *   - 准备用户数据目录(用户主目录\yuren-harness): AGENTS.md 副本 + workspace + 技能同步
 *   - 按本机安装路径生成 dsh 补丁(记忆 MCP 用本 exe 的 Electron-as-Node 直跑)
 *   - 工作区种子注册 + 密钥预置导入(幂等)
 * 后端以用户数据目录为 cwd。启动 dsh 后端用 ELECTRON_RUN_AS_NODE 复用自带 Node
 * (--expose-internals 为 cordis-plugin-hmr 所需,缺了启动即崩);
 * 后端意外退出自动重启(≤2次);退出连子进程树(实测零残留)。
 */
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_TITLE = 'Yuren Harness';
const PORT_BASE = 3081;
const READY_TIMEOUT_MS = 240000;

let win = null;
let backend = null;
let quitting = false;
let lastStatus = null;
let restartCount = 0;
let usedPort = null;
const logLines = [];

function log(line) {
  const stamped = `[${new Date().toLocaleTimeString()}] ${line}`;
  logLines.push(stamped);
  if (logLines.length > 300) logLines.shift();
  console.log(stamped);
}

function sendStatus(phase, text) {
  lastStatus = { phase, text };
  if (win && !win.isDestroyed()) {
    win.webContents.send('status', { phase, text, log: logLines.slice(-40) });
  }
}

/* ---------- 路径定位 ---------- */
function bundledDirs() {
  const base = app.isPackaged ? path.dirname(__dirname) : path.join(__dirname, 'vendor');
  return {
    nodeModules: path.join(base, 'app-full', 'node_modules'),
    assets: path.join(base, 'assets'),
    memory: path.join(base, 'vendor-memory'),
  };
}

function bundledReady(d) {
  return fs.existsSync(path.join(d.nodeModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
    && fs.existsSync(path.join(d.assets, 'dsh', 'cordis.desktop.template.yml'))
    && fs.existsSync(path.join(d.memory, 'node_modules', '@modelcontextprotocol',
      'server-memory', 'dist', 'index.js'));
}

/** 用户数据目录: 用户主目录\yuren-harness —— 不放"文档"(Defender 受控文件夹访问
 *  默认保护 Documents,未签名程序写入会被系统性拦截,实测踩坑)。YUREN_DATA_DIR? TAILINGS_DATA_DIR? 用 YUREN_DATA_DIR 覆盖。 */
function dataDir() {
  if (process.env.YUREN_DATA_DIR) return process.env.YUREN_DATA_DIR;
  return path.join(os.homedir(), 'yuren-harness');
}

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

/* ---------- 端口与就绪 ---------- */
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => s.close(() => resolve(false)));
    s.listen(port, '127.0.0.1');
  });
}

async function findPort(base) {
  for (let p = base; p < base + 20; p++) {
    if (!(await portInUse(p))) return p;
  }
  throw new Error('3081-3100 范围内无可用端口');
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/', timeout: 2000 },
      (r) => { r.resume(); resolve(r.statusCode > 0); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* 已退出 */ }
  }
}

/* ---------- Node 版生成器 ---------- */
function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function ensureDataDir(dirs) {
  const D = dataDir();
  for (const sub of ['workspace/inputs', 'workspace/outputs', 'dsh', 'provision']) {
    fs.mkdirSync(path.join(D, sub), { recursive: true });
  }
  const agentsDst = path.join(D, 'AGENTS.md');
  if (!fs.existsSync(agentsDst)) {
    try { fs.copyFileSync(path.join(dirs.assets, 'AGENTS.md'), agentsDst); }
    catch (e) { log(`AGENTS.md 副本跳过: ${e.message}`); }
  }
  syncSkills(dirs, D);
  generatePatch(D, dirs);
  return D;
}

function skillsFingerprint(srcDir) {
  const parts = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { parts.push(name + '/'); walk(p); }
      else parts.push(`${name}:${st.size}:${st.mtimeMs}`);
    }
  };
  walk(srcDir);
  return parts.join('|');
}

function syncSkills(dirs, D) {
  const skillsSrc = path.join(dirs.assets, 'skills');
  const skillsDst = path.join(D, '.dsh', 'skills');
  if (!fs.existsSync(skillsSrc)) return;
  try {
    const fp = skillsFingerprint(skillsSrc);
    const marker = path.join(D, '.dsh', '.skills-sync');
    if (fs.existsSync(skillsDst) && fs.existsSync(marker)
        && fs.readFileSync(marker, 'utf8') === fp) {
      return;
    }
    fs.rmSync(skillsDst, { recursive: true, force: true });
    fs.cpSync(skillsSrc, skillsDst, { recursive: true });
    writeFileAtomic(marker, fp);
  } catch (e) {
    log(`技能同步跳过(不影响使用): ${e.message}`);
  }
}

function generatePatch(D, dirs) {
  const tpl = fs.readFileSync(
    path.join(dirs.assets, 'dsh', 'cordis.desktop.template.yml'), 'utf8');
  const memEntry = path.join(dirs.memory, 'node_modules', '@modelcontextprotocol',
    'server-memory', 'dist', 'index.js');
  const brandPkg = require('url').pathToFileURL(
    path.join(dirs.assets, 'dsh', 'brand', 'lib', 'index.js')).href;
  const q = (s) => `'${s}'`;
  const memoryRow = [
    '    - id: mcp-memory',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: memory',
    '        transport: stdio',
    `        command: ${q(process.execPath)}`,
    `        args:`,
    `          - ${q(memEntry)}`,
    '        env:',
    "          ELECTRON_RUN_AS_NODE: '1'",
  ].join('\n');
  const pyExe = path.join(path.dirname(dirs.memory), 'vendor-python', 'python.exe');
  const domainServer = path.join(dirs.assets, 'mcp-servers', 'example_server.py');
  const text = tpl
    .replaceAll('{{BRAND_PKG}}', brandPkg)
    .replaceAll('{{EXE}}', process.execPath)
    .replaceAll('{{MEMORY_ENTRY}}', memEntry)
    .replaceAll('{{MEMORY_ROW}}', memoryRow)
    .replaceAll('{{PY_EXE}}', pyExe)
    .replaceAll('{{DOMAIN_SERVER}}', domainServer);
  writeFileAtomic(path.join(D, 'dsh', 'cordis.patch.yml'), text);
}

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
    if (![...data.tables.workspaces.values()].some((r) => canon(r.path) === canon(D))) {
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

function importProvision() {
  const candidates = [
    path.join(dataDir(), 'provision', 'profile.yaml'),
    path.join(path.dirname(app.getPath('exe')), 'provision', 'profile.yaml'),
  ];
  const provFile = candidates.find((p) => fs.existsSync(p));
  if (!provFile) return;
  try {
    const text = fs.readFileSync(provFile, 'utf8');
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
    const credRows = credsPart.split('\n')
      .filter((l) => /^[A-Za-z0-9_]+:\s*\S+$/.test(l));
    if (credRows.length) {
      const credFile = path.join(home, '.credentials.yaml');
      let ccur = fs.existsSync(credFile) ? fs.readFileSync(credFile, 'utf8') : '';
      const have = new Set((ccur.match(/^\s+([A-Za-z0-9_]+):/gm) || [])
        .map((l) => l.trim().split(':')[0]));
      const miss = credRows.filter((l) => !have.has(l.split(':', 1)[0]));
      if (miss.length) {
        if (!ccur.includes('refs:')) {
          ccur = ccur.replace(/\s+$/, '') + (ccur.trim() ? '\n' : 'version: 1\n') + 'refs:\n';
        }
        ccur = ccur.replace(/\s+$/, '') + '\n' + miss.map((l) => '  ' + l).join('\n') + '\n';
        fs.mkdirSync(home, { recursive: true });
        writeFileAtomic(credFile, ccur);
        log(`预置导入: credentials ${miss.length} 项`);
      }
    }
  } catch (e) { log(`预置导入跳过: ${e.message}`); }
}

/* ---------- 后端启动 ---------- */
function dshBinPath() {
  const bundled = bundledDirs();
  const p = path.join(bundled.nodeModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (fs.existsSync(p)) return p;
  const dev = path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  return fs.existsSync(dev) ? dev : null;
}

function launchBackend(cwdDir, patch, port) {
  return new Promise((resolve) => {
    const common = ['web', '--patch', patch, '--no-open', '--port', String(port)];
    const env = { ...process.env };

    const bin = dshBinPath();
    if (bin) {
      env.ELECTRON_RUN_AS_NODE = '1';
      backend = spawn(process.execPath, ['--expose-internals', bin, ...common],
        { cwd: cwdDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      fail('未找到内置 dsh 运行时 —— 请先用《构建桌面版.bat》完成构建(含 vendor)。');
      resolve(null);
      return;
    }

    const tag = 'dsh';
    backend.stdout.on('data', (d) => d.toString().split('\n').filter(Boolean).forEach((l) => log(`[${tag}] ${l}`)));
    backend.stderr.on('data', (d) => d.toString().split('\n').filter(Boolean).forEach((l) => log(`[${tag}!] ${l}`)));

    let settled = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (settled || !backend) return;
      if (await ping(port)) {
        settled = true;
        clearInterval(timer);
        resolve(`http://127.0.0.1:${port}/`);
      } else if (Date.now() - started > READY_TIMEOUT_MS) {
        settled = true;
        clearInterval(timer);
        killTree(backend.pid);
        backend = null;
        fail('服务启动超时。');
        resolve(null);
      } else if (Date.now() - started > 15000) {
        sendStatus('loading', `正在启动服务(端口 ${port}),请稍候...`);
      }
    }, 800);

    backend.on('exit', (code) => {
      if (settled || quitting) return;
      settled = true;
      clearInterval(timer);
      backend = null;
      if (win && !win.isDestroyed() && !win.webContents.getURL().startsWith('file:')
          && restartCount < 2) {
        restartCount += 1;
        log(`后端进程意外退出(代码 ${code}),尝试自动重启(${restartCount}/2)...`);
        start().catch((e) => fail(`重启异常: ${e.message}`));
        return;
      }
      fail(`后端进程已退出(代码 ${code})。`);
      resolve(null);
    });
  });
}

function fail(text) {
  log(`[失败] ${text}`);
  const show = () => sendStatus('failed', text);
  if (win && !win.isDestroyed()) {
    const url = win.webContents.getURL();
    if (!url.startsWith('file:')) {
      win.loadFile(path.join(__dirname, 'loader.html')).then(show).catch(() => {});
      return;
    }
  }
  show();
}

async function start() {
  const dirs = bundledDirs();
  if (!bundledReady(dirs)) {
    dialog.showErrorBox(APP_TITLE,
      '自包含组件缺失(app-full/assets/vendor-memory)。\n请先在开发机跑《构建桌面版.bat》完成构建。');
    app.quit();
    return;
  }
  sendStatus('loading', '正在准备本机配置...');
  let D;
  try {
    D = ensureDataDir(dirs);
  } catch (e) {
    fail(`无法准备数据目录(用户主目录\\yuren-harness): ${e.message}\n`
      + '常见原因: 安全软件拦截或权限受限。\n'
      + '可尝试: 在 Windows 安全中心把本程序加入"勒索软件防护-允许的应用",或重启后再试。');
    return;
  }
  seedWorkspace(D);
  importProvision();
  log(`自包含模式,用户数据目录: ${D}`);

  let port;
  try { port = await findPort(PORT_BASE); } catch (e) { fail(e.message); return; }
  usedPort = port;
  const url = await launchBackend(D, path.join(D, 'dsh', 'cordis.patch.yml'), port);
  if (!url) return;
  log(`服务就绪: ${url}`);
  sendStatus('loading', '正在打开界面...');
  try { await win.loadURL(url); } catch (e) { fail(`界面加载失败: ${e.message}`); return; }

  if (process.env.YUREN_SMOKE === '1') {
    log('烟雾测试模式,校验后端 RPC 后自动退出');
    smokeRpc(usedPort);
  }
}

function smokeRpc(port) {
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: '0a1b2c3d-0123-4567-89ab-0123456789ab',
    method: 'llm.providers',
    payload: {},
  });
  const finish = (msg) => { log(msg); setTimeout(() => app.quit(), 1500); };
  const attempt = (n) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/llm.providers', method: 'POST',
        headers: { 'content-type': 'application/json' }, timeout: 10000 },
      (r) => {
        let buf = '';
        r.on('data', (c) => { buf += c; });
        r.on('end', () => {
          const ok = r.statusCode === 200 && buf.includes('"ok":true');
          if (ok || n >= 12) {
            finish(ok ? `烟雾RPC HTTP ${r.statusCode} OK`
                      : `烟雾RPC HTTP ${r.statusCode} FAIL: ${buf.slice(0, 200)}`);
          } else {
            setTimeout(() => attempt(n + 1), 1000);
          }
        });
      });
    req.on('error', (e) => {
      if (n >= 12) finish(`烟雾RPC失败: ${e.message}`);
      else setTimeout(() => attempt(n + 1), 1000);
    });
    req.on('timeout', () => { req.destroy(); });
    req.end(body);
  };
  attempt(0);
}

/* ---------- 窗口与生命周期 ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: APP_TITLE,
    backgroundColor: '#101319',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    if (!win.isDestroyed()) win.setTitle(APP_TITLE);
  });
  win.webContents.on('did-finish-load', () => {
    if (lastStatus && win && !win.isDestroyed()
        && win.webContents.getURL().startsWith('file:')) {
      win.webContents.send('status', { ...lastStatus, log: logLines.slice(-40) });
    }
  });
  win.loadFile(path.join(__dirname, 'loader.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ipcMain.handle('retry', () => {
      if (backend) { killTree(backend.pid); backend = null; }
      sendStatus('loading', '正在重新启动...');
      return start().catch((e) => fail(`启动异常: ${e.message}`));
    });
    createWindow();
    start().catch((e) => fail(`启动异常: ${e.message}`));
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => {
    if (backend) { killTree(backend.pid); backend = null; }
  });
}
