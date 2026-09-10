import { toNumber } from "../shared-runtime.mjs";

const ORCHESTRATION_MODES = ["single_task", "agent_pipeline"];
const ORCHESTRATION_PLANNERS = ["passthrough", "role_pipeline", "llm_planner"];
const ROLE_MODEL_SLOTS = ["primary", "planner", "validator", "synthesizer"];

// 历史上被代码写死的封印占位值，从未暴露给用户选择；存储迁移用它识别可安全升级的旧配置
export const LEGACY_SEALED_ORCHESTRATION = Object.freeze({
  mode: "single_task",
  planner: "passthrough",
  maxSteps: 1,
  fanOutEnabled: false
});

export const DEFAULT_AI_ORCHESTRATION = Object.freeze({
  mode: "agent_pipeline",
  planner: "role_pipeline",
  maxSteps: 4,
  fanOutEnabled: true,
  validatorEnabled: true,
  roleModels: Object.freeze({
    primary: "",
    planner: "deepseek-v4-flash",
    validator: "deepseek-v4-flash",
    synthesizer: "deepseek-v4-flash"
  })
});

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function clampMaxSteps(value) {
  const num = toNumber(value);
  if (num === null) return DEFAULT_AI_ORCHESTRATION.maxSteps;
  return Math.max(1, Math.min(6, Math.trunc(num)));
}

function normalizeModelSlot(value, slot) {
  if (String(value === undefined || value === null ? "" : value).trim() === "") {
    // primary 留空表示跟随用户主模型；其余角色留空回退到默认档位
    return slot === "primary" ? "" : DEFAULT_AI_ORCHESTRATION.roleModels[slot];
  }
  return String(value).trim() === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
}

export function isLegacySealedOrchestration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const sealedKeys = Object.keys(LEGACY_SEALED_ORCHESTRATION);
  if (keys.length !== sealedKeys.length) return false;
  return sealedKeys.every((key) => {
    const expected = LEGACY_SEALED_ORCHESTRATION[key];
    const actual = value[key];
    if (key === "maxSteps") return toNumber(actual) === expected;
    return String(actual) === String(expected);
  });
}

export function normalizeOrchestrationConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const roleModelsInput = input.roleModels && typeof input.roleModels === "object" ? input.roleModels : {};
  const roleModels = {};
  for (const slot of ROLE_MODEL_SLOTS) {
    roleModels[slot] = normalizeModelSlot(roleModelsInput[slot], slot);
  }

  return {
    mode: normalizeEnum(input.mode, ORCHESTRATION_MODES, DEFAULT_AI_ORCHESTRATION.mode),
    planner: normalizeEnum(input.planner, ORCHESTRATION_PLANNERS, DEFAULT_AI_ORCHESTRATION.planner),
    maxSteps: clampMaxSteps(input.maxSteps),
    fanOutEnabled:
      input.fanOutEnabled === undefined
        ? DEFAULT_AI_ORCHESTRATION.fanOutEnabled
        : Boolean(input.fanOutEnabled),
    validatorEnabled:
      input.validatorEnabled === undefined
        ? DEFAULT_AI_ORCHESTRATION.validatorEnabled
        : Boolean(input.validatorEnabled),
    roleModels
  };
}

export function resolveRoleModel({ roleModels, slot, fallbackModel }) {
  const mapped = roleModels && typeof roleModels === "object" ? roleModels[slot] : "";
  if (mapped) return mapped;
  return String(fallbackModel || "").trim() || "deepseek-v4-flash";
}
