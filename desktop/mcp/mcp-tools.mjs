import { appendFile } from "node:fs/promises";
import { createAlertsEngine } from "../engine.mjs";
import { buildRuleSnapshot, maskSensitive } from "../agent/agent-tools.mjs";
import { normalizeDesktopConfig } from "../shared-config.mjs";
import {
  getQuoteSnapshot,
  getFinancialReport,
  getPriceHistoryReport,
  getEarningsCalendarReport
} from "../engine/research-service.mjs";
import {
  UI_CONDITION_TYPES,
  conditionFromUI,
  conditionTypeNeedsValue
} from "../rules/rule-condition-shared.mjs";
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

function isEngineCondition(condition) {
  if (!isPlainObject(condition) || typeof condition.op !== "string") return false;
  const hasArgs = Array.isArray(condition.args) && condition.args.length > 0;
  // right 既可以是字面量(数字/字符串),也可以是 {var:...}
  const hasLeftRight = isPlainObject(condition.left) && condition.right !== undefined;
  return hasArgs || hasLeftRight;
}

/**
 * 把入参规则归一成引擎可执行形状。
 * 引擎只读 rule.condition(单数);若原样收下 UI 形状 conditions[],会得到
 * collectVars=空集 + evaluate=null 的"永不触发的死规则"且不报错——这里强制二选一:
 *  - 引擎形状 condition 树:原样收下
 *  - UI 形状 conditions[](类型必须全部受支持,未知类型显式拒绝而非回落 price>=0)
 * 两者皆缺/皆无效:抛错拒收。
 */
function normalizeRuleForEngine(rule) {
  if (isEngineCondition(rule?.condition)) {
    return { ...rule };
  }
  const items = Array.isArray(rule?.conditions) ? rule.conditions.filter(Boolean) : [];
  if (items.length === 0) {
    throw new Error(
      "规则缺少有效条件：请提供引擎形状的 condition 树（{op:'and',args:[{op:'>=',left:{var:'marketCap'},right:10000}]}），"
      + "或非空 conditions[] 数组（自动转换）。拒绝创建永不触发的空条件规则。"
    );
  }
  const unknown = items
    .filter((item) => !UI_CONDITION_TYPES.includes(String(item?.type)))
    .map((item) => String(item?.type));
  if (unknown.length > 0) {
    throw new Error(`conditions 含未知类型：${unknown.join("、")}。受支持类型见 rule-condition-shared 的 UI_CONDITION_TYPES。`);
  }
  const groupOp = rule.groupOp === "or" ? "or" : "and";
  const args = items.map((item) => {
    const type = String(item.type);
    return conditionFromUI(type, conditionTypeNeedsValue(type) ? item.value : 0);
  });
  const next = {
    ...rule,
    condition: args.length === 1 ? args[0] : { op: groupOp, args },
    ui: isPlainObject(rule.ui)
      ? rule.ui
      : { groupOp, items: items.map((item) => ({ type: String(item.type), value: item.value ?? null })) }
  };
  delete next.conditions;
  delete next.groupOp;
  return next;
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
      description: "追加一条提醒规则（自动归一化：UI 形状 conditions[] 会转成引擎 condition 树；两者皆缺会拒收，不会造出永不触发的死规则）。",
      inputSchema: {
        type: "object",
        properties: {
          rule: {
            type: "object",
            description: "规则对象。推荐引擎形状：{\"name\":\"新高提醒\",\"enabled\":true,\"symbols\":[\"AAPL\"],\"condition\":{\"op\":\"and\",\"args\":[{\"op\":\">=\",\"left\":{\"var\":\"price\"},\"right\":200}]},\"cooldownSec\":86400}；也接受 UI 形状：{\"conditions\":[{\"type\":\"price_above\",\"value\":200}]}（自动转换）"
          }
        },
        required: ["rule"]
      },
      handler: async ({ rule }) => {
        await ensureContext();
        if (!isPlainObject(rule)) {
          throw new Error("rule 必须是对象");
        }
        const normalized = normalizeRuleForEngine(rule);
        const rules = await loadDesktopRules(dataPaths);
        const next = [...rules, normalized];
        await saveDesktopRules(dataPaths, next);
        return { ok: true, total: next.length, added: buildRuleSnapshot(normalized) };
      }
    },
    {
      name: "save_rules",
      description: "全量替换规则列表（与桌面端保存规则等价，逐条归一化：condition 树原样，conditions[] 自动转换，无效拒收）。会整体覆盖，先 list_rules 再改再保存。",
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
        const normalized = rules.map((rule, index) => {
          if (!isPlainObject(rule)) {
            throw new Error(`rules[${index}] 必须是对象`);
          }
          return normalizeRuleForEngine(rule);
        });
        await saveDesktopRules(dataPaths, normalized);
        return { ok: true, total: normalized.length };
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
    },
    {
      name: "get_quote",
      description: "个股快照：实时报价(套餐不支持时回退最近收盘)+市值/成交额/换手/新高标志/52周高低+公司摘要。价格指标带 20h 缓存。",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "股票代码，例如 AAPL、BRK.B" }
        },
        required: ["symbol"]
      },
      handler: async ({ symbol } = {}) => {
        await ensureContext();
        return await getQuoteSnapshot({ dataPaths, config: await loadDesktopConfig(dataPaths), symbol });
      }
    },
    {
      name: "get_financials",
      description: "个股财报：三大报表原始序列(利润/现金流/资产负债，近 N 期)+衍生指标(增速/利润率/FCF/负债率/财报日临近)。指标带 48h 缓存。",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "股票代码" },
          period: { type: "string", enum: ["quarter", "annual"], default: "quarter" },
          limit: { type: "number", default: 8, description: "返回期数，2-20" }
        },
        required: ["symbol"]
      },
      handler: async ({ symbol, period, limit } = {}) => {
        await ensureContext();
        return await getFinancialReport({
          dataPaths, config: await loadDesktopConfig(dataPaths), symbol, period, limit
        });
      }
    },
    {
      name: "get_price_history",
      description: "个股行情历史：区间日线(默认 6 个月，上限 2 年)+摘要(区间涨跌幅/高低/日均成交额/SMA20/60)。最多返回 100 行+总数。",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "股票代码" },
          windowDays: { type: "number", default: 183, description: "回看天数，7-730" }
        },
        required: ["symbol"]
      },
      handler: async ({ symbol, windowDays } = {}) => {
        await ensureContext();
        return await getPriceHistoryReport({
          dataPaths, config: await loadDesktopConfig(dataPaths), symbol, windowDays
        });
      }
    },
    {
      name: "get_earnings_calendar",
      description: "财报日历：未来 N 天(默认 7，上限 30)将发布财报的美股标的清单(按代码无交易所后缀过滤境外)，含 EPS/营收预期与实际(有则带)。最多 100 行+总数。",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", default: 7, description: "展望天数，1-30" }
        }
      },
      handler: async ({ days } = {}) => {
        await ensureContext();
        return await getEarningsCalendarReport({ config: await loadDesktopConfig(dataPaths), days });
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
