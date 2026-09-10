import { appendFile } from "node:fs/promises";
import { createAlertsEngine } from "../engine.mjs";
import { buildRuleSnapshot, maskSensitive } from "../agent/agent-tools.mjs";
import { normalizeDesktopConfig } from "../shared-config.mjs";
import {
  initializeDesktopStorage,
  loadDesktopConfig,
  loadDesktopEvents,
  loadDesktopMarketAmvHistory,
  loadDesktopRules,
  readJSON,
  saveDesktopConfig,
  saveDesktopRules
} from "../main/data-store.mjs";

const MAX_ROWS = 100;
const MAX_RULES = 50;
const MAX_EVENTS = 100;

function clampRows(rows, max = MAX_ROWS) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    total: list.length,
    truncated: list.length > max,
    rows: list.slice(0, max)
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMergePatch(target, patch) {
  const next = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = deepMergePatch(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function createMcpToolRegistry({ dataPaths, log }) {
  let engine = null;

  async function ensureContext() {
    if (engine) return;
    await initializeDesktopStorage(dataPaths);
    engine = createAlertsEngine({
      dataPaths,
      onLog: (line) => log(String(line)),
      onEvent: async (event) => {
        await appendFile(dataPaths.events, `${JSON.stringify(event)}\n`, "utf-8").catch(() => {});
      }
    });
  }

  const tools = [
    {
      name: "list_rules",
      description: "读取 OpenStock 当前配置的全部提醒规则（名称、启用状态、universe、触发条件、通知方式）。",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        await ensureContext();
        const rules = await loadDesktopRules(dataPaths);
        return {
          total: rules.length,
          enabledCount: rules.filter((rule) => rule?.enabled).length,
          rules: rules.slice(0, MAX_RULES).map(buildRuleSnapshot)
        };
      }
    },
    {
      name: "get_config",
      description: "读取当前配置摘要（数据源、调度、AI 编排、通知）。密钥类字段已脱敏，如 sk-***。需要写入密钥请用 update_config。",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        await ensureContext();
        const cfg = await loadDesktopConfig(dataPaths);
        return maskSensitive(cfg);
      }
    },
    {
      name: "update_config",
      description: "以补丁方式更新配置（深合并后整体保存并归一化）。可用来填写 fmpApiKey/finnhubApiKey/ai.apiKey 等明文字段；读取时密钥永远是脱敏的。",
      inputSchema: {
        type: "object",
        properties: {
          patch: { type: "object", description: "要合并进当前配置的字段，例如 {\"ai\":{\"apiKey\":\"sk-xxx\"},\"scheduler\":{\"intervalSec\":120}}" }
        },
        required: ["patch"]
      },
      handler: async ({ patch }) => {
        await ensureContext();
        if (!isPlainObject(patch)) {
          throw new Error("patch 必须是对象");
        }
        const current = await loadDesktopConfig(dataPaths);
        const next = normalizeDesktopConfig(deepMergePatch(current, patch));
        await saveDesktopConfig(dataPaths, next);
        return { ok: true, updatedKeys: Object.keys(patch), config: maskSensitive(next) };
      }
    },
    {
      name: "add_rule",
      description: "追加一条提醒规则。字段结构与桌面端 rules.json 一致：name/enabled/symbols/universe/conditions/groupOp/cooldownSec/notify。",
      inputSchema: {
        type: "object",
        properties: {
          rule: { type: "object", description: "规则对象，例如 {\"name\":\"新高提醒\",\"enabled\":true,\"symbols\":[\"AAPL\"],\"conditions\":[{\"type\":\"price_above\",\"value\":200}],\"cooldownSec\":86400}" }
        },
        required: ["rule"]
      },
      handler: async ({ rule }) => {
        await ensureContext();
        if (!isPlainObject(rule)) {
          throw new Error("rule 必须是对象");
        }
        const rules = await loadDesktopRules(dataPaths);
        const next = [...rules, rule];
        await saveDesktopRules(dataPaths, next);
        return { ok: true, total: next.length, added: buildRuleSnapshot(rule) };
      }
    },
    {
      name: "save_rules",
      description: "全量替换规则列表（与桌面端保存规则等价）。会整体覆盖，先 list_rules 再改再保存。",
      inputSchema: {
        type: "object",
        properties: {
          rules: { type: "array", description: "完整规则数组" }
        },
        required: ["rules"]
      },
      handler: async ({ rules }) => {
        await ensureContext();
        if (!Array.isArray(rules)) {
          throw new Error("rules 必须是数组");
        }
        await saveDesktopRules(dataPaths, rules);
        return { ok: true, total: rules.length };
      }
    },
    {
      name: "run_screener",
      description: "运行价格筛选：手动 symbol 列表或全量美股池（us_all，需 FMP/Finnhub Key）。返回命中行（最多 100 行 + 总数）。",
      inputSchema: {
        type: "object",
        properties: {
          symbols: { type: "array", items: { type: "string" }, description: "手动标的列表，与 universe=manual 搭配" },
          criteria: {
            type: "object",
            properties: {
              universe: { type: "string", enum: ["manual", "us_all"] },
              maxScan: { type: "number", description: "us_all 时扫描上限，默认 500" },
              minPrice: { type: "number" },
              maxPrice: { type: "number" },
              minMarketCap: { type: "number", description: "百万美元" },
              maxMarketCap: { type: "number" },
              minTurnoverM: { type: "number", description: "百万美元" },
              minVolumeRatio: { type: "number" },
              minChangePercent: { type: "number" },
              maxChangePercent: { type: "number" },
              requireRecent5dCloseAth: { type: "boolean" },
              forceRefreshUniverse: { type: "boolean" }
            }
          }
        }
      },
      handler: async ({ symbols, criteria } = {}) => {
        await ensureContext();
        const result = await engine.runScreener({
          symbols: Array.isArray(symbols) ? symbols : [],
          criteria: isPlainObject(criteria) ? criteria : {}
        });
        return clampRows(result);
      }
    },
    {
      name: "run_financial_screener",
      description: "运行财报筛选（仅 FMP，Premium 套餐字段最全）：营收增速、毛利率、EBITDA、现金流、负债等门槛。",
      inputSchema: {
        type: "object",
        properties: {
          symbols: { type: "array", items: { type: "string" } },
          criteria: {
            type: "object",
            properties: {
              universe: { type: "string", enum: ["manual", "us_all"] },
              maxScan: { type: "number", description: "默认 100，财报扫描较慢建议 30-100" },
              minMarketCap: { type: "number" },
              minRevenueGrowthYoY: { type: "number" },
              minGrossMargin: { type: "number" },
              minEbitdaGrowthYoY: { type: "number" },
              minEbitdaMargin: { type: "number" },
              minOperatingMargin: { type: "number" },
              requirePositiveOperatingCashFlow: { type: "boolean" },
              requirePositiveFreeCashFlow: { type: "boolean" },
              maxDebtToEquity: { type: "number" },
              forceRefreshUniverse: { type: "boolean" }
            }
          }
        }
      },
      handler: async ({ symbols, criteria } = {}) => {
        await ensureContext();
        const result = await engine.runFinancialScreener({
          symbols: Array.isArray(symbols) ? symbols : [],
          criteria: isPlainObject(criteria) ? criteria : {}
        });
        return clampRows(result);
      }
    },
    {
      name: "run_rules_once",
      description: "按当前规则执行一轮检查。dry_run=true（默认）只评估不通知；dry_run=false 会真实发送邮件/webhook 通知，慎用。",
      inputSchema: {
        type: "object",
        properties: {
          dry_run: { type: "boolean", default: true },
          ignore_cooldown: { type: "boolean", default: false, description: "忽略冷却时间强制评估" }
        }
      },
      handler: async ({ dry_run = true, ignore_cooldown = false } = {}) => {
        await ensureContext();
        await engine.runOnce({ dryRun: Boolean(dry_run), ignoreCooldown: Boolean(ignore_cooldown) });
        const diagnostics = await readJSON(dataPaths.diagnostics, {});
        return { ok: true, dryRun: Boolean(dry_run), lastRun: diagnostics?.lastRun || null };
      }
    },
    {
      name: "get_status",
      description: "读取运行现场：调度器状态、最近一轮运行结果、飞书桥接状态（来自 diagnostics.json，跨进程共享）。",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        await ensureContext();
        const diagnostics = await readJSON(dataPaths.diagnostics, {});
        return {
          scheduler: diagnostics?.scheduler || null,
          lastRun: diagnostics?.lastRun || null,
          feishuBridge: diagnostics?.feishuBridge || null,
          updatedAt: diagnostics?.updatedAt || ""
        };
      }
    },
    {
      name: "get_recent_events",
      description: "读取最近事件流（提醒触发、调度、proposal 等），默认 20 条。",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "默认 20，最大 100" }
        }
      },
      handler: async ({ limit } = {}) => {
        await ensureContext();
        const parsed = Number.parseInt(String(limit ?? "20"), 10);
        const bounded = Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_EVENTS, parsed)) : 20;
        const events = await loadDesktopEvents(dataPaths, { limit: bounded });
        return { count: events.length, events };
      }
    },
    {
      name: "get_amv_history",
      description: "读取 0AMV（活跃市值）历史序列，可按 index 过滤（sp500/nasdaq/all）。",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "string", enum: ["sp500", "nasdaq", "all"] }
        }
      },
      handler: async ({ index } = {}) => {
        await ensureContext();
        const history = await loadDesktopMarketAmvHistory(dataPaths, {
          index: index ? String(index) : undefined
        });
        return clampRows(history, MAX_ROWS);
      }
    },
    {
      name: "compute_amv",
      description: "计算全市场 0AMV 指数（需 FMP Key，依赖 stock-screener 与历史价格接口，结果带 24 小时缓存语义）。",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "string", enum: ["sp500", "nasdaq", "all"], default: "sp500" },
          limit: { type: "number" }
        }
      },
      handler: async ({ index = "sp500", limit } = {}) => {
        await ensureContext();
        return await engine.runMarketAmv({
          index: String(index || "sp500"),
          limit: limit == null ? undefined : Number(limit),
          useFmp: true
        });
      }
    }
  ];

  const handlers = new Map(tools.map((tool) => [tool.name, tool.handler]));

  return {
    list: () => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    async call(name, args) {
      const handler = handlers.get(String(name || ""));
      if (!handler) {
        throw new Error(`未知工具：${name}`);
      }
      return await handler(isPlainObject(args) ? args : {});
    }
  };
}
