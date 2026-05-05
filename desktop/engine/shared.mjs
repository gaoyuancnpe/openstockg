import { appendFile, readFile, writeFile } from "node:fs/promises";
import { toNumber } from "../shared-runtime.mjs";

export function nowMs() {
  return Date.now();
}

export function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function readJSON(filePath, fallback) {
  try {
    const txt = await readFile(filePath, "utf-8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

export async function writeJSON(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function appendJsonLine(filePath, obj) {
  const line = JSON.stringify(obj) + "\n";
  await appendFile(filePath, line, "utf-8").catch(() => {});
}

export function appendQuery(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === "") continue;
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

export function isoDateToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function isoDateShiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isoDateShiftYears(iso, years) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function isRecentIsoTime(iso, maxAgeMs) {
  const t = iso ? Date.parse(String(iso)) : NaN;
  return Number.isFinite(t) && nowMs() - t <= maxAgeMs;
}

export function sortUniverseRowsByMarketCapDesc(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      symbol: String(row?.symbol || "").trim().toUpperCase(),
      marketCap: toNumber(row?.marketCap)
    }))
    .filter((row) => row.symbol && /^[A-Z0-9.\-]+$/.test(row.symbol))
    .sort((a, b) => {
      const aCap = a.marketCap;
      const bCap = b.marketCap;
      if (aCap === null && bCap === null) return a.symbol.localeCompare(b.symbol);
      if (aCap === null) return 1;
      if (bCap === null) return -1;
      if (bCap !== aCap) return bCap - aCap;
      return a.symbol.localeCompare(b.symbol);
    });
}

export function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function toRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function parseTimeHHMM(input) {
  const s = String(input || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

export function computeNextDailyRunMs({ timeHHMM, weekdaysOnly }) {
  const t = parseTimeHHMM(timeHHMM);
  if (!t) return null;

  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(t.hh, t.mm, 0, 0);

  const isWeekday = (date) => date.getDay() >= 1 && date.getDay() <= 5;

  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  if (weekdaysOnly) {
    while (!isWeekday(next)) next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

