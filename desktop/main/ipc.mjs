import path from "node:path";
import { readFile } from "node:fs/promises";
import { ipcMain, shell } from "electron";
import {
  loadDesktopConfig,
  loadDesktopRules,
  resetTestDataFiles,
  saveDesktopConfig,
  saveDesktopRules
} from "./data-store.mjs";

const IPC_ERROR_NAME = "DesktopIpcError";
const IPC_ERROR_CODE_VALIDATION = "IPC_VALIDATION";
const IPC_ERROR_CODE_INTERNAL = "IPC_INTERNAL";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createIpcError(code, message, details = null) {
  const error = new Error(message);
  error.name = IPC_ERROR_NAME;
  error.code = String(code || IPC_ERROR_CODE_INTERNAL);
  if (details !== null && details !== undefined) {
    error.details = details;
  }
  return error;
}

function validationError(message, details = null) {
  return createIpcError(IPC_ERROR_CODE_VALIDATION, message, details);
}

function assertIpc(condition, message, details = null) {
  if (!condition) {
    throw validationError(message, details);
  }
}

function ensurePlainObject(value, fieldName, { optional = false, fallback = null } = {}) {
  if (value === undefined || value === null) {
    if (optional) return fallback;
    throw validationError(`${fieldName} 必须为对象`, { field: fieldName });
  }
  if (!isPlainObject(value)) {
    throw validationError(`${fieldName} 必须为对象`, { field: fieldName, receivedType: typeof value });
  }
  return value;
}

function ensureArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw validationError(`${fieldName} 必须为数组`, { field: fieldName, receivedType: typeof value });
  }
  return value;
}

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw validationError(`${fieldName} 必须为非空字符串`, { field: fieldName });
  }
  return value.trim();
}

function ensureStringEnum(value, fieldName, allowedValues, defaultValue = undefined) {
  const normalized = value === undefined || value === null ? defaultValue : String(value).trim();
  assertIpc(typeof normalized === "string" && normalized.length > 0, `${fieldName} 缺失`, { field: fieldName });
  assertIpc(allowedValues.includes(normalized), `${fieldName} 仅支持 ${allowedValues.join("/")}`, {
    field: fieldName,
    allowedValues
  });
  return normalized;
}

function normalizeSymbols(value) {
  if (value === undefined || value === null) return [];
  return ensureArray(value, "symbols")
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean);
}

function normalizeIpcError(error) {
  if (error && error.name === IPC_ERROR_NAME) {
    return {
      code: String(error.code || IPC_ERROR_CODE_INTERNAL),
      message: error.message || "IPC 调用失败",
      details: error.details ?? null
    };
  }

  if (error instanceof Error) {
    return {
      code: typeof error.code === "string" && error.code ? error.code : IPC_ERROR_CODE_INTERNAL,
      message: error.message || "IPC 调用失败",
      details: null
    };
  }

  return {
    code: IPC_ERROR_CODE_INTERNAL,
    message: String(error || "IPC 调用失败"),
    details: null
  };
}

function ok(data) {
  return {
    ok: true,
    data,
    error: null
  };
}

function fail(error) {
  return {
    ok: false,
    data: null,
    error: normalizeIpcError(error)
  };
}

function registerHandled(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return ok(await handler(event, ...args));
    } catch (error) {
      return fail(error);
    }
  });
}

function parseRunOncePayload(payload) {
  const value = ensurePlainObject(payload, "payload", { optional: true, fallback: {} });
  return {
    dryRun: Boolean(value.dryRun)
  };
}

function parseScreenerPayload(payload) {
  const value = ensurePlainObject(payload, "payload", { optional: true, fallback: {} });
  const criteria = ensurePlainObject(value.criteria, "criteria", { optional: true, fallback: {} });
  const universe = String(criteria.universe || "manual").toLowerCase();
  assertIpc(["manual", "us_all"].includes(universe), "criteria.universe 仅支持 manual 或 us_all", {
    field: "criteria.universe"
  });
  return {
    symbols: normalizeSymbols(value.symbols),
    criteria: {
      ...criteria,
      universe
    }
  };
}

function parseFinancialExplainPayload(payload) {
  const value = ensurePlainObject(payload, "payload");
  return {
    row: ensurePlainObject(value.row, "row")
  };
}

function parseAiExplainPayload(payload) {
  const value = ensurePlainObject(payload, "payload");
  return {
    kind: ensureStringEnum(value.kind, "kind", ["financial", "screener", "rule"]),
    mode: ensureStringEnum(value.mode, "mode", ["chat", "builder"], "chat"),
    payload: ensurePlainObject(value.payload, "payload.payload")
  };
}

function parseExternalUrl(value) {
  const raw = ensureNonEmptyString(value, "url");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw validationError("url 不是合法 URL", { field: "url" });
  }
  const protocol = parsed.protocol.toLowerCase();
  assertIpc(["http:", "https:", "mailto:"].includes(protocol), "url 协议仅支持 http/https/mailto", {
    field: "url",
    protocol
  });
  return parsed.toString();
}

export function registerDesktopIpc({
  desktopDir,
  engine,
  forcedUserDataDir,
  paths,
  sourceRepoUrl,
  upstreamRepoUrl,
  licenseUrl
}) {
  const usingCustomDataDir = Boolean(forcedUserDataDir);
  let engineRunning = false;

  registerHandled("paths:get", async () => ({
    ...paths,
    usingCustomDataDir,
    forcedUserDataDir: forcedUserDataDir || ""
  }));

  registerHandled("config:load", async () => loadDesktopConfig(paths));

  registerHandled("config:save", async (_evt, cfg) => {
    await saveDesktopConfig(paths, ensurePlainObject(cfg, "cfg"));
    return { ok: true };
  });

  registerHandled("rules:load", async () => loadDesktopRules(paths));

  registerHandled("rules:save", async (_evt, rules) => {
    await saveDesktopRules(paths, ensureArray(rules, "rules"));
    return { ok: true };
  });

  registerHandled("engine:runOnce", async (_evt, payload) => {
    await engine.runOnce(parseRunOncePayload(payload));
    return { ok: true };
  });

  registerHandled("engine:screener", async (_evt, payload) => engine.runScreener(parseScreenerPayload(payload)));

  registerHandled("engine:financialScreener", async (_evt, payload) => (
    engine.runFinancialScreener(parseScreenerPayload(payload))
  ));

  registerHandled("engine:financialExplain", async (_evt, payload) => (
    engine.explainFinancialRow(parseFinancialExplainPayload(payload))
  ));

  registerHandled("engine:aiExplain", async (_evt, payload) => engine.explainAiTarget(parseAiExplainPayload(payload)));

  registerHandled("engine:start", async () => {
    if (engineRunning) return { ok: true };
    engine.start();
    engineRunning = true;
    return { ok: true };
  });

  registerHandled("engine:stop", async () => {
    if (!engineRunning) return { ok: true };
    engine.stop();
    engineRunning = false;
    return { ok: true };
  });

  registerHandled("dev:resetTestData", async () => {
    if (engineRunning) {
      engine.stop();
      engineRunning = false;
    }
    const removedFiles = await resetTestDataFiles(paths);
    console.log(`[desktop] reset test data in ${paths.base}`);
    return { ok: true, removedFiles, base: paths.base };
  });

  registerHandled("legal:get", async () => {
    const legalNoticePath = path.join(desktopDir, "LEGAL_NOTICE.md");
    const noticeText = await readFile(legalNoticePath, "utf-8").catch(() => "");
    return {
      sourceRepoUrl,
      upstreamRepoUrl,
      licenseUrl,
      noticeText
    };
  });

  registerHandled("shell:openExternal", async (_evt, url) => {
    await shell.openExternal(parseExternalUrl(url));
    return { ok: true };
  });
}
