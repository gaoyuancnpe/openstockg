#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

 dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
 dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DEFAULT_BASE_URL = "https://financialmodelingprep.com";
const DEFAULT_SCAN_LIMIT = 50;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MIN_MARKET_CAP_M = 10000;
const DEFAULT_MIN_TURNOVER_M = 500;

function nowMs() {
  return Date.now();
}

function toNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function appendQuery(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === "") continue;
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

function normalizeHttpBaseUrl(url, fallback) {
  return String(url || fallback || "").trim().replace(/\/+$/, "");
}

function describeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = String(error?.cause?.code || "");
  const causeMessage = String(error?.cause?.message || "");
  const details = [message];
  if (code) details.push(`code=${code}`);
  if (causeMessage && causeMessage !== message) details.push(`cause=${causeMessage}`);
  return details.join(" | ");
}

function isoDateToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function isoDateShiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDateShiftYears(iso, years) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseArgNumber(name, fallback) {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!hit) return fallback;
  const value = Number(hit.slice(name.length + 1));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printHelp() {
  console.log(`
用法：
  npm run fmp:test
  npm run fmp:test -- --limit=100
  npm run fmp:test -- --limit=300 --concurrency=6

环境变量：
  FMP_API_KEY=你的 FMP Key
  FMP_BASE_URL=https://financialmodelingprep.com

默认规则：
  1. 最近一个成交日收盘市值 >= 10000 百万美元
  2. 最近一个成交日成交额 >= 500 百万美元
  3. 5 个交易日内股价创历史新高

说明：
  - 默认只做小样本扫描，用来验证 Key、接口和默认规则链路是否可跑。
  - 要求是否真正满足你的生产使用，还要再看更大扫描量下的耗时和限流情况。
`);
}

async function fetchJSON(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "OpenStock-FMPDefaultRuleTest/1.0"
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`.trim());
      }
      return await res.json();
    } catch (error) {
      lastError = error;
      const code = String(error?.cause?.code || "");
      const transient =
        error?.name === "AbortError" ||
        String(error?.message || "").includes("fetch failed") ||
        code.startsWith("UND_ERR_") ||
        code === "ETIMEDOUT";
      if (!transient || attempt === 1) {
        throw new Error(`请求失败：${url} | ${describeError(error)}`);
      }
    } finally {
      clearTimeout(id);
    }
  }
  throw new Error(`请求失败：${url} | ${describeError(lastError)}`);
}

async function fmpFetchJSON({ baseUrl, pathName, apiKey, params }) {
  if (!apiKey) {
    throw new Error("缺少 FMP_API_KEY，请先在根目录 .env.local 中填写");
  }
  const root = normalizeHttpBaseUrl(baseUrl, DEFAULT_BASE_URL);
  const url = appendQuery(`${root}${pathName}`, { ...(params || {}), apikey: apiKey });
  return fetchJSON(url);
}

async function fmpCompanyScreener({ baseUrl, apiKey, params }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/company-screener",
    apiKey,
    params
  });
  return Array.isArray(data) ? data : [];
}

async function fmpProfile({ baseUrl, apiKey, symbol }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/profile",
    apiKey,
    params: { symbol }
  });
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return {
    symbol: String(row?.symbol || symbol || "").toUpperCase(),
    marketCapM: row?.marketCap !== null && row?.marketCap !== undefined ? Number(row.marketCap) / 1e6 : null,
    ipoDate: String(row?.ipoDate || "")
  };
}

async function fmpHistoricalPriceEodFull({ baseUrl, apiKey, symbol, from, to }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/historical-price-eod/full",
    apiKey,
    params: { symbol, from, to }
  });
  const rows = Array.isArray(data)
    ? data
    : (Array.isArray(data?.historical) ? data.historical : []);
  return rows
    .map((row) => ({
      date: String(row?.date || ""),
      high: toNumber(row?.high),
      close: toNumber(row?.close ?? row?.price),
      volume: toNumber(row?.volume)
    }))
    .filter((row) => row.date && (row.high !== null || row.close !== null))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function computeFmpDefaultStats({ baseUrl, apiKey, symbol }) {
  const profile = await fmpProfile({ baseUrl, apiKey, symbol });
  const today = isoDateToday();
  const floorDate = /^\d{4}-\d{2}-\d{2}$/.test(profile.ipoDate) ? profile.ipoDate : "1980-01-01";
  const recentWindowFrom = floorDate > isoDateShiftYears(today, -5) ? floorDate : isoDateShiftYears(today, -5);

  const recentHistory = await fmpHistoricalPriceEodFull({
    baseUrl,
    apiKey,
    symbol,
    from: recentWindowFrom,
    to: today
  });
  if (!Array.isArray(recentHistory) || recentHistory.length === 0) {
    return { price: null, marketCap: null, turnoverM: null, recent5dCloseAth: null };
  }

  const last = recentHistory[recentHistory.length - 1];
  const recent5 = recentHistory.slice(-5);
  const recent5MaxHigh =
    recent5.length > 0 ? Math.max(...recent5.map((row) => row.high ?? row.close).filter((v) => v !== null)) : null;
  const turnoverM = last?.close !== null && last?.volume !== null ? (last.close * last.volume) / 1e6 : null;
  const recentChunkMax =
    recentHistory.length > 0 ? Math.max(...recentHistory.map((row) => row.high ?? row.close).filter((v) => v !== null)) : null;

  let recent5dCloseAth = recent5MaxHigh !== null && recentChunkMax !== null && recent5MaxHigh >= recentChunkMax ? 1 : 0;
  let olderWindowEnd = isoDateShiftDays(recentWindowFrom, -1);

  while (recent5dCloseAth && olderWindowEnd >= floorDate) {
    const olderWindowStartCandidate = isoDateShiftYears(olderWindowEnd, -5);
    const olderWindowStart = olderWindowStartCandidate < floorDate ? floorDate : olderWindowStartCandidate;
    const olderRows = await fmpHistoricalPriceEodFull({
      baseUrl,
      apiKey,
      symbol,
      from: olderWindowStart,
      to: olderWindowEnd
    }).catch(() => []);
    if (Array.isArray(olderRows) && olderRows.length > 0) {
      const olderMax = Math.max(...olderRows.map((row) => row.high ?? row.close).filter((v) => v !== null));
      if (recent5MaxHigh !== null && olderMax > recent5MaxHigh) {
        recent5dCloseAth = 0;
        break;
      }
    }
    if (olderWindowStart === floorDate) break;
    olderWindowEnd = isoDateShiftDays(olderWindowStart, -1);
  }

  return {
    price: last?.close ?? null,
    marketCap: profile.marketCapM,
    turnoverM,
    recent5dCloseAth,
    latestDate: last?.date || ""
  };
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }

  const apiKey = String(process.env.FMP_API_KEY || "").trim();
  const baseUrl = String(process.env.FMP_BASE_URL || DEFAULT_BASE_URL).trim();
  const limit = parseArgNumber("--limit", DEFAULT_SCAN_LIMIT);
  const concurrency = parseArgNumber("--concurrency", DEFAULT_CONCURRENCY);
  const minMarketCapM = parseArgNumber("--min-market-cap-m", DEFAULT_MIN_MARKET_CAP_M);
  const minTurnoverM = parseArgNumber("--min-turnover-m", DEFAULT_MIN_TURNOVER_M);

  const startedAt = nowMs();
  console.log("开始测试 FMP 默认规则...");
  console.log(`数据源：${normalizeHttpBaseUrl(baseUrl, DEFAULT_BASE_URL)}`);
  console.log(`扫描数量：${limit}`);
  console.log(`并发数：${concurrency}`);
  console.log(`规则门槛：市值 >= ${minMarketCapM} 百万美元，成交额 >= ${minTurnoverM} 百万美元，5 日股价新高`);

  const poolStartedAt = nowMs();
  const rows = await fmpCompanyScreener({
    baseUrl,
    apiKey,
    params: {
      exchange: "NASDAQ,NYSE",
      marketCapMoreThan: Math.round(minMarketCapM * 1e6),
      limit
    }
  });

  const candidates = rows
    .map((row) => ({
      symbol: String(row?.symbol || "").trim().toUpperCase(),
      marketCap: toNumber(row?.marketCap)
    }))
    .filter((row) => row.symbol && /^[A-Z0-9.\-]+$/.test(row.symbol));

  console.log(`候选池拉取完成：${candidates.length} 个，耗时 ${((nowMs() - poolStartedAt) / 1000).toFixed(1)} 秒`);
  if (candidates.length === 0) {
    console.log("没有拉到候选股票，先检查 Key 是否有效、套餐是否支持、接口是否限流。");
    return;
  }

  const hits = [];
  const errors = [];
  let scanned = 0;

  for (const batch of chunk(candidates, concurrency)) {
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const stats = await computeFmpDefaultStats({
            baseUrl,
            apiKey,
            symbol: item.symbol
          });
          return { ok: true, item, stats };
        } catch (error) {
          return {
            ok: false,
            item,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );

    for (const result of batchResults) {
      scanned += 1;
      if (!result.ok) {
        errors.push({ symbol: result.item.symbol, error: result.error });
        console.log(`[${scanned}/${candidates.length}] ${result.item.symbol} 失败：${result.error}`);
        continue;
      }

      const stats = result.stats;
      const passMarketCap = stats.marketCap !== null && stats.marketCap >= minMarketCapM;
      const passTurnover = stats.turnoverM !== null && stats.turnoverM >= minTurnoverM;
      const passAth = Boolean(stats.recent5dCloseAth);

      const summary = [
        `市值=${stats.marketCap !== null ? stats.marketCap.toFixed(0) : "NA"}M`,
        `成交额=${stats.turnoverM !== null ? stats.turnoverM.toFixed(0) : "NA"}M`,
        `5日新高=${passAth ? "是" : "否"}`
      ].join("，");

      if (passMarketCap && passTurnover && passAth) {
        hits.push({
          symbol: result.item.symbol,
          latestDate: stats.latestDate || "",
          price: stats.price,
          marketCap: stats.marketCap,
          turnoverM: stats.turnoverM
        });
        console.log(`[${scanned}/${candidates.length}] ${result.item.symbol} 命中，${summary}`);
      } else {
        console.log(`[${scanned}/${candidates.length}] ${result.item.symbol} 未命中，${summary}`);
      }
    }
  }

  const totalSec = ((nowMs() - startedAt) / 1000).toFixed(1);
  console.log("");
  console.log("测试完成");
  console.log(`总耗时：${totalSec} 秒`);
  console.log(`候选池数量：${candidates.length}`);
  console.log(`实际扫描：${scanned}`);
  console.log(`命中数量：${hits.length}`);
  console.log(`失败数量：${errors.length}`);

  if (hits.length > 0) {
    console.log("");
    console.log("命中结果：");
    for (const hit of hits) {
      console.log(
        `- ${hit.symbol} | 日期=${hit.latestDate || "NA"} | 收盘价=${hit.price ?? "NA"} | 市值=${hit.marketCap?.toFixed(0) ?? "NA"}M | 成交额=${hit.turnoverM?.toFixed(0) ?? "NA"}M`
      );
    }
  }

  if (errors.length > 0) {
    console.log("");
    console.log("失败样本（最多显示前 10 条）：");
    for (const item of errors.slice(0, 10)) {
      console.log(`- ${item.symbol}: ${item.error}`);
    }
  }

  console.log("");
  console.log("判断建议：");
  console.log("- 如果 50~100 支样本能稳定跑通，说明 Key 和默认规则链路基本可用。");
  console.log("- 如果要判断是否值得付费，还要继续把扫描量提高到 300、500 甚至更高，观察耗时和限流。");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FMP 默认规则测试失败：${message}`);
  process.exitCode = 1;
});
