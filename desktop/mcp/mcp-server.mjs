#!/usr/bin/env node
// OpenStock MCP Server（stdio 传输，零依赖手写 JSON-RPC 2.0）
// 启动：node desktop/mcp/mcp-server.mjs
// 数据目录默认与桌面端共享（~/.config/openstock-alerts-desktop），可用 OPENSTOCK_USER_DATA_DIR 覆盖
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { getDataPathsFromBase } from "../main/data-store.mjs";
import { createMcpToolRegistry } from "./mcp-tools.mjs";

const SUPPORTED_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "openstock-mcp", version: "0.1.0" };

const dataDirBase = process.env.OPENSTOCK_USER_DATA_DIR
  ? path.resolve(process.env.OPENSTOCK_USER_DATA_DIR)
  : path.join(os.homedir(), ".config", "openstock-alerts-desktop");
const dataPaths = getDataPathsFromBase(dataDirBase);

function log(line) {
  process.stderr.write(`[openstock-mcp] ${line}\n`);
}

const registry = createMcpToolRegistry({ dataPaths, log });

function sendMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function replyResult(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  sendMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    const requested = String(params?.protocolVersion || "");
    replyResult(id, {
      protocolVersion: requested || SUPPORTED_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "OpenStock 行情研究 MCP：美股筛选、财报筛选、规则提醒、0AMV 指数与多智能体 AI 分析；" +
        "个股研究有 get_quote(快照)/get_financials(业绩+估值+预期全貌)/get_price_history(区间行情)/get_earnings_calendar(财报日历)/get_peers(同业对比)。" +
        "数据目录与桌面端共享；密钥读取永远脱敏，写入用 update_config。"
    });
    return;
  }

  if (method === "ping") {
    replyResult(id, {});
    return;
  }

  if (method === "tools/list") {
    replyResult(id, { tools: registry.list() });
    return;
  }

  if (method === "tools/call") {
    const name = String(params?.name || "");
    const args = params?.arguments && typeof params.arguments === "object" ? params.arguments : {};
    try {
      const result = await registry.call(name, args);
      replyResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log(`tools/call ${name} 失败：${messageText}`);
      replyResult(id, {
        content: [{ type: "text", text: `工具 ${name} 执行失败：${messageText}` }],
        isError: true
      });
    }
    return;
  }

  replyError(id, -32601, `Method not found: ${method}`);
}

async function handleLine(line) {
  const text = String(line || "").trim();
  if (!text) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    log("收到无法解析的行，已忽略");
    return;
  }
  if (!message || typeof message !== "object") return;

  // notification（无 id）不需要响应；initialized 之外的未知 notification 静默忽略
  if (message.id === undefined || message.id === null) {
    if (message.method === "notifications/initialized") {
      log(`就绪，数据目录：${dataPaths.base}`);
    }
    return;
  }

  try {
    await handleRequest(message);
  } catch (error) {
    replyError(message.id, -32603, error instanceof Error ? error.message : String(error));
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", handleLine);
rl.on("close", () => {
  log("stdin 关闭，退出");
  process.exit(0);
});

log(`启动（${SERVER_INFO.name}@${SERVER_INFO.version}），等待 MCP 客户端握手`);
