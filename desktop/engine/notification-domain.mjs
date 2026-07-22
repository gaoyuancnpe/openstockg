import nodemailer from "nodemailer";
import { formatAdoptedFieldDetails } from "./rule-domain.mjs";

function formatMetricValue(value, { digits = 1, suffix = "" } = {}) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const display = Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.?0+$/, "");
    return `${display}${suffix}`;
  }
  return `${String(value)}${suffix}`;
}

function buildKeyMetrics(ctx) {
  if (!ctx || typeof ctx !== "object") return [];
  const metrics = [];
  const pushMetric = (label, value, options) => {
    const display = formatMetricValue(value, options);
    if (display !== null) metrics.push(`${label}=${display}`);
  };
  pushMetric("价格", ctx.price, { digits: 2 });
  pushMetric("单日涨幅", ctx.closeChangePercent1d ?? ctx.changePercent, { digits: 1, suffix: "%" });
  pushMetric("成交额", ctx.turnoverM, { digits: 0, suffix: "M" });
  pushMetric("收盘市值", ctx.marketCap, { digits: 0, suffix: "M" });
  pushMetric("250日收盘新高", ctx.closeAth250d, { digits: 0 });
  pushMetric("财报窗口", ctx.earningsWithin1TradingDay, { digits: 0 });
  pushMetric("营收同比", ctx.revenueGrowthYoY, { digits: 1, suffix: "%" });
  pushMetric("营收增速较上季度变化", ctx.revenueGrowthYoYDeltaVsPrevQuarter, { digits: 1, suffix: "pct" });
  pushMetric("毛利率", ctx.grossMargin, { digits: 1, suffix: "%" });
  pushMetric("毛利率同比变化", ctx.grossMarginYoYDelta, { digits: 1, suffix: "pct" });
  pushMetric("毛利率环比变化", ctx.grossMarginQoQDelta, { digits: 1, suffix: "pct" });
  pushMetric("EBITDA", ctx.ebitdaM ?? ctx.ebitda, { digits: ctx.ebitdaM !== null && ctx.ebitdaM !== undefined ? 0 : 1, suffix: ctx.ebitdaM !== null && ctx.ebitdaM !== undefined ? "M" : "" });
  pushMetric("EBITDA同比", ctx.ebitdaGrowthYoY, { digits: 1, suffix: "%" });
  pushMetric("营业利润同比", ctx.operatingIncomeGrowthYoY, { digits: 1, suffix: "%" });
  pushMetric("GAAP净利润同比", ctx.netIncomeGrowthYoY, { digits: 1, suffix: "%" });
  return metrics;
}

function buildSummaryStats(runSummary, fallbackCount) {
  if (!runSummary || typeof runSummary !== "object") return [];
  const stats = [];
  const pushStat = (label, value) => {
    if (value === null || value === undefined) return;
    stats.push(`${label}=${value}`);
  };
  pushStat("扫描", runSummary.scannedCount);
  pushStat("命中", runSummary.matchedCount);
  pushStat("实际触发", runSummary.firedCount);
  pushStat("冷却跳过", runSummary.cooldownSkippedCount);
  pushStat("缺字段", runSummary.missingFieldCount);
  pushStat("代理命中", runSummary.proxyHitCount);
  pushStat("回退口径命中", runSummary.fallbackHitCount ?? fallbackCount);
  return stats;
}

function splitTextLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

const FEISHU_MAX_CHARS_PER_MESSAGE = 2400;
const FEISHU_PART_DELAY_MS = 1200;
const FEISHU_RATE_LIMIT_RETRY_MAX = 3;
const FEISHU_RATE_LIMIT_RETRY_BASE_DELAY_MS = 2500;

function splitLongLine(line, maxChars) {
  const text = String(line || "");
  if (!text) return [""];
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function splitLinesIntoChunks(lines, maxChars = FEISHU_MAX_CHARS_PER_MESSAGE) {
  const normalizedLines = Array.isArray(lines) ? lines.filter((line) => String(line || "").length > 0) : [];
  if (normalizedLines.length === 0) return [[]];

  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const rawLine of normalizedLines) {
    const lineParts = splitLongLine(rawLine, maxChars);
    for (const part of lineParts) {
      const nextLength = currentLength === 0 ? part.length : currentLength + 1 + part.length;
      if (current.length > 0 && nextLength > maxChars) {
        chunks.push(current);
        current = [part];
        currentLength = part.length;
      } else {
        current.push(part);
        currentLength = nextLength;
      }
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [[]];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeWebhookType(type) {
  return String(type || "").trim().toLowerCase() === "feishu" ? "feishu" : "generic";
}

export function normalizeWebhookTarget(input, fallbackType = "generic") {
  if (!input) {
    return {
      type: sanitizeWebhookType(fallbackType),
      url: ""
    };
  }
  if (typeof input === "string") {
    return {
      type: sanitizeWebhookType(fallbackType),
      url: String(input).trim()
    };
  }
  return {
    type: sanitizeWebhookType(input.type || fallbackType),
    url: String(input.url || input.webhookUrl || "").trim()
  };
}

export function formatWebhookTargetLabel(target) {
  const normalized = normalizeWebhookTarget(target);
  if (!normalized.url) return "";
  return `${normalized.type === "feishu" ? "飞书" : "Webhook"}=${normalized.url}`;
}

function buildFeishuPostPayload({ title, lines, partLabel = "" }) {
  const contentLines = (Array.isArray(lines) ? lines : [])
    .filter(Boolean)
    .map((line) => [{ tag: "text", text: String(line) }]);
  return {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title: `${String(title || "OpenStock 通知")}${partLabel ? ` ${partLabel}` : ""}`,
          content: contentLines.length > 0 ? contentLines : [[{ tag: "text", text: "无内容" }]]
        }
      }
    }
  };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Webhook HTTP ${res.status} ${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function postJsonSequence(url, payloads) {
  for (const payload of payloads) {
    await postJson(url, payload);
  }
}

function normalizeFeishuResponseError(body) {
  if (!body || typeof body !== "object") return "";
  const code = typeof body.code === "number" ? body.code : (typeof body.StatusCode === "number" ? body.StatusCode : 0);
  const message = String(body.msg || body.StatusMessage || "").trim();
  if (code === 0) return "";
  return `Feishu code=${code}${message ? ` msg=${message}` : ""}`;
}

function extractFeishuErrorCode(input) {
  const text = String(input instanceof Error ? input.message : input || "");
  const match = text.match(/Feishu code=(\d+)/);
  return match ? Number(match[1]) : null;
}

function isFeishuRateLimitError(error) {
  return extractFeishuErrorCode(error) === 11232;
}

async function postFeishuJson(url, payload) {
  const body = await postJson(url, payload);
  const errorText = normalizeFeishuResponseError(body);
  if (errorText) {
    throw new Error(errorText);
  }
  return body;
}

async function postFeishuJsonWithRetry(url, payload, {
  log,
  label = "飞书消息",
  partIndex = 0,
  totalParts = 1
} = {}) {
  let attempt = 0;
  while (attempt <= FEISHU_RATE_LIMIT_RETRY_MAX) {
    try {
      await postFeishuJson(url, payload);
      if (log) {
        log(`Feishu part sent ${label} ${partIndex + 1}/${totalParts}${attempt > 0 ? `（重试后成功，第 ${attempt + 1} 次）` : ""}`);
      }
      return;
    } catch (error) {
      if (!isFeishuRateLimitError(error) || attempt >= FEISHU_RATE_LIMIT_RETRY_MAX) {
        throw error;
      }
      const waitMs = FEISHU_RATE_LIMIT_RETRY_BASE_DELAY_MS * (attempt + 1);
      if (log) {
        log(`Feishu rate limited ${label} ${partIndex + 1}/${totalParts}，${waitMs}ms 后重试（第 ${attempt + 1}/${FEISHU_RATE_LIMIT_RETRY_MAX} 次）`);
      }
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

async function postFeishuJsonSequence(url, payloads, {
  log,
  label = "飞书消息"
} = {}) {
  for (let index = 0; index < payloads.length; index += 1) {
    if (index > 0) {
      if (log) {
        log(`Feishu throttle ${label} ${index + 1}/${payloads.length}，等待 ${FEISHU_PART_DELAY_MS}ms`);
      }
      await sleep(FEISHU_PART_DELAY_MS);
    }
    await postFeishuJsonWithRetry(url, payloads[index], {
      log,
      label,
      partIndex: index,
      totalParts: payloads.length
    });
  }
}

function buildFeishuAlertLines({ rule, symbol, ctx, conditionText, adoptedFields, evaluationSummary }) {
  const lines = [];
  lines.push(`规则：${rule?.name || rule?.id || "未命名规则"}`);
  lines.push(`股票：${symbol}`);
  lines.push(`条件：${conditionText}`);
  const metrics = buildKeyMetrics(ctx);
  if (metrics.length > 0) lines.push(`关键数值：${metrics.join(" | ")}`);
  const evidenceLines = Array.isArray(evaluationSummary?.evidenceLines) ? evaluationSummary.evidenceLines : [];
  if (evidenceLines.length > 0) lines.push(`命中依据：${evidenceLines.join("；")}`);
  const adoptedLines = formatAdoptedFieldDetails(adoptedFields);
  if (adoptedLines.length > 0) lines.push(`代理/回退：${adoptedLines.join("；")}`);
  const missingLines = Array.isArray(evaluationSummary?.missingFieldDetails) ? evaluationSummary.missingFieldDetails : [];
  if (missingLines.length > 0) lines.push(`缺字段：${missingLines.join("；")}`);
  lines.push(`时间：${new Date().toISOString()}`);
  return lines;
}

function buildFeishuBatchLines({ rule, conditionText, entries, runSummary }) {
  const lines = [];
  const ruleName = rule?.name || rule?.id || "未命名规则";
  const fallbackCount = Array.isArray(entries)
    ? entries.filter((entry) => Array.isArray(entry?.adoptedFields) && entry.adoptedFields.some((item) => item?.kind === "fallback")).length
    : 0;
  const summaryStats = buildSummaryStats(runSummary, fallbackCount);

  lines.push(`规则：${ruleName}`);
  lines.push(`条件：${conditionText}`);
  if (summaryStats.length > 0) {
    lines.push(`汇总：${summaryStats.join(" | ")}`);
  } else {
    lines.push(`命中数量：${Array.isArray(entries) ? entries.length : 0}`);
  }
  lines.push(`时间：${new Date().toISOString()}`);
  lines.push("命中列表：");

  const visibleEntries = Array.isArray(entries) ? entries : [];
  visibleEntries.forEach((entry, index) => {
    const symbol = entry?.symbol || "-";
    const metrics = buildKeyMetrics(entry?.ctx || {});
    lines.push(`${index + 1}. ${symbol}${metrics.length > 0 ? ` | ${metrics.join(" | ")}` : ""}`);
    const evidenceLines = Array.isArray(entry?.evaluationSummary?.evidenceLines) ? entry.evaluationSummary.evidenceLines : [];
    if (evidenceLines.length > 0) lines.push(`   命中依据：${evidenceLines.join("；")}`);
    const adoptedLines = formatAdoptedFieldDetails(entry?.adoptedFields);
    if (adoptedLines.length > 0) lines.push(`   代理/回退：${adoptedLines.join("；")}`);
    const missingLines = Array.isArray(entry?.evaluationSummary?.missingFieldDetails) ? entry.evaluationSummary.missingFieldDetails : [];
    if (missingLines.length > 0) lines.push(`   缺字段：${missingLines.join("；")}`);
  });
  return lines;
}

export function buildTransport(email) {
  const user = email?.user || "";
  const pass = email?.pass || "";
  if (!user || !pass) return null;
  const host = String(email?.host ?? "").trim();
  const port = Number(email?.port) || 0;
  const secure = email?.secure ?? true;
  if (host) {
    return nodemailer.createTransport({
      host,
      port: port || 465,
      secure,
      auth: { user, pass },
      pool: true,
      maxConnections: 1,
      maxMessages: 3
    });
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 3
  });
}

export async function sendEmail(transport, { fromUser, to, subject, text }) {
  if (!transport) throw new Error("Email is not configured");
  const from = `"美股提醒工具" <${fromUser}>`;
  return transport.sendMail({ from, to, subject, text });
}

export async function sendWebhook({ url, payload }) {
  await postJson(url, payload);
}

export async function sendNotificationWebhook({ target, payload, title, lines, log, logLabel }) {
  const normalized = normalizeWebhookTarget(target);
  if (!normalized.url) throw new Error("Webhook is not configured");
  if (normalized.type === "feishu") {
    const chunks = splitLinesIntoChunks(lines);
    const payloads = chunks.map((chunk, index) => buildFeishuPostPayload({
      title,
      lines: chunk,
      partLabel: chunks.length > 1 ? `(${index + 1}/${chunks.length})` : ""
    }));
    await postFeishuJsonSequence(normalized.url, payloads, {
      log,
      label: logLabel || String(title || "OpenStock 通知")
    });
    return { partsSent: payloads.length };
  }
  await sendWebhook({ url: normalized.url, payload });
  return { partsSent: 1 };
}

export function formatMessage({ rule, symbol, ctx, conditionText, adoptedFields, evaluationSummary }) {
  const lines = [];
  lines.push(`规则: ${rule.name || rule.id || ""}`.trim());
  lines.push(`股票: ${symbol}`);
  lines.push(`条件: ${conditionText}`);
  const metrics = buildKeyMetrics(ctx);
  if (metrics.length > 0) lines.push(`关键数值: ${metrics.join(" | ")}`);
  const evidenceLines = Array.isArray(evaluationSummary?.evidenceLines) ? evaluationSummary.evidenceLines : [];
  if (evidenceLines.length > 0) {
    lines.push("命中依据:");
    lines.push(...evidenceLines.map((line) => `- ${line}`));
  }
  const adoptedLines = formatAdoptedFieldDetails(adoptedFields);
  if (adoptedLines.length > 0) {
    lines.push("代理/回退说明:");
    lines.push(...adoptedLines.map((line) => `- ${line}`));
  }
  const missingLines = Array.isArray(evaluationSummary?.missingFieldDetails) ? evaluationSummary.missingFieldDetails : [];
  if (missingLines.length > 0) {
    lines.push("缺字段:");
    lines.push(...missingLines.map((line) => `- ${line}`));
  }
  lines.push(`时间: ${new Date().toISOString()}`);
  return lines.join("\n");
}

export function formatBatchMessage({ rule, conditionText, entries, runSummary }) {
  const ruleName = rule?.name || rule?.id || "未命名规则";
  const fallbackCount = Array.isArray(entries)
    ? entries.filter((entry) => Array.isArray(entry?.adoptedFields) && entry.adoptedFields.some((item) => item?.kind === "fallback")).length
    : 0;
  const lines = [];
  lines.push(`规则: ${ruleName}`);
  lines.push(`条件: ${conditionText}`);
  const summaryStats = buildSummaryStats(runSummary, fallbackCount);
  if (summaryStats.length > 0) lines.push(`汇总: ${summaryStats.join(" | ")}`);
  else lines.push(`命中数量: ${entries.length}`);
  lines.push(`时间: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("命中列表:");
  for (const [index, entry] of entries.entries()) {
    const ctx = entry?.ctx || {};
    const symbol = entry?.symbol || "-";
    const metrics = buildKeyMetrics(ctx);
    lines.push(`${index + 1}. ${symbol}${metrics.length > 0 ? ` | ${metrics.join(" | ")}` : ""}`);
    const evidenceLines = Array.isArray(entry?.evaluationSummary?.evidenceLines) ? entry.evaluationSummary.evidenceLines : [];
    if (evidenceLines.length > 0) lines.push(`   命中依据: ${evidenceLines.join("；")}`);
    const adoptedSummary = formatAdoptedFieldDetails(entry?.adoptedFields);
    if (adoptedSummary.length > 0) lines.push(`   代理/回退: ${adoptedSummary.join("；")}`);
    const missingLines = Array.isArray(entry?.evaluationSummary?.missingFieldDetails) ? entry.evaluationSummary.missingFieldDetails : [];
    if (missingLines.length > 0) lines.push(`   缺字段: ${missingLines.join("；")}`);
  }
  return lines.join("\n");
}

export async function flushQueuedRuleEmail({
  rule,
  conditionText,
  entries,
  runSummary,
  notifyEmailTo,
  transport,
  fromUser,
  log
}) {
  if (!notifyEmailTo || !Array.isArray(entries) || entries.length === 0) return;
  const ruleName = rule?.name || rule?.id || "未命名规则";
  if (!transport) {
    if (log) log(`规则 ${ruleName} 本轮命中 ${entries.length} 次，但邮箱未配置，无法发送到 ${notifyEmailTo}`);
    return;
  }
  if (log) log(`规则 ${ruleName}：准备发送汇总邮件，目标=${notifyEmailTo}，命中=${entries.length}`);
  const subject = `Alert Summary: ${ruleName} (${entries.length})`;
  const text = formatBatchMessage({ rule, conditionText, entries, runSummary });
  let emailSent = true;
  await sendEmail(transport, {
    fromUser,
    to: notifyEmailTo,
    subject,
    text
  }).catch((error) => {
    emailSent = false;
    if (log) log(`Email summary error ${ruleName} ${error instanceof Error ? error.message : String(error)}`);
  });
  if (emailSent) {
    if (log) log(`Email summary sent ${ruleName} -> ${notifyEmailTo}（${entries.length} 条命中）`);
    return;
  }
  if (log) log(`规则 ${ruleName}：汇总邮件发送失败，回退为逐条邮件`);
  let fallbackSentCount = 0;
  for (const entry of entries) {
    let fallbackSent = true;
    await sendEmail(transport, {
      fromUser,
      to: notifyEmailTo,
      subject: `Alert: ${entry?.symbol || "-"}${rule?.name ? ` - ${rule.name}` : ""}`,
      text: String(entry?.message || "")
    }).catch((error) => {
      fallbackSent = false;
      if (log) log(`Email fallback error ${entry?.symbol || "-"} ${error instanceof Error ? error.message : String(error)}`);
    });
    if (fallbackSent) {
      fallbackSentCount += 1;
      if (log) log(`Email fallback sent ${entry?.symbol || "-"} -> ${notifyEmailTo}`);
    }
  }
  if (log) log(`规则 ${ruleName}：逐条邮件回退完成，成功 ${fallbackSentCount}/${entries.length}`);
}

export async function flushQueuedRuleWebhook({
  rule,
  conditionText,
  entries,
  runSummary,
  webhookTarget,
  log
}) {
  const normalizedTarget = normalizeWebhookTarget(webhookTarget);
  if (!normalizedTarget.url || normalizedTarget.type !== "feishu" || !Array.isArray(entries) || entries.length === 0) return;
  const ruleName = rule?.name || rule?.id || "未命名规则";
  const title = `规则汇总：${ruleName}（${entries.length}）`;
  const lines = buildFeishuBatchLines({ rule, conditionText, entries, runSummary });
  if (log) log(`规则 ${ruleName}：准备发送飞书汇总，目标=${normalizedTarget.url}，命中=${entries.length}`);
  await sendNotificationWebhook({
    target: normalizedTarget,
    payload: { entries, runSummary },
    title,
    lines,
    log,
    logLabel: `规则汇总：${ruleName}`
  }).then((result) => {
    if (log) log(`Feishu summary sent ${ruleName} -> ${normalizedTarget.url}（${entries.length} 条命中，分片=${result?.partsSent || 1}）`);
  }).catch((error) => {
    if (log) log(`Feishu summary error ${ruleName} ${error instanceof Error ? error.message : String(error)}`);
  });
}

export async function notifyAlert({
  rule,
  symbol,
  ctx,
  adoptedFields,
  evaluationSummary,
  conditionText,
  dryRun,
  event,
  notifyEmailTo,
  notifyWebhookTarget,
  queuedEmailNotifications,
  queuedWebhookNotifications,
  transport,
  fromUser,
  log
}) {
  if (dryRun) return;

  const message = formatMessage({ rule, symbol, ctx, conditionText, adoptedFields, evaluationSummary });
  const ruleName = rule?.name || rule?.id || "未命名规则";
  const webhookTarget = normalizeWebhookTarget(notifyWebhookTarget);
  const hasWebhook = Boolean(webhookTarget.url);
  const hasEmailTarget = Boolean(notifyEmailTo);

  if (!hasWebhook && !hasEmailTarget) {
    if (log) log(`规则 ${ruleName} 命中 ${symbol}，但未配置任何通知目标`);
    return;
  }

  if (hasWebhook) {
    if (webhookTarget.type === "feishu" && Array.isArray(queuedWebhookNotifications)) {
      queuedWebhookNotifications.push({ symbol, ctx, adoptedFields, evaluationSummary, conditionText, event, message });
      if (log) log(`Feishu queued ${symbol} -> ${webhookTarget.url}`);
    } else {
      let webhookSent = true;
      await sendNotificationWebhook({
        target: webhookTarget,
        payload: event,
        title: `规则提醒：${symbol}${rule?.name ? ` - ${rule.name}` : ""}`,
        lines: buildFeishuAlertLines({ rule, symbol, ctx, conditionText, adoptedFields, evaluationSummary }),
        log,
        logLabel: `规则提醒：${symbol}${rule?.name ? ` - ${rule.name}` : ""}`
      }).then((result) => {
        if (log) {
          log(`${webhookTarget.type === "feishu" ? "Feishu" : "Webhook"} sent ${symbol} -> ${webhookTarget.url}${webhookTarget.type === "feishu" ? `（分片=${result?.partsSent || 1}）` : ""}`);
        }
      }).catch((error) => {
        webhookSent = false;
        if (log) log(`${webhookTarget.type === "feishu" ? "Feishu" : "Webhook"} error ${symbol} ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  if (hasEmailTarget) {
    if (Array.isArray(queuedEmailNotifications)) {
      queuedEmailNotifications.push({ symbol, ctx, adoptedFields, evaluationSummary, conditionText, event, message });
      if (log) log(`Email queued ${symbol} -> ${notifyEmailTo}`);
    } else {
      if (!transport) {
        if (log) log(`规则 ${ruleName} 命中 ${symbol}，但邮箱未配置，无法发送到 ${notifyEmailTo}`);
        return;
      }
      let emailSent = true;
      await sendEmail(transport, {
        fromUser,
        to: notifyEmailTo,
        subject: `Alert: ${symbol}${rule.name ? ` - ${rule.name}` : ""}`,
        text: message
      }).catch((error) => {
        emailSent = false;
        if (log) log(`Email error ${symbol} ${error instanceof Error ? error.message : String(error)}`);
      });
      if (emailSent && log) log(`Email sent ${symbol} -> ${notifyEmailTo}`);
    }
  }
}
