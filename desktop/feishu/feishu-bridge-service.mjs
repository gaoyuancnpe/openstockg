function parseTextContent(rawContent) {
  if (!rawContent) return "";
  if (typeof rawContent === "string") {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed.text === "string") return parsed.text.trim();
    } catch {
      return rawContent.trim();
    }
    return rawContent.trim();
  }
  if (typeof rawContent === "object" && typeof rawContent.text === "string") {
    return rawContent.text.trim();
  }
  return "";
}

function parseInboundMessage(data) {
  const message = data?.message && typeof data.message === "object" ? data.message : {};
  const sender = data?.sender && typeof data.sender === "object" ? data.sender : {};
  const senderId = sender.sender_id && typeof sender.sender_id === "object" ? sender.sender_id : {};
  return {
    messageId: String(message.message_id || ""),
    chatId: String(message.chat_id || ""),
    chatType: String(message.chat_type || ""),
    messageType: String(message.message_type || ""),
    text: parseTextContent(message.content),
    openId: String(senderId.open_id || sender.open_id || ""),
    userId: String(senderId.user_id || sender.user_id || ""),
    unionId: String(senderId.union_id || sender.union_id || ""),
    senderType: String(sender.sender_type || "user"),
    senderName: String(sender.sender_name || "")
  };
}

function parseCommand(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return { type: "empty" };
  const applyMatch = normalized.match(/^\/apply\s+([a-z0-9-]+)\s+([a-z0-9]+)$/i);
  if (applyMatch) {
    return {
      type: "apply",
      proposalId: applyMatch[1],
      token: applyMatch[2]
    };
  }
  const rejectMatch = normalized.match(/^\/reject\s+([a-z0-9-]+)$/i);
  if (rejectMatch) {
    return {
      type: "reject",
      proposalId: rejectMatch[1]
    };
  }
  return {
    type: "prompt",
    prompt: normalized
  };
}

function buildStatusPatch(patch = {}) {
  return {
    type: "feishu_bridge_status",
    channel: "feishu",
    isEnabled: false,
    isRunning: false,
    allowRemoteApply: false,
    requireAllowlist: false,
    allowedUsersCount: 0,
    lastConnectedAt: "",
    lastError: "",
    updatedAt: new Date().toISOString(),
    ...patch
  };
}

export function createFeishuBridgeService({
  loadConfig,
  agentService,
  log,
  emitEvent
}) {
  let sdkModule = null;
  let apiClient = null;
  let wsClient = null;
  let status = buildStatusPatch();

  function writeLog(line) {
    if (typeof log === "function") log(String(line || ""));
  }

  function publishStatus(patch = {}) {
    status = buildStatusPatch({
      ...status,
      ...patch
    });
    if (typeof emitEvent === "function") emitEvent(status);
    return { ...status };
  }

  async function ensureSdk() {
    if (sdkModule) return sdkModule;
    sdkModule = await import("@larksuiteoapi/node-sdk");
    return sdkModule;
  }

  async function sendTextMessage(chatId, text) {
    if (!apiClient || !chatId || !text) return;
    await apiClient.im.v1.message.create({
      params: {
        receive_id_type: "chat_id"
      },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({
          text: String(text || "")
        })
      }
    });
  }

  async function handleInboundPrompt(message, feishuCfg) {
    const actor = {
      channel: "feishu",
      userId: message.openId || message.userId,
      userName: message.senderName
    };
    const command = parseCommand(message.text);
    if (command.type === "empty") return;

    if (feishuCfg.requireAllowlist) {
      const allowSet = new Set(Array.isArray(feishuCfg.allowUserOpenIds) ? feishuCfg.allowUserOpenIds : []);
      if (!allowSet.has(actor.userId)) {
        await sendTextMessage(message.chatId, "当前账号不在飞书桥接 allowlist 中，已拒绝处理。");
        writeLog(`Feishu message ignored：${actor.userId || "-"} 不在 allowlist`);
        return;
      }
    }

    if (command.type === "apply") {
      const result = await agentService.applyProposal({
        proposalId: command.proposalId,
        token: command.token,
        actor,
        source: "feishu"
      });
      await sendTextMessage(message.chatId, result.message || (result.ok ? "已应用。" : "应用失败。"));
      return;
    }

    if (command.type === "reject") {
      const result = await agentService.rejectProposal({
        proposalId: command.proposalId,
        actor,
        source: "feishu"
      });
      await sendTextMessage(message.chatId, result.message || (result.ok ? "已拒绝。" : "拒绝失败。"));
      return;
    }

    const result = await agentService.handlePrompt({
      prompt: command.prompt,
      actor,
      source: "feishu"
    });
    await sendTextMessage(message.chatId, result.text || "未返回内容。");
  }

  async function reconnect() {
    const cfg = await loadConfig();
    const feishuCfg = cfg?.feishu && typeof cfg.feishu === "object" ? cfg.feishu : {};
    const enabled = Boolean(feishuCfg.enabled);
    const appId = String(feishuCfg.appId || "");
    const appSecret = String(feishuCfg.appSecret || "");
    const allowedUsersCount = Array.isArray(feishuCfg.allowUserOpenIds) ? feishuCfg.allowUserOpenIds.length : 0;

    if (wsClient && typeof wsClient.stop === "function") {
      try {
        wsClient.stop();
      } catch {}
    }
    wsClient = null;
    apiClient = null;

    if (!enabled) {
      publishStatus({
        isEnabled: false,
        isRunning: false,
        allowRemoteApply: Boolean(feishuCfg.allowRemoteApply),
        requireAllowlist: Boolean(feishuCfg.requireAllowlist),
        allowedUsersCount,
        lastError: ""
      });
      return status;
    }

    if (!appId || !appSecret) {
      publishStatus({
        isEnabled: true,
        isRunning: false,
        allowRemoteApply: Boolean(feishuCfg.allowRemoteApply),
        requireAllowlist: Boolean(feishuCfg.requireAllowlist),
        allowedUsersCount,
        lastError: "飞书桥接已启用，但缺少 App ID 或 App Secret"
      });
      return status;
    }

    try {
      const Lark = await ensureSdk();
      const baseConfig = {
        appId,
        appSecret
      };
      apiClient = new Lark.Client(baseConfig);
      wsClient = new Lark.WSClient(baseConfig);
      wsClient.start({
        eventDispatcher: new Lark.EventDispatcher({}).register({
          "im.message.receive_v1": async (data) => {
            const message = parseInboundMessage(data);
            if (message.senderType !== "user") return;
            if (message.messageType && message.messageType !== "text") {
              await sendTextMessage(message.chatId, "当前只支持文本消息。请直接发送文字需求，或使用 /apply /reject 指令。");
              return;
            }
            try {
              await handleInboundPrompt(message, feishuCfg);
            } catch (error) {
              const errText = error instanceof Error ? error.message : String(error);
              writeLog(`Feishu bridge error：${errText}`);
              await sendTextMessage(message.chatId, `处理失败：${errText}`);
            }
          }
        })
      });
      writeLog("Feishu bridge started");
      publishStatus({
        isEnabled: true,
        isRunning: true,
        allowRemoteApply: Boolean(feishuCfg.allowRemoteApply),
        requireAllowlist: Boolean(feishuCfg.requireAllowlist),
        allowedUsersCount,
        lastConnectedAt: new Date().toISOString(),
        lastError: ""
      });
      return status;
    } catch (error) {
      const errText = error instanceof Error ? error.message : String(error);
      writeLog(`Feishu bridge failed：${errText}`);
      publishStatus({
        isEnabled: true,
        isRunning: false,
        allowRemoteApply: Boolean(feishuCfg.allowRemoteApply),
        requireAllowlist: Boolean(feishuCfg.requireAllowlist),
        allowedUsersCount,
        lastError: errText
      });
      return status;
    }
  }

  function stop() {
    if (wsClient && typeof wsClient.stop === "function") {
      try {
        wsClient.stop();
      } catch {}
    }
    wsClient = null;
    apiClient = null;
    publishStatus({
      isRunning: false
    });
    return status;
  }

  return {
    getStatus: () => ({ ...status }),
    reconnect,
    stop
  };
}
