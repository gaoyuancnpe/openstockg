import nodemailer from "nodemailer";

export function buildTransport(email) {
  const user = email?.user || "";
  const pass = email?.pass || "";
  if (!user || !pass) return null;
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook HTTP ${res.status} ${text}`);
  }
}

export function formatMessage({ rule, symbol, ctx, conditionText }) {
  const lines = [];
  lines.push(`Rule: ${rule.name || rule.id || ""}`.trim());
  lines.push(`Symbol: ${symbol}`);
  lines.push(`Condition: ${conditionText}`);
  lines.push(`Price: ${ctx.price}`);
  if (ctx.changePercent !== null && ctx.changePercent !== undefined) lines.push(`Change%: ${ctx.changePercent}`);
  if (ctx.marketCap !== null && ctx.marketCap !== undefined) lines.push(`MarketCap(M USD): ${ctx.marketCap}`);
  if (ctx.turnoverM !== null && ctx.turnoverM !== undefined) lines.push(`Turnover(M USD): ${ctx.turnoverM}`);
  if (ctx.recent5dCloseAth !== null && ctx.recent5dCloseAth !== undefined) lines.push(`Recent5DCloseATH: ${ctx.recent5dCloseAth}`);
  if (ctx.sma20 !== null && ctx.sma20 !== undefined) lines.push(`SMA20: ${ctx.sma20}`);
  if (ctx.rsi14 !== null && ctx.rsi14 !== undefined) lines.push(`RSI14: ${ctx.rsi14}`);
  lines.push(`Time: ${new Date().toISOString()}`);
  return lines.join("\n");
}

export async function notifyAlert({
  rule,
  symbol,
  ctx,
  conditionText,
  dryRun,
  event,
  notifyEmailTo,
  notifyWebhookUrl,
  transport,
  fromUser,
  log
}) {
  if (dryRun) return;

  const message = formatMessage({ rule, symbol, ctx, conditionText });

  if (notifyWebhookUrl) {
    await sendWebhook({ url: notifyWebhookUrl, payload: event }).catch((error) => {
      if (log) log(`Webhook error ${symbol} ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  if (notifyEmailTo) {
    await sendEmail(transport, {
      fromUser,
      to: notifyEmailTo,
      subject: `Alert: ${symbol}${rule.name ? ` - ${rule.name}` : ""}`,
      text: message
    }).catch((error) => {
      if (log) log(`Email error ${symbol} ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

