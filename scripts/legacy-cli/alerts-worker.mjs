#!/usr/bin/env node

import { MongoClient, ObjectId } from "mongodb";
import nodemailer from "nodemailer";

const FINNHUB_BASE_URL = process.env.FINNHUB_BASE_URL || "https://finnhub.io/api/v1";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

const DEFAULT_POLL_INTERVAL_SEC = Number.parseInt(process.env.ALERTS_POLL_INTERVAL_SEC || "60", 10);
const DEFAULT_COOLDOWN_SEC = Number.parseInt(process.env.ALERTS_DEFAULT_COOLDOWN_SEC || "900", 10);
const MAX_SYMBOLS_PER_BATCH = Number.parseInt(process.env.ALERTS_MAX_SYMBOLS_PER_BATCH || "25", 10);

const DRY_RUN = process.argv.includes("--dry-run");
const ONCE = process.argv.includes("--once");

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function nowMs() {
  return Date.now();
}

function toNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchJSON(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "OpenStock-AlertsWorker/1.0" }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

async function finnhubQuote(symbol) {
  const token = requireEnv("FINNHUB_API_KEY or NEXT_PUBLIC_FINNHUB_API_KEY", FINNHUB_API_KEY);
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
  const data = await fetchJSON(url);
  return {
    price: toNumber(data?.c),
    change: toNumber(data?.d),
    changePercent: toNumber(data?.dp),
    prevClose: toNumber(data?.pc),
    open: toNumber(data?.o),
    high: toNumber(data?.h),
    low: toNumber(data?.l),
    t: toNumber(data?.t)
  };
}

async function finnhubCandles(symbol, resolution, fromSec, toSec) {
  const token = requireEnv("FINNHUB_API_KEY or NEXT_PUBLIC_FINNHUB_API_KEY", FINNHUB_API_KEY);
  const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(token)}`;
  const data = await fetchJSON(url);
  if (!data || data.s !== "ok") return null;
  return {
    t: Array.isArray(data.t) ? data.t.map(toNumber).filter((x) => x !== null) : [],
    c: Array.isArray(data.c) ? data.c.map(toNumber).filter((x) => x !== null) : [],
    v: Array.isArray(data.v) ? data.v.map(toNumber).filter((x) => x !== null) : []
  };
}

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const slice = values.slice(values.length - period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

function rsi(values, period) {
  if (!Array.isArray(values) || values.length < period + 1 || period <= 0) return null;
  const recent = values.slice(values.length - (period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function buildEvalContext({ symbol, quote, indicators }) {
  return {
    symbol,
    price: quote.price,
    changePercent: quote.changePercent,
    change: quote.change,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    ...indicators
  };
}

function evaluate(node, ctx, prevCtx) {
  if (node === null || node === undefined) return null;
  if (typeof node === "number") return node;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;

  if (node.var) {
    return ctx[node.var];
  }

  if (node.prev && node.prev.var) {
    return prevCtx ? prevCtx[node.prev.var] : null;
  }

  if (node.op) {
    const op = node.op;
    if (op === "and" || op === "or") {
      const args = Array.isArray(node.args) ? node.args : [];
      const vals = args.map((n) => Boolean(evaluate(n, ctx, prevCtx)));
      return op === "and" ? vals.every(Boolean) : vals.some(Boolean);
    }

    if (op === "not") {
      return !Boolean(evaluate(node.arg, ctx, prevCtx));
    }

    if (op === "crossesAbove" || op === "crossesBelow") {
      const leftNow = toNumber(evaluate(node.left, ctx, prevCtx));
      const rightNow = toNumber(evaluate(node.right, ctx, prevCtx));
      const leftPrev = prevCtx ? toNumber(evaluate(node.left, prevCtx, null)) : null;
      const rightPrev = prevCtx ? toNumber(evaluate(node.right, prevCtx, null)) : null;
      if (leftNow === null || rightNow === null || leftPrev === null || rightPrev === null) return false;
      if (op === "crossesAbove") return leftPrev <= rightPrev && leftNow > rightNow;
      return leftPrev >= rightPrev && leftNow < rightNow;
    }

    const left = evaluate(node.left, ctx, prevCtx);
    const right = evaluate(node.right, ctx, prevCtx);
    const ln = toNumber(left);
    const rn = toNumber(right);
    if (ln === null || rn === null) return false;

    if (op === ">") return ln > rn;
    if (op === ">=") return ln >= rn;
    if (op === "<") return ln < rn;
    if (op === "<=") return ln <= rn;
    if (op === "==") return ln === rn;
    if (op === "!=") return ln !== rn;

    return false;
  }

  return null;
}

function summarizeCondition(node) {
  if (!node || typeof node !== "object") return String(node);
  if (node.var) return `{${node.var}}`;
  if (node.prev && node.prev.var) return `{prev.${node.prev.var}}`;
  if (node.op === "and" || node.op === "or") return `(${(node.args || []).map(summarizeCondition).join(node.op === "and" ? " AND " : " OR ")})`;
  if (node.op === "not") return `(NOT ${summarizeCondition(node.arg)})`;
  if (node.op) return `(${summarizeCondition(node.left)} ${node.op} ${summarizeCondition(node.right)})`;
  return stableStringify(node);
}

function buildTransport() {
  const user = process.env.NODEMAILER_EMAIL;
  const pass = process.env.NODEMAILER_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 3
  });
}

async function sendEmail(transport, { to, subject, text }) {
  if (!transport) throw new Error("Email transport not configured");
  const from = `"OpenStock Alerts" <${process.env.NODEMAILER_EMAIL}>`;
  return transport.sendMail({ from, to, subject, text });
}

async function sendWebhook({ url, payload }) {
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

function buildRuleKey(rule) {
  const id = rule._id ? String(rule._id) : "";
  const name = rule.name ? String(rule.name) : "";
  const condition = rule.condition ? stableStringify(rule.condition) : "";
  return `${id}:${name}:${condition}`;
}

async function ensureIndexes(db) {
  await db.collection("alert_events").createIndex({ dedupeKey: 1 }, { unique: true });
  await db.collection("alert_rules").createIndex({ enabled: 1 });
  await db.collection("alert_state").createIndex({ ruleId: 1, symbol: 1 }, { unique: true });
}

async function loadEnabledRules(db) {
  return await db.collection("alert_rules").find({ enabled: true }).toArray();
}

async function loadStateMap(db, ruleId, symbols) {
  const docs = await db.collection("alert_state").find({ ruleId: String(ruleId), symbol: { $in: symbols } }).toArray();
  const map = new Map();
  for (const d of docs) map.set(d.symbol, d);
  return map;
}

async function upsertState(db, { ruleId, symbol, ctx, updatedAt }) {
  await db.collection("alert_state").updateOne(
    { ruleId: String(ruleId), symbol },
    { $set: { ruleId: String(ruleId), symbol, ctx, updatedAt } },
    { upsert: true }
  );
}

async function recordEvent(db, event) {
  await db.collection("alert_events").insertOne(event);
}

function formatMessage({ rule, symbol, ctx, conditionText }) {
  const lines = [];
  lines.push(`Rule: ${rule.name || String(rule._id)}`);
  lines.push(`Symbol: ${symbol}`);
  lines.push(`Condition: ${conditionText}`);
  lines.push(`Price: ${ctx.price}`);
  if (ctx.changePercent !== null && ctx.changePercent !== undefined) lines.push(`Change%: ${ctx.changePercent}`);
  if (ctx.sma20 !== null && ctx.sma20 !== undefined) lines.push(`SMA20: ${ctx.sma20}`);
  if (ctx.rsi14 !== null && ctx.rsi14 !== undefined) lines.push(`RSI14: ${ctx.rsi14}`);
  lines.push(`Time: ${new Date().toISOString()}`);
  return lines.join("\n");
}

async function computeIndicators({ symbol, rule }) {
  const out = {};
  const needsSma20 = JSON.stringify(rule.condition || {}).includes("sma20") || JSON.stringify(rule.condition || {}).includes("SMA20");
  const needsRsi14 = JSON.stringify(rule.condition || {}).includes("rsi14") || JSON.stringify(rule.condition || {}).includes("RSI14");

  if (!needsSma20 && !needsRsi14) return out;

  const toSec = Math.floor(nowMs() / 1000);
  const fromSec = toSec - 90 * 86400;
  const candles = await finnhubCandles(symbol, "D", fromSec, toSec);
  if (!candles || !candles.c || candles.c.length === 0) return out;

  if (needsSma20) out.sma20 = sma(candles.c, 20);
  if (needsRsi14) out.rsi14 = rsi(candles.c, 14);
  return out;
}

async function processRule(db, transport, rule) {
  const symbols = Array.isArray(rule.symbols) ? rule.symbols.map((s) => String(s).toUpperCase()).filter(Boolean) : [];
  if (symbols.length === 0) return;

  const cooldownSec = Number.parseInt(String(rule.cooldownSec || ""), 10);
  const effectiveCooldownSec = Number.isFinite(cooldownSec) ? cooldownSec : DEFAULT_COOLDOWN_SEC;
  const notify = rule.notify || {};
  const notifyEmail = notify.email || process.env.ALERTS_DEFAULT_EMAIL_TO;
  const notifyWebhook = notify.webhookUrl || null;

  const conditionText = summarizeCondition(rule.condition);
  const ruleKey = buildRuleKey(rule);

  for (const symbolsBatch of chunk(symbols, MAX_SYMBOLS_PER_BATCH)) {
    const stateMap = await loadStateMap(db, rule._id, symbolsBatch);

    const quotes = await Promise.all(symbolsBatch.map(async (symbol) => ({ symbol, quote: await finnhubQuote(symbol) })));

    for (const { symbol, quote } of quotes) {
      if (!quote || quote.price === null) continue;

      const indicators = await computeIndicators({ symbol, rule });
      const ctx = buildEvalContext({ symbol, quote, indicators });

      const st = stateMap.get(symbol);
      const prevCtx = st?.ctx || null;

      const matched = Boolean(evaluate(rule.condition, ctx, prevCtx));
      const lastFiredAt = st?.lastFiredAt ? Number(st.lastFiredAt) : null;
      const canFire = !lastFiredAt || (nowMs() - lastFiredAt) >= effectiveCooldownSec * 1000;

      await upsertState(db, { ruleId: rule._id, symbol, ctx, updatedAt: new Date() });

      if (!matched || !canFire) continue;

      const dedupeKey = `${ruleKey}:${symbol}:${Math.floor(nowMs() / (effectiveCooldownSec * 1000))}`;
      const event = {
        dedupeKey,
        ruleId: String(rule._id),
        symbol,
        matchedAt: new Date(),
        ctx
      };

      if (DRY_RUN) {
        process.stdout.write(`DRY_RUN FIRED ${symbol} ${conditionText}\n`);
        await db.collection("alert_state").updateOne(
          { ruleId: String(rule._id), symbol },
          { $set: { lastFiredAt: nowMs() } }
        );
        continue;
      }

      try {
        await recordEvent(db, event);
      } catch (e) {
        continue;
      }

      const message = formatMessage({ rule, symbol, ctx, conditionText });

      if (notifyWebhook) {
        await sendWebhook({ url: notifyWebhook, payload: { type: "alert", rule: { id: String(rule._id), name: rule.name }, symbol, ctx, conditionText } });
      }

      if (notifyEmail) {
        await sendEmail(transport, { to: notifyEmail, subject: `Alert: ${symbol} ${rule.name ? `- ${rule.name}` : ""}`.trim(), text: message });
      }

      await db.collection("alert_state").updateOne(
        { ruleId: String(rule._id), symbol },
        { $set: { lastFiredAt: nowMs() } }
      );
    }
  }
}

async function main() {
  requireEnv("MONGODB_URI", MONGODB_URI);
  requireEnv("FINNHUB_API_KEY or NEXT_PUBLIC_FINNHUB_API_KEY", FINNHUB_API_KEY);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const dbName = process.env.MONGODB_DB || "openstock";
  const db = client.db(dbName);

  await ensureIndexes(db);

  const transport = buildTransport();

  const tick = async () => {
    const rules = await loadEnabledRules(db);
    for (const rule of rules) {
      try {
        await processRule(db, transport, rule);
      } catch (e) {
        process.stderr.write(`Rule error ${rule?._id ? String(rule._id) : ""} ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }
  };

  if (ONCE) {
    await tick();
    await client.close();
    return;
  }

  const intervalSec = Number.isFinite(DEFAULT_POLL_INTERVAL_SEC) ? DEFAULT_POLL_INTERVAL_SEC : 60;
  await tick();
  setInterval(() => {
    tick().catch((e) => process.stderr.write(`Tick error ${e instanceof Error ? e.message : String(e)}\n`));
  }, intervalSec * 1000);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

