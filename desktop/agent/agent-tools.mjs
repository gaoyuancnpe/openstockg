import {
  loadDesktopConfig,
  loadDesktopEvents,
  loadDesktopRules,
  readJSON
} from "../main/data-store.mjs";

const SENSITIVE_FIELD_PATTERN = /(apikey|secret|password|token|appsecret)/i;
const MAX_EVENTS = 100;
const MAX_RULES = 20;

export function maskSensitive(value) {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SENSITIVE_FIELD_PATTERN.test(key) && typeof inner === "string" && inner) {
      next[key] = `${inner.slice(0, 3)}***`;
    } else {
      next[key] = maskSensitive(inner);
    }
  }
  return next;
}

export function buildRuleSnapshot(rule) {
  return {
    name: String(rule?.name || ""),
    enabled: Boolean(rule?.enabled),
    universe: rule?.universe || null,
    symbols: Array.isArray(rule?.symbols) ? rule.symbols.slice(0, 50) : [],
    cooldownSec: rule?.cooldownSec ?? null,
    groupOp: String(rule?.groupOp || "and"),
    conditions: Array.isArray(rule?.conditions) ? rule.conditions.slice(0, 20) : [],
    notify: rule?.notify ? maskSensitive(rule.notify) : null
  };
}

function clampIntArg(value, fallback, min, max) {
  const num = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

// 主进程可服务的只读上下文工具：基于本地数据文件实现，输出统一脱敏并截断
export function createAgentTools({ dataPaths }) {
  const tools = [
    {
      name: "list_rules",
      description: "读取当前桌面端已配置的全部提醒规则（含启用状态、触发条件、universe 与通知方式，最多返回前 20 条）。",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const rules = await loadDesktopRules(dataPaths);
        return {
          total: rules.length,
          enabledCount: rules.filter((rule) => rule?.enabled).length,
          rules: rules.slice(0, MAX_RULES).map(buildRuleSnapshot)
        };
      }
    },
    {
      name: "get_config_summary",
      description: "读取当前配置摘要：数据源、调度设置、通知配置与 AI 设置。密钥类字段已脱敏。",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const cfg = await loadDesktopConfig(dataPaths);
        return maskSensitive({
          dataProvider: cfg.dataProvider,
          scheduler: cfg.scheduler,
          pollIntervalSec: cfg.pollIntervalSec,
          defaultEmailTo: cfg.defaultEmailTo,
          defaultWebhookType: cfg.defaultWebhookType,
          feishu: cfg.feishu,
          ai: {
            model: cfg.ai?.model,
            thinkingEnabled: cfg.ai?.thinkingEnabled,
            orchestration: cfg.ai?.orchestration
          }
        });
      }
    },
    {
      name: "get_scheduler_status",
      description: "读取调度器最近状态（是否运行中、模式、上次运行时间、跳过原因）。",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const diagnostics = await readJSON(dataPaths.diagnostics, {});
        return diagnostics?.scheduler || null;
      }
    },
    {
      name: "get_last_run",
      description: "读取最近一次规则运行的完整结果（各规则命中、跳过原因、通知发送情况）。",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const diagnostics = await readJSON(dataPaths.diagnostics, {});
        return diagnostics?.lastRun || null;
      }
    },
    {
      name: "get_recent_events",
      description: "读取最近的应用事件流（提醒触发、调度状态、agent proposal 等）。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回条数，默认 20，最大 100" }
        }
      },
      handler: async (args = {}) => {
        const limit = clampIntArg(args.limit, 20, 1, MAX_EVENTS);
        const events = await loadDesktopEvents(dataPaths, { limit });
        return { count: events.length, events };
      }
    },
    {
      name: "get_diagnostics",
      description: "读取诊断文件全量内容（最近运行 + 调度器 + 飞书桥接状态）。",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const diagnostics = await readJSON(dataPaths.diagnostics, {});
        return {
          lastRun: diagnostics?.lastRun || null,
          scheduler: diagnostics?.scheduler || null,
          feishuBridge: diagnostics?.feishuBridge || null,
          updatedAt: diagnostics?.updatedAt || ""
        };
      }
    }
  ];

  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    names: tools.map((tool) => tool.name),
    schemas: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    })),
    async executeCall(call) {
      const tool = toolMap.get(String(call?.name || ""));
      if (!tool) {
        return { error: `未知工具：${call?.name || "-"}` };
      }
      try {
        const result = await tool.handler(call?.arguments || {});
        return { ok: true, tool: tool.name, result };
      } catch (error) {
        return { error: `工具 ${tool.name} 执行失败：${error instanceof Error ? error.message : String(error)}` };
      }
    }
  };
}
