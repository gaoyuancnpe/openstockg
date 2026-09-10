// MCP 服务器回归测试（零依赖，node 直接运行）：
// node desktop/mcp/mcp-server.test.mjs
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function section(name) {
  console.log(`\n== ${name}`);
}

const baseDir = await mkdtemp(path.join(tmpdir(), "openstock-mcp-test-"));

const server = spawn(process.execPath, [path.join(__dirname, "mcp-server.mjs")], {
  env: { ...process.env, OPENSTOCK_USER_DATA_DIR: baseDir },
  stdio: ["pipe", "pipe", "pipe"]
});

const pending = new Map();
let nextId = 1;
const notifications = [];

server.stdout.setEncoding("utf-8");
let stdoutBuffer = "";
server.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  let index;
  while ((index = stdoutBuffer.indexOf("\n")) >= 0) {
    const line = stdoutBuffer.slice(0, index).trim();
    stdoutBuffer = stdoutBuffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && message.id !== null && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) {
      notifications.push(message);
    }
  }
});

let stderrText = "";
server.stderr.setEncoding("utf-8");
server.stderr.on("data", (chunk) => {
  stderrText += chunk;
});

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params = {}, timeoutMs = 30000) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`请求超时：${method}`));
    }, timeoutMs);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function parseToolText(response) {
  return JSON.parse(response.result.content[0].text);
}

try {
  // ---------- 1. 握手 ----------
  section("MCP 握手");
  const init = await request("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "test" } });
  assert(init.result?.protocolVersion === "2025-06-18", "应回显 protocolVersion");
  assert(init.result?.serverInfo?.name === "openstock-mcp", "serverInfo 正确");
  assert(Boolean(init.result?.capabilities?.tools), "应声明 tools 能力");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  // ---------- 2. 工具清单 ----------
  section("工具清单");
  const listResponse = await request("tools/list");
  const toolNames = listResponse.result.tools.map((tool) => tool.name);
  const expectedTools = [
    "list_rules", "get_config", "update_config", "add_rule", "save_rules",
    "run_screener", "run_financial_screener", "run_rules_once",
    "get_status", "get_recent_events", "get_amv_history", "compute_amv"
  ];
  for (const name of expectedTools) {
    assert(toolNames.includes(name), `工具清单应包含 ${name}`);
  }
  assert(toolNames.length === expectedTools.length, `工具清单应为 ${expectedTools.length} 个（不含 AI 包装工具），实际 ${toolNames.length}`);
  assert(listResponse.result.tools.every((tool) => tool.inputSchema?.type === "object"), "每个工具都应有 inputSchema");

  // ---------- 3. 规则读写 ----------
  section("规则读写");
  const emptyRules = parseToolText(await request("tools/call", { name: "list_rules", arguments: {} }));
  assert(emptyRules.total === 0, "初始规则应为空");

  const added = parseToolText(await request("tools/call", {
    name: "add_rule",
    arguments: {
      rule: {
        name: "MCP 测试规则",
        enabled: true,
        symbols: ["AAPL"],
        conditions: [{ type: "price_above", value: 200 }],
        cooldownSec: 86400
      }
    }
  }));
  assert(added.ok === true && added.total === 1, "add_rule 应成功");

  const rulesNow = parseToolText(await request("tools/call", { name: "list_rules", arguments: {} }));
  assert(rulesNow.total === 1 && rulesNow.rules[0].name === "MCP 测试规则", "list_rules 应返回新增规则");
  assert(rulesNow.rules[0].symbols[0] === "AAPL", "规则快照应带 symbols");

  // ---------- 4. 配置脱敏 ----------
  section("配置脱敏与补丁");
  const updated = parseToolText(await request("tools/call", {
    name: "update_config",
    arguments: { patch: { ai: { apiKey: "sk-secret-123456" }, scheduler: { intervalSec: 120 } } }
  }));
  assert(updated.ok === true, "update_config 应成功");
  assert(String(updated.config?.ai?.apiKey).includes("***"), "返回的配置中 apiKey 应脱敏");
  assert(!JSON.stringify(updated).includes("sk-secret-123456"), "明文密钥不应出现在任何返回里");

  const cfgNow = parseToolText(await request("tools/call", { name: "get_config", arguments: {} }));
  assert(String(cfgNow?.ai?.apiKey).includes("***"), "get_config 的 apiKey 应脱敏");
  assert(cfgNow?.scheduler?.intervalSec === 120, "补丁字段应生效");
  assert(cfgNow?.ai?.orchestration?.mode === "agent_pipeline", "AI 编排默认解封状态应可见");

  // 落盘验证：真实文件中保存的是明文（否则引擎无法调用）
  const savedConfig = JSON.parse(await readFile(path.join(baseDir, "config.json"), "utf-8"));
  assert(savedConfig.ai.apiKey === "sk-secret-123456", "落盘配置应保留明文密钥供引擎使用");

  // ---------- 5. 错误处理 ----------
  section("错误处理");
  const unknownTool = await request("tools/call", { name: "not_a_tool", arguments: {} });
  assert(unknownTool.result?.isError === true, "未知工具应返回 isError");
  assert(String(unknownTool.result.content[0].text).includes("未知工具"), "错误信息应说明原因");

  const badArgs = await request("tools/call", { name: "add_rule", arguments: { rule: "not-object" } });
  assert(badArgs.result?.isError === true, "非法参数应返回 isError");

  const unknownMethod = await request("no/such/method");
  assert(unknownMethod.error?.code === -32601, "未知方法应返回 -32601");

  // ---------- 6. 状态与事件 ----------
  section("状态与事件");
  const status = parseToolText(await request("tools/call", { name: "get_status", arguments: {} }));
  assert(typeof status === "object" && "scheduler" in status, "get_status 应返回结构化状态");

  const events = parseToolText(await request("tools/call", { name: "get_recent_events", arguments: { limit: 5 } }));
  assert(typeof events.count === "number" && Array.isArray(events.events), "get_recent_events 应返回事件数组");

  // ---------- 7. AI 包装工具已移除 ----------
  section("AI 包装工具已移除");
  const removed = await request("tools/call", { name: "ai_chat", arguments: { prompt: "你好" } });
  assert(removed.result?.isError === true, "ai_chat 已移除，应返回 isError");
} finally {
  server.kill("SIGTERM");
}

console.log(`\n通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
  process.exitCode = 1;
}
