import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  loadDesktopActionProposals,
  loadDesktopConfig,
  loadDesktopEvents,
  loadDesktopMarketAmvHistory,
  loadDesktopRules,
  readJSON,
  resetTestDataFiles,
  saveDesktopConfig,
  saveDesktopRules
} from "./data-store.mjs";
import { buildTransport, sendEmail, sendNotificationWebhook } from "../engine/notification-domain.mjs";

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
    dryRun: Boolean(value.dryRun),
    ignoreCooldown: Boolean(value.ignoreCooldown)
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
    kind: ensureStringEnum(value.kind, "kind", ["financial", "screener", "rule", "assistant"]),
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

function parseOptionalPlainObject(value) {
  if (value === undefined || value === null) return {};
  return ensurePlainObject(value, "payload", { optional: true, fallback: {} });
}

function assertAgentService(agentService) {
  if (!agentService || typeof agentService.handlePrompt !== "function") {
    throw createIpcError(IPC_ERROR_CODE_INTERNAL, "agentService 未注册");
  }
}

function parseAgentPromptPayload(payload) {
  const value = ensurePlainObject(payload, "payload");
  return {
    prompt: ensureNonEmptyString(value.prompt, "prompt"),
    actor: String(value.actor || ""),
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    source: String(value.source || "assistant")
  };
}

function parseAgentProposalPayload(payload) {
  const value = ensurePlainObject(payload, "payload");
  return {
    proposalId: ensureNonEmptyString(value.proposalId, "proposalId"),
    token: String(value.token || ""),
    actor: String(value.actor || ""),
    source: String(value.source || "assistant")
  };
}

function parseAgentRejectPayload(payload) {
  const value = ensurePlainObject(payload, "payload");
  return {
    proposalId: ensureNonEmptyString(value.proposalId, "proposalId"),
    actor: String(value.actor || ""),
    source: String(value.source || "assistant")
  };
}

export function registerDesktopIpc({
  desktopDir,
  engine,
  afterConfigSave,
  forcedUserDataDir,
  paths,
  log,
  sourceRepoUrl,
  upstreamRepoUrl,
  licenseUrl,
  agentService
}) {
  const usingCustomDataDir = Boolean(forcedUserDataDir);
  function getEngineSchedulerStatus() {
    return typeof engine.getSchedulerStatus === "function" ? engine.getSchedulerStatus() : null;
  }

  let engineRunning = Boolean(getEngineSchedulerStatus()?.isRunning);

  async function buildDiagnosticsResponse() {
    const diagnostics = await readJSON(paths.diagnostics, {});
    return {
      runtimeLog: paths.runtimeLog,
      diagnosticsFile: paths.diagnostics,
      lastRun: diagnostics?.lastRun || null,
      scheduler: diagnostics?.scheduler || getEngineSchedulerStatus() || null,
      feishuBridge: diagnostics?.feishuBridge || null,
      updatedAt: diagnostics?.updatedAt || ""
    };
  }

  registerHandled("paths:get", async () => ({
    ...paths,
    usingCustomDataDir,
    forcedUserDataDir: forcedUserDataDir || ""
  }));

  registerHandled("config:load", async () => loadDesktopConfig(paths));

  registerHandled("config:save", async (_evt, cfg) => {
    await saveDesktopConfig(paths, ensurePlainObject(cfg, "cfg"));
    if (typeof afterConfigSave === "function") {
      await afterConfigSave();
    }
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

  registerHandled("engine:runMarketAmv", async () => engine.runMarketAmv());

  registerHandled("engine:loadMarketAmvHistory", async () => {
    return await loadDesktopMarketAmvHistory(paths);
  });

  registerHandled("events:load", async (_evt, { limit } = {}) => {
    return await loadDesktopEvents(paths, { limit: limit || 50 });
  });

  registerHandled("engine:start", async () => {
    const status = await engine.start();
    engineRunning = Boolean(status?.isRunning ?? getEngineSchedulerStatus()?.isRunning);
    return { ok: true, scheduler: status || getEngineSchedulerStatus() };
  });

  registerHandled("engine:stop", async () => {
    if (!engineRunning) {
      return { ok: true, scheduler: getEngineSchedulerStatus() };
    }
    const status = engine.stop();
    engineRunning = false;
    return { ok: true, scheduler: status || getEngineSchedulerStatus() };
  });

  registerHandled("dev:resetTestData", async () => {
    if (engineRunning) {
      engine.stop();
      engineRunning = false;
    }
    const removedFiles = await resetTestDataFiles(paths);
    return { ok: true, removedFiles, base: paths.base };
  });

  registerHandled("dev:getDiagnostics", async () => {
    return buildDiagnosticsResponse();
  });

  registerHandled("dev:testEmail", async () => {
    const cfg = await loadDesktopConfig(paths);
    const to = String(cfg.defaultEmailTo || "");
    if (!to) {
      throw validationError("默认收件人未配置");
    }
    const transport = buildTransport(cfg.email);
    const fromUser = String(cfg.email?.user || "");
    await sendEmail(transport, {
      fromUser,
      to,
      subject: "OpenStock 测试邮件",
      text: [
        "这是一封来自 OpenStock 桌面端的测试邮件。",
        `时间: ${new Date().toISOString()}`,
        `数据目录: ${paths.base}`,
        "如果你收到了这封邮件，说明当前邮件通知链路至少在主进程侧可达。"
      ].join("\n")
    });
    if (typeof log === "function") log(`测试邮件已发送 -> ${to}`);
    return { ok: true, to };
  });

  registerHandled("dev:testWebhook", async () => {
    const cfg = await loadDesktopConfig(paths);
    const type = String(cfg.defaultWebhookType || "generic");
    const url = String(cfg.defaultWebhookUrl || "");
    if (!url) {
      throw validationError("默认回调地址未配置");
    }
    const result = await sendNotificationWebhook({
      target: { type, url },
      payload: {
        type: "diagnostics_test",
        source: "openstock.desktop",
        sentAt: new Date().toISOString(),
        userDataDir: paths.base
      },
      title: "OpenStock 测试回调",
      lines: [
        "这是一条来自 OpenStock 桌面端的测试回调。",
        `类型: ${type === "feishu" ? "飞书机器人" : "通用 webhook"}`,
        `时间: ${new Date().toISOString()}`,
        `数据目录: ${paths.base}`
      ]
    });
    if (typeof log === "function") log(`测试回调已发送 -> ${url}${type === "feishu" ? `（分片=${result?.partsSent || 1}）` : ""}`);
    return { ok: true, url, type, partsSent: result?.partsSent || 1 };
  });

  registerHandled("dev:reportRendererError", async (_evt, payload) => {
    const value = parseOptionalPlainObject(payload);
    const message = String(value.message || "未知 renderer 错误");
    const stack = String(value.stack || "");
    const kind = String(value.kind || "renderer_error");
    if (typeof log === "function") log(`Renderer ${kind} ${message}${stack ? `\n${stack}` : ""}`, "error");
    return { ok: true };
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

  registerHandled("shell:openPath", async (_evt, targetPath) => {
    const filePath = ensureNonEmptyString(targetPath, "path");
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) {
      throw createIpcError(IPC_ERROR_CODE_INTERNAL, errorMessage);
    }
    return { ok: true };
  });

  registerHandled("shell:saveFile", async (_evt, { defaultName, content } = {}) => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName || "export.txt",
      filters: [
        { name: "CSV Files", extensions: ["csv"] },
        { name: "JSON Files", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await writeFile(result.filePath, String(content ?? ""), "utf-8");
    return { ok: true, filePath: result.filePath };
  });

  registerHandled("shell:readFile", async (_evt, { extensions } = {}) => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "JSON Files", extensions: extensions || ["json"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const fileContent = await readFile(result.filePaths[0], "utf-8");
    return { ok: true, content: fileContent, filePath: result.filePaths[0] };
  });

  registerHandled("agent:handlePrompt", async (_evt, payload) => {
    assertAgentService(agentService);
    return agentService.handlePrompt(parseAgentPromptPayload(payload));
  });

  registerHandled("agent:applyProposal", async (_evt, payload) => {
    assertAgentService(agentService);
    return agentService.applyProposal(parseAgentProposalPayload(payload));
  });

  registerHandled("agent:rejectProposal", async (_evt, payload) => {
    assertAgentService(agentService);
    return agentService.rejectProposal(parseAgentRejectPayload(payload));
  });

  registerHandled("agent:listProposals", async () => loadDesktopActionProposals(paths));
}
