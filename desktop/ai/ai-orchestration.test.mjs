// 智能体编排回归测试（零依赖，node 直接运行）：
// node desktop/ai/ai-orchestration.test.mjs
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_AI_ORCHESTRATION,
  isLegacySealedOrchestration,
  normalizeOrchestrationConfig
} from "./ai-orchestration-config.mjs";
import { createAiOrchestrator } from "./ai-orchestrator.mjs";
import { buildRolePipelinePlan } from "./ai-planner.mjs";
import { runDeterministicIntentChecks } from "./ai-validator.mjs";
import { initializeDesktopStorage, loadDesktopConfig } from "../main/data-store.mjs";

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

function createStubExecutor(handlers) {
  // handlers: { primary: [response, response, ...], validator: [...], ... }
  const calls = [];
  const counters = {};
  const executor = async ({ task }) => {
    const suffix = Object.keys(handlers)
      .sort((a, b) => b.length - a.length)
      .find((key) => String(task.id).endsWith(`:${key}`) || String(task.id).includes(`:${key}`));
    const key = suffix || "primary";
    counters[key] = (counters[key] || 0) + 1;
    calls.push({ id: task.id, key, mode: task.mode, messages: task.messages });
    const queue = handlers[key];
    if (!queue) {
      throw new Error(`桩执行器没有为 ${key} 配置响应（task.id=${task.id}）`);
    }
    const response = queue[Math.min(counters[key] - 1, queue.length - 1)];
    if (response instanceof Error) throw response;
    if (typeof response === "function") return response({ task, callIndex: counters[key] });
    return { text: response, toolCalls: [], raw: { stub: true } };
  };
  return { executor, calls, counters };
}

function validRuleBuilderJson({ includeBadIntent = false, fixedIntent = false } = {}) {
  const goodIntent = {
    target: "ruleDraft",
    mode: "patch",
    reason: "数据支持的规则建议",
    fields: fixedIntent
      ? {
        name: "修正后的规则",
        enabled: true,
        universe: { type: "us_all", maxScan: 500, minMarketCap: 10000 },
        conditions: [{ type: "price_above", value: 10 }],
        symbols: []
      }
      : {
        name: "AI 建议规则",
        enabled: true,
        universe: { type: "us_all", maxScan: 500, minMarketCap: 10000 },
        conditions: [{ type: "market_cap_above", value: 10000 }],
        symbols: []
      }
  };
  const badIntent = {
    target: "ruleDraft",
    mode: "patch",
    reason: "缺少条件",
    fields: { name: "坏规则", conditions: [], symbols: [] }
  };
  return JSON.stringify({
    version: "openstock.desktop.ai.v1",
    taskKind: "rule",
    subject: "测试规则",
    summaryMarkdown: "### 规则意图\n- 测试用",
    verdict: "practical",
    sections: [{ key: "intent", title: "规则意图", bullets: ["可执行"] }],
    suggestedActions: [],
    missingData: [],
    confidence: "high",
    formIntents: includeBadIntent ? [goodIntent, badIntent] : [goodIntent]
  });
}

function buildCfg(orchestrationOverrides = {}) {
  return {
    ai: {
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      orchestration: {
        mode: "agent_pipeline",
        planner: "role_pipeline",
        maxSteps: 4,
        fanOutEnabled: true,
        validatorEnabled: true,
        roleModels: { primary: "", planner: "deepseek-v4-flash", validator: "deepseek-v4-flash", synthesizer: "deepseek-v4-flash" },
        ...orchestrationOverrides
      }
    }
  };
}

const ruleBuilderPayload = {
  name: "测试规则",
  enabled: true,
  universe: { type: "us_all", maxScan: 500 },
  symbols: [],
  conditions: [{ type: "market_cap_above", value: 10000 }]
};

const assistantFanOutPayload = {
  __ai: { prompt: "为什么昨天没有触发通知？" },
  __assistant: {
    attachments: [
      { type: "rules", label: "当前规则", content: { total: 2, rules: [{ name: "r1" }] } },
      { type: "logs", label: "最近日志", content: [{ message: "skip: market closed" }] }
    ]
  }
};

// ---------- 1. 编排配置归一化 ----------
section("编排配置归一化");

{
  const normalized = normalizeOrchestrationConfig(undefined);
  assert(normalized.mode === "agent_pipeline", "无输入时应解封为 agent_pipeline");
  assert(normalized.planner === "role_pipeline", "无输入时 planner 应为 role_pipeline");
  assert(normalized.maxSteps === 4, "无输入时 maxSteps 应为 4");
  assert(normalized.fanOutEnabled === true, "无输入时 fanOutEnabled 应为 true");
  assert(normalized.validatorEnabled === true, "无输入时 validatorEnabled 应为 true");
  assert(normalized.roleModels.validator === "deepseek-v4-flash", "validator 角色模型默认 flash");
}

{
  const normalized = normalizeOrchestrationConfig({ mode: "single_task", planner: "passthrough", maxSteps: 100 });
  assert(normalized.mode === "single_task", "single_task 应被保留");
  assert(normalized.planner === "passthrough", "passthrough 应被保留");
  assert(normalized.maxSteps === 6, "maxSteps=100 应钳位到 6");
}

{
  const normalized = normalizeOrchestrationConfig({ mode: "bogus", planner: "bogus", maxSteps: "abc", fanOutEnabled: 0, validatorEnabled: 0 });
  assert(normalized.mode === DEFAULT_AI_ORCHESTRATION.mode, "非法 mode 回退默认");
  assert(normalized.planner === DEFAULT_AI_ORCHESTRATION.planner, "非法 planner 回退默认");
  assert(normalized.maxSteps === 4, "非法 maxSteps 回退默认");
  assert(normalized.fanOutEnabled === false, "显式 false 应被保留");
  assert(normalized.validatorEnabled === false, "显式 false 应被保留");
}

{
  const sealed = { mode: "single_task", planner: "passthrough", maxSteps: 1, fanOutEnabled: false };
  assert(isLegacySealedOrchestration(sealed), "封印占位值应被识别");
  assert(!isLegacySealedOrchestration({ ...sealed, maxSteps: 2 }), "用户改过的值不应识别为封印");
  assert(!isLegacySealedOrchestration({ ...sealed, validatorEnabled: true }), "带新字段的不是封印占位");
  assert(!isLegacySealedOrchestration(null), "null 不是封印占位");
}

// ---------- 2. single_task 模式行为回归 ----------
section("single_task 模式回归");

{
  const { executor, calls } = createStubExecutor({ primary: [validRuleBuilderJson()] });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg({ mode: "single_task" }), kind: "rule", mode: "builder", payload: ruleBuilderPayload });

  assert(calls.length === 1, `single_task 只应调用一次模型，实际 ${calls.length}`);
  assert(result.structured?.formIntents?.length === 1, "结构化 formIntents 应保留");
  assert(result.orchestration.mode === "single_task", "orchestration.mode 应为 single_task");
  assert(result.orchestration.steps.length === 1, "single_task steps 应只有一步");
  assert(result.orchestration.steps[0].role === "rule_builder", "step 角色应为任务主角色");
  assert(result.orchestration.steps[0].schemaVersion === "openstock.desktop.ai.v1", "step 应带 schemaVersion");
  assert(result.formMapping?.validation === undefined, "single_task 不应触发流水线校验");
  assert(result.formMapping.intents.length === 1, "formMapping 应有一条 intent");
}

// ---------- 3. builder 流水线：主角色 -> 校验器 ----------
section("builder 流水线 primary -> validator");

{
  // maxSteps=2 阻断 refine，专注验证“校验器拒绝 + 确定性拒绝”双重剔除
  const validatorJson = JSON.stringify({
    verdict: "needs_fix",
    rejectedIntents: [{ index: 0, reason: "市值阈值与源数据矛盾" }],
    notes: ["请修正阈值"]
  });
  const { executor, calls } = createStubExecutor({
    primary: [validRuleBuilderJson({ includeBadIntent: true })],
    validator: [validatorJson]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg({ maxSteps: 2 }), kind: "rule", mode: "builder", payload: ruleBuilderPayload });

  assert(calls.length === 2, `应执行 primary + validator 共 2 次，实际 ${calls.length}`);
  assert(result.orchestration.mode === "agent_pipeline", "mode 应为 agent_pipeline");
  assert(result.orchestration.strategy === "role_pipeline", "strategy 应为 role_pipeline");
  const roles = result.orchestration.steps.map((step) => step.role);
  assert(roles.join(",") === "primary,validator", `执行轨迹应为 primary,validator，实际 ${roles.join(",")}`);
  assert(result.orchestration.steps.every((step) => step.status === "ok" && typeof step.durationMs === "number"), "每步轨迹应带状态与耗时");
  // index 0 被校验器拒（阈值矛盾），index 1 被确定性校验拒（conditions 为空），两条都应被剔除
  assert(result.formMapping.intents.length === 0, `两条 intent 都应被剔除，实际剩 ${result.formMapping.intents.length}`);
  assert(result.formMapping.validation?.checked === true, "应生成校验汇总");
  assert(result.formMapping.validation.rejectedCount === 2, `应拒绝 2 条，实际 ${result.formMapping.validation.rejectedCount}`);
  assert(
    result.formMapping.validation.reasons.some((line) => line.includes("确定性校验")),
    "拒绝原因应标记确定性校验来源"
  );
  assert(
    result.formMapping.validation.reasons.some((line) => line.includes("校验器")),
    "拒绝原因应标记校验器来源"
  );
}

{
  // 校验器批准时，确定性校验仍然生效（危险默认值必须被拦截）
  const { executor } = createStubExecutor({
    primary: [validRuleBuilderJson({ includeBadIntent: true })],
    validator: [JSON.stringify({ verdict: "approved", rejectedIntents: [], notes: [] })]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg(), kind: "rule", mode: "builder", payload: ruleBuilderPayload });
  assert(result.formMapping.intents.length === 1, "批准时只有确定性命中的坏 intent 被剔除");
  assert(result.formMapping.validation.verdict === "approved", "校验器裁决应记录为 approved");
}

// ---------- 4. 校验反馈 refine 重试 ----------
section("校验反馈 refine 重试");

{
  const { executor, calls, counters } = createStubExecutor({
    primary: [
      validRuleBuilderJson(),
      validRuleBuilderJson({ fixedIntent: true })
    ],
    validator: [
      JSON.stringify({ verdict: "needs_fix", rejectedIntents: [{ index: 0, reason: "阈值不合理" }], notes: ["请修"] })
    ]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg(), kind: "rule", mode: "builder", payload: ruleBuilderPayload });

  assert((counters.primary || 0) === 2, `primary 应执行两次（含 refine），实际 ${counters.primary}`);
  const refineCall = calls.find((call) => call.id.includes(":refine"));
  assert(Boolean(refineCall), "应存在 refine 轨迹步");
  assert(
    refineCall?.messages?.some((message) => String(message.content || "").includes("未通过校验器")),
    "refine 消息应带校验反馈"
  );
  assert(result.formMapping.intents.length === 1, "refine 后的 intent 应保留");
  assert(result.formMapping.validation.refineUsed === true, "校验汇总应记录 refineUsed");
  const refineStep = result.orchestration.steps.find((step) => step.id.includes(":refine"));
  assert(refineStep?.role === "primary", "refine 轨迹角色应为 primary");
}

// ---------- 5. maxSteps 预算封顶 ----------
section("maxSteps 预算封顶");

{
  const { executor, calls } = createStubExecutor({
    primary: [validRuleBuilderJson()],
    validator: [JSON.stringify({ verdict: "needs_fix", rejectedIntents: [{ index: 0, reason: "x" }], notes: [] })]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  // maxSteps=2 只够 primary + validator，refine 必须被预算挡住
  const result = await runAiTask({ cfg: buildCfg({ maxSteps: 2 }), kind: "rule", mode: "builder", payload: ruleBuilderPayload });
  assert(calls.length === 2, `maxSteps=2 时只应执行 2 次，实际 ${calls.length}`);
  assert(result.formMapping.validation.refineUsed === false, "不应发生 refine");
}

{
  // maxSteps=1 时 validator 直接跳过，但仍执行确定性校验
  const { executor, calls } = createStubExecutor({
    primary: [validRuleBuilderJson({ includeBadIntent: true })],
    validator: [JSON.stringify({ verdict: "approved", rejectedIntents: [], notes: [] })]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg({ maxSteps: 1 }), kind: "rule", mode: "builder", payload: ruleBuilderPayload });
  assert(calls.length === 1, `maxSteps=1 时只应执行 primary，实际 ${calls.length}`);
  const skipped = result.orchestration.steps.find((step) => step.status === "skipped");
  assert(skipped?.role === "validator", "validator 应被标记为 skipped");
  assert(result.formMapping.validation.checked === true, "确定性校验仍然生效");
  assert(result.formMapping.validation.verdict === "deterministic_only", "未跑 LLM 校验器时 verdict 应为 deterministic_only");
  assert(result.formMapping.intents.length === 1, "坏 intent 仍应被确定性剔除");
}

// ---------- 6. assistant 并行扇出 + 综合器 ----------
section("assistant 并行扇出 + 综合器");

{
  const { executor, calls } = createStubExecutor({
    rule_reviewer: ["规则分支结论：规则本身可触发。"],
    diagnostics_advisor: ["诊断分支结论：昨天休市所以跳过。"],
    synthesizer: ["汇总答案：昨天是休市日，调度被跳过，规则没有问题。"]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg(), kind: "assistant", mode: "chat", payload: assistantFanOutPayload });

  const roles = result.orchestration.steps.map((step) => step.role);
  assert(
    roles.join(",") === "rule_reviewer,diagnostics_advisor,synthesizer",
    `扇出计划应为 rule_reviewer,diagnostics_advisor,synthesizer，实际 ${roles.join(",")}`
  );
  assert(result.text === "汇总答案：昨天是休市日，调度被跳过，规则没有问题。", "最终文本应为综合器输出");
  const reviewerCall = calls.find((call) => call.key === "rule_reviewer");
  assert(
    reviewerCall?.messages?.some((message) => String(message.content || "").includes("当前规则")),
    "规则评审员应收到规则附加上下文"
  );
}

{
  // 单分支失败不致命
  const { executor } = createStubExecutor({
    rule_reviewer: [new Error("分支超时")],
    diagnostics_advisor: ["诊断分支结论：昨天休市。"],
    synthesizer: ["汇总答案：休市导致未触发。"]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({ cfg: buildCfg(), kind: "assistant", mode: "chat", payload: assistantFanOutPayload });
  assert(result.text === "汇总答案：休市导致未触发。", "单分支失败后综合器仍应产出最终回答");
  assert(result.orchestration.steps.some((step) => step.status === "failed"), "失败分支应进轨迹");
}

{
  // 无附件的 assistant chat 退回主角色单步
  const { executor, calls } = createStubExecutor({ primary: ["直接回答"] });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({
    cfg: buildCfg(),
    kind: "assistant",
    mode: "chat",
    payload: { __ai: { prompt: "随便聊聊" } }
  });
  assert(calls.length === 1, `无附件时只应执行一次，实际 ${calls.length}`);
  assert(result.orchestration.steps[0].role === "primary", "无附件时应走主角色");
  assert(result.text === "直接回答", "文本应为主角色输出");
}

// ---------- 7. llm_planner ----------
section("llm_planner");

{
  // 非法规划回退内置流水线
  const { executor } = createStubExecutor({
    planner: ["我觉得应该多来几步（非 JSON）"],
    primary: [validRuleBuilderJson()],
    validator: [JSON.stringify({ verdict: "approved", rejectedIntents: [], notes: [] })]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({
    cfg: buildCfg({ planner: "llm_planner" }),
    kind: "rule",
    mode: "builder",
    payload: ruleBuilderPayload
  });
  assert(result.orchestration.strategy === "llm_planner_fallback", "非法规划应回退并记录");
  assert(
    result.orchestration.fallbackReason?.includes("回退"),
    `fallbackReason 应说明回退原因，实际：${result.orchestration.fallbackReason}`
  );
}

{
  // 合法规划被采用
  const planJson = JSON.stringify({
    steps: [
      { role: "primary", purpose: "生成草案" },
      { role: "validator", purpose: "复核" }
    ]
  });
  const { executor } = createStubExecutor({
    planner: [planJson],
    primary: [validRuleBuilderJson()],
    validator: [JSON.stringify({ verdict: "approved", rejectedIntents: [], notes: [] })]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({
    cfg: buildCfg({ planner: "llm_planner" }),
    kind: "rule",
    mode: "builder",
    payload: ruleBuilderPayload
  });
  assert(result.orchestration.strategy === "llm_planner", "合法规划应被采用");
  assert(result.formMapping.intents.length === 1, "规划流水线结果应正常落地");
}

// ---------- 8. 确定性校验直查 ----------
section("确定性校验直查");

{
  const structured = {
    formIntents: [
      { target: "ruleDraft", fields: { conditions: [], symbols: [] } },
      { target: "ruleDraft", fields: { conditions: [{ type: "price_above", value: 5 }], universe: { type: "manual" }, symbols: [] } },
      { target: "ruleDraft", fields: { conditions: [{ type: "price_above", value: 5 }], universe: { type: "manual" }, symbols: ["AAPL"] } },
      { target: "scheduleDraft", fields: { mode: "interval", intervalSec: 5 } },
      { target: "screenerPreset", fields: { universe: "us_all", maxScan: 999999 } }
    ]
  };
  const findings = runDeterministicIntentChecks(structured);
  const indexes = findings.map((item) => item.index);
  assert(indexes.join(",") === "0,1,3,4", `应命中 0/1/3/4，实际 ${indexes.join(",")}`);
}

// ---------- 9. role_pipeline 计划生成 ----------
section("role_pipeline 计划生成");

{
  const plan = buildRolePipelinePlan({
    task: { kind: "assistant", mode: "chat", payload: assistantFanOutPayload, id: "t" },
    orchestration: { maxSteps: 4, fanOutEnabled: true, validatorEnabled: true }
  });
  assert(plan.steps.map((step) => step.role).join(",") === "rule_reviewer,diagnostics_advisor,synthesizer", "assistant 双附件应扇出");

  const builderPlan = buildRolePipelinePlan({
    task: { kind: "rule", mode: "builder", mappingTargets: ["ruleDraft"], payload: {}, id: "t" },
    orchestration: { maxSteps: 4, fanOutEnabled: true, validatorEnabled: true }
  });
  assert(builderPlan.steps.length === 2, "builder 应为主角色+校验器两步");
  assert(builderPlan.steps[1].allowRefine === true, "预算充足时校验步应允许 refine");

  const noValidatorPlan = buildRolePipelinePlan({
    task: { kind: "rule", mode: "builder", mappingTargets: ["ruleDraft"], payload: {}, id: "t" },
    orchestration: { maxSteps: 4, fanOutEnabled: true, validatorEnabled: false }
  });
  assert(noValidatorPlan.steps.length === 1 && noValidatorPlan.steps[0].role === "primary", "关闭校验器后应只剩主角色");
}

// ---------- 10. builder 垃圾输出：refine 后仍失败则抛错（与单任务一致的严格性） ----------
section("垃圾 JSON 的严格失败");

{
  const { executor } = createStubExecutor({
    primary: ["这不是 JSON", "这也不是 JSON"],
    validator: [JSON.stringify({ verdict: "approved", rejectedIntents: [], notes: [] })]
  });
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  let threw = null;
  try {
    await runAiTask({ cfg: buildCfg(), kind: "rule", mode: "builder", payload: ruleBuilderPayload });
  } catch (error) {
    threw = error;
  }
  assert(threw !== null, "主角色两次都无法产出 JSON 时应抛错");
  assert(String(threw?.message || "").includes("结构化生成失败"), "错误信息应与单任务模式一致");
}

// ---------- 11. 存储迁移 v1 -> v2 ----------
section("存储迁移 v1 -> v2");

async function prepareTempStorage(configObject) {
  const base = await mkdtemp(path.join(tmpdir(), "openstock-ai-test-"));
  const paths = {
    base,
    storageMeta: path.join(base, "storage-meta.json"),
    config: path.join(base, "config.json"),
    rules: path.join(base, "rules.json"),
    state: path.join(base, "state.json"),
    actionProposals: path.join(base, "action-proposals.json")
  };
  await writeFile(paths.config, JSON.stringify(configObject), "utf-8");
  await writeFile(
    paths.storageMeta,
    JSON.stringify({ schemaVersion: 1, documents: { config: { version: 1, updatedAt: "2026-01-01T00:00:00.000Z" } } }),
    "utf-8"
  );
  return paths;
}

{
  const sealedConfig = {
    dataProvider: "fmp",
    ai: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      thinkingEnabled: false,
      reasoningEffort: "high",
      orchestration: { mode: "single_task", planner: "passthrough", maxSteps: 1, fanOutEnabled: false },
      structuredOutput: { enabled: true, responseMode: "json_markdown", fallbackToText: true, schemaVersion: "openstock.desktop.ai.v1" }
    }
  };
  const paths = await prepareTempStorage(sealedConfig);
  await initializeDesktopStorage(paths);
  const migrated = await loadDesktopConfig(paths);
  assert(migrated.ai.orchestration.mode === "agent_pipeline", "封印占位值应被迁移为 agent_pipeline");
  assert(migrated.ai.orchestration.validatorEnabled === true, "迁移应补齐 validatorEnabled");
  assert(migrated.ai.orchestration.roleModels?.validator === "deepseek-v4-flash", "迁移应补齐 roleModels");
  assert(migrated.ai.apiKey === "sk-test", "用户其余 AI 配置不应被改动");
}

{
  // 用户痕迹保留：改过的 orchestration 不应被迁移覆盖
  const userTouchedConfig = {
    dataProvider: "fmp",
    ai: {
      provider: "deepseek",
      apiKey: "sk-test",
      orchestration: { mode: "single_task", planner: "role_pipeline", maxSteps: 2, fanOutEnabled: false }
    }
  };
  const paths = await prepareTempStorage(userTouchedConfig);
  await initializeDesktopStorage(paths);
  const migrated = await loadDesktopConfig(paths);
  assert(migrated.ai.orchestration.mode === "single_task", "用户选择的 single_task 应保留");
  assert(migrated.ai.orchestration.maxSteps === 2, "用户设置的 maxSteps 应保留");
  assert(migrated.ai.orchestration.roleModels?.synthesizer === "deepseek-v4-flash", "新字段缺失时按默认补齐");
}

// ---------- 12. 智能体工具调用循环 ----------
section("智能体工具调用循环");

{
  const seen = [];
  const responses = [
    { text: "", toolCalls: [{ id: "call-1", name: "list_rules", arguments: {} }] },
    { text: "根据工具返回：当前共有 2 条规则，其中 1 条启用。" }
  ];
  let callCount = 0;
  const executor = async ({ task, tools }) => {
    callCount += 1;
    seen.push({
      toolCount: Array.isArray(tools) ? tools.length : 0,
      lastMessageRole: task.messages[task.messages.length - 1]?.role,
      hasToolCallId: task.messages.some((message) => message.role === "tool" && message.tool_call_id === "call-1")
    });
    return responses[Math.min(callCount - 1, responses.length - 1)];
  };
  const executedTools = [];
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({
    cfg: buildCfg(),
    kind: "assistant",
    mode: "chat",
    payload: { __ai: { prompt: "我现在有哪些规则？" } },
    tools: [{ type: "function", function: { name: "list_rules", description: "读取规则", parameters: {} } }],
    executeToolCall: async (call) => {
      executedTools.push(call);
      return { ok: true, tool: call.name, result: { total: 2 } };
    }
  });

  assert(callCount === 2, `工具循环应产生两轮调用，实际 ${callCount}`);
  assert(executedTools.length === 1 && executedTools[0].name === "list_rules", "工具应被执行一次");
  assert(seen[0].toolCount === 1 && seen[1].toolCount === 1, "两轮调用都应携带 tools");
  assert(seen[1].hasToolCallId, "第二轮消息应包含工具结果回填");
  assert(result.text === "根据工具返回：当前共有 2 条规则，其中 1 条启用。", "最终文本应为工具链路后的回答");
}

{
  // builder 任务不启用工具，避免 json_object 与 tools 冲突
  let toolsArgSeen = "unset";
  const executor = async ({ tools }) => {
    toolsArgSeen = tools === undefined || tools === null ? "none" : "present";
    return { text: validRuleBuilderJson(), toolCalls: [] };
  };
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  await runAiTask({
    cfg: buildCfg(),
    kind: "rule",
    mode: "builder",
    payload: ruleBuilderPayload,
    tools: [{ type: "function", function: { name: "list_rules", description: "x", parameters: {} } }],
    executeToolCall: async () => ({ ok: true })
  });
  assert(toolsArgSeen === "none", `builder 任务不应携带 tools，实际 ${toolsArgSeen}`);
}

{
  // 未知工具名：错误对象回填给模型，循环继续
  const responses = [
    { text: "", toolCalls: [{ id: "call-x", name: "not_a_tool", arguments: {} }] },
    { text: "该工具不存在，基于通用知识回答。" }
  ];
  let callCount = 0;
  const executor = async () => {
    callCount += 1;
    return responses[Math.min(callCount - 1, responses.length - 1)];
  };
  const toolResults = [];
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({
    cfg: buildCfg(),
    kind: "assistant",
    mode: "chat",
    payload: { __ai: { prompt: "帮我查一下" } },
    tools: [{ type: "function", function: { name: "not_a_tool", description: "x", parameters: {} } }],
    executeToolCall: async (call) => {
      const outcome = { error: `未知工具：${call.name}` };
      toolResults.push(outcome);
      return outcome;
    }
  });
  assert(callCount === 2, "未知工具后应继续第二轮调用");
  assert(toolResults.length === 1 && String(toolResults[0].error).includes("未知工具"), "未知工具应返回错误对象");
  assert(result.text === "该工具不存在，基于通用知识回答。", "最终文本应正常返回");
}

{
  // 轮次封顶：最后一轮去掉 tools 强制产出文本
  const seen = [];
  let callCount = 0;
  const executor = async ({ tools }) => {
    callCount += 1;
    seen.push(Array.isArray(tools) ? tools.length : 0);
    if (callCount <= 4) {
      return { text: "", toolCalls: [{ id: `call-${callCount}`, name: "list_rules", arguments: {} }] };
    }
    return { text: "已达轮次上限，直接给出回答。" };
  };
  const { runAiTask } = createAiOrchestrator({ executors: { deepseek: executor } });
  const result = await runAiTask({
    cfg: buildCfg(),
    kind: "assistant",
    mode: "chat",
    payload: { __ai: { prompt: "持续要工具" } },
    tools: [{ type: "function", function: { name: "list_rules", description: "x", parameters: {} } }],
    executeToolCall: async () => ({ ok: true })
  });
  assert(callCount === 5, `工具轮次应封顶在 4 轮共 5 次调用，实际 ${callCount}`);
  assert(seen[4] === 0, "最后一轮调用不应携带 tools");
  assert(result.text === "已达轮次上限，直接给出回答。", "封顶后应返回最终文本");
}

console.log(`\n通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
  process.exitCode = 1;
}
