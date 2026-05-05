#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

 dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
 dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DEFAULT_BASE_URL = "https://financialmodelingprep.com";
const DEFAULT_SCAN_LIMIT = 30;
const DEFAULT_CONCURRENCY = 2;

function toNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

function parseArgNumber(name, fallback) {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!hit) return fallback;
  const value = Number(hit.slice(name.length + 1));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fetchJSON(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "OpenStock-FMPFinancialTest/1.0" }
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
  if (!apiKey) throw new Error("缺少 FMP_API_KEY，请先在根目录 .env.local 中填写");
  const root = normalizeHttpBaseUrl(baseUrl, DEFAULT_BASE_URL);
  const url = appendQuery(`${root}${pathName}`, { ...(params || {}), apikey: apiKey });
  return fetchJSON(url);
}

async function fmpCompanyScreener({ baseUrl, apiKey, params }) {
  const data = await fmpFetchJSON({ baseUrl, pathName: "/stable/company-screener", apiKey, params });
  return Array.isArray(data) ? data : [];
}

async function fmpProfile({ baseUrl, apiKey, symbol }) {
  const data = await fmpFetchJSON({ baseUrl, pathName: "/stable/profile", apiKey, params: { symbol } });
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return {
    symbol,
    companyName: String(row?.companyName || row?.name || ""),
    marketCapM: row?.marketCap !== null && row?.marketCap !== undefined ? Number(row.marketCap) / 1e6 : null
  };
}

async function fmpIncomeStatements({ baseUrl, apiKey, symbol }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/income-statement",
    apiKey,
    params: { symbol, period: "quarter", limit: 5 }
  });
  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      date: String(row?.date || ""),
      revenue: toNumber(row?.revenue),
      grossProfit: toNumber(row?.grossProfit),
      ebitda: toNumber(row?.ebitda),
      operatingIncome: toNumber(row?.operatingIncome),
      netIncome: toNumber(row?.netIncome)
    }))
    .filter((row) => row.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function fmpCashFlowStatements({ baseUrl, apiKey, symbol }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/cash-flow-statement",
    apiKey,
    params: { symbol, period: "quarter", limit: 2 }
  });
  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      date: String(row?.date || ""),
      operatingCashFlow: toNumber(row?.operatingCashFlow),
      freeCashFlow: toNumber(row?.freeCashFlow)
    }))
    .filter((row) => row.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function fmpBalanceSheetStatements({ baseUrl, apiKey, symbol }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/balance-sheet-statement",
    apiKey,
    params: { symbol, period: "quarter", limit: 2 }
  });
  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      date: String(row?.date || ""),
      totalDebt: toNumber(row?.totalDebt) ?? ((toNumber(row?.shortTermDebt) || 0) + (toNumber(row?.longTermDebt) || 0)),
      totalStockholdersEquity: toNumber(row?.totalStockholdersEquity ?? row?.totalEquity)
    }))
    .filter((row) => row.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function toRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

async function computeStats({ baseUrl, apiKey, symbol }) {
  const [profile, incomeRows, cashFlowRows, balanceRows] = await Promise.all([
    fmpProfile({ baseUrl, apiKey, symbol }),
    fmpIncomeStatements({ baseUrl, apiKey, symbol }),
    fmpCashFlowStatements({ baseUrl, apiKey, symbol }),
    fmpBalanceSheetStatements({ baseUrl, apiKey, symbol })
  ]);

  const latestIncome = incomeRows[0] || null;
  const priorYearIncome = incomeRows[4] || null;
  const latestCashFlow = cashFlowRows[0] || null;
  const latestBalance = balanceRows[0] || null;

  return {
    symbol,
    companyName: profile.companyName,
    marketCapM: profile.marketCapM,
    reportDate: latestIncome?.date || "",
    revenueGrowthYoY: latestIncome?.revenue && priorYearIncome?.revenue ? ((latestIncome.revenue / priorYearIncome.revenue) - 1) * 100 : null,
    grossMargin: latestIncome ? toPercent(latestIncome.grossProfit, latestIncome.revenue) : null,
    ebitdaM: latestIncome?.ebitda !== null ? latestIncome.ebitda / 1e6 : null,
    ebitdaGrowthYoY: latestIncome?.ebitda && priorYearIncome?.ebitda ? ((latestIncome.ebitda / priorYearIncome.ebitda) - 1) * 100 : null,
    ebitdaMargin: latestIncome ? toPercent(latestIncome.ebitda, latestIncome.revenue) : null,
    operatingMargin: latestIncome ? toPercent(latestIncome.operatingIncome, latestIncome.revenue) : null,
    operatingCashFlowM: latestCashFlow?.operatingCashFlow !== null ? latestCashFlow.operatingCashFlow / 1e6 : null,
    freeCashFlowM: latestCashFlow?.freeCashFlow !== null ? latestCashFlow.freeCashFlow / 1e6 : null,
    debtToEquity: latestBalance ? toRatio(latestBalance.totalDebt, latestBalance.totalStockholdersEquity) : null
  };
}

function passCriteria(row, criteria) {
  if (criteria.minMarketCap !== null && row.marketCapM !== null && row.marketCapM < criteria.minMarketCap) return false;
  if (criteria.minRevenueGrowthYoY !== null && (row.revenueGrowthYoY === null || row.revenueGrowthYoY < criteria.minRevenueGrowthYoY)) return false;
  if (criteria.minGrossMargin !== null && (row.grossMargin === null || row.grossMargin < criteria.minGrossMargin)) return false;
  if (criteria.minEbitdaGrowthYoY !== null && (row.ebitdaGrowthYoY === null || row.ebitdaGrowthYoY < criteria.minEbitdaGrowthYoY)) return false;
  if (criteria.minEbitdaMargin !== null && (row.ebitdaMargin === null || row.ebitdaMargin < criteria.minEbitdaMargin)) return false;
  if (criteria.minOperatingMargin !== null && (row.operatingMargin === null || row.operatingMargin < criteria.minOperatingMargin)) return false;
  if (criteria.requirePositiveOperatingCashFlow && (row.operatingCashFlowM === null || row.operatingCashFlowM <= 0)) return false;
  if (criteria.requirePositiveFreeCashFlow && (row.freeCashFlowM === null || row.freeCashFlowM <= 0)) return false;
  if (criteria.maxDebtToEquity !== null && (row.debtToEquity === null || row.debtToEquity > criteria.maxDebtToEquity)) return false;
  return true;
}

async function main() {
  const apiKey = String(process.env.FMP_API_KEY || "").trim();
  const baseUrl = String(process.env.FMP_BASE_URL || DEFAULT_BASE_URL).trim();
  const limit = parseArgNumber("--limit", DEFAULT_SCAN_LIMIT);
  const concurrency = parseArgNumber("--concurrency", DEFAULT_CONCURRENCY);

  const criteria = {
    minMarketCap: parseArgNumber("--min-market-cap-m", 1000),
    minRevenueGrowthYoY: parseArgNumber("--min-revenue-growth-yoy", 15),
    minGrossMargin: parseArgNumber("--min-gross-margin", 40),
    minEbitdaGrowthYoY: parseArgNumber("--min-ebitda-growth-yoy", null),
    minEbitdaMargin: parseArgNumber("--min-ebitda-margin", null),
    minOperatingMargin: parseArgNumber("--min-operating-margin", 10),
    requirePositiveOperatingCashFlow: true,
    requirePositiveFreeCashFlow: true,
    maxDebtToEquity: parseArgNumber("--max-debt-to-equity", 2)
  };

  console.log("开始测试 FMP 财报筛选...");
  console.log(`数据源：${baseUrl}`);
  console.log(`扫描数量：${limit}`);
  console.log(`并发数：${concurrency}`);
  console.log(`筛选门槛：营收同比 >= ${criteria.minRevenueGrowthYoY}% ，毛利率 >= ${criteria.minGrossMargin}% ，EBITDA同比 ${criteria.minEbitdaGrowthYoY === null ? "不限制" : `>= ${criteria.minEbitdaGrowthYoY}%`} ，EBITDA利润率 ${criteria.minEbitdaMargin === null ? "不限制" : `>= ${criteria.minEbitdaMargin}%`} ，经营利润率 >= ${criteria.minOperatingMargin}% ，经营现金流为正，自由现金流为正，负债权益比 <= ${criteria.maxDebtToEquity}`);

  const candidates = await fmpCompanyScreener({
    baseUrl,
    apiKey,
    params: {
      exchange: "NASDAQ,NYSE",
      marketCapMoreThan: Math.round(criteria.minMarketCap * 1e6),
      limit
    }
  });
  console.log(`候选池拉取完成：${candidates.length} 个`);

  const hits = [];
  for (const group of chunk(candidates, concurrency)) {
    const rows = await Promise.all(group.map(async (item) => {
      const symbol = String(item?.symbol || "").toUpperCase();
      if (!symbol) return null;
      try {
        const row = await computeStats({ baseUrl, apiKey, symbol });
        return { row, ok: passCriteria(row, criteria) };
      } catch (error) {
        console.log(`${symbol} 失败：${describeError(error)}`);
        return null;
      }
    }));
    for (const item of rows) {
      if (!item?.row) continue;
      const { row, ok } = item;
      const label = ok ? "命中" : "未命中";
      console.log(`${row.symbol} ${label} | 营收同比=${row.revenueGrowthYoY?.toFixed?.(1) ?? "-"}% | 毛利率=${row.grossMargin?.toFixed?.(1) ?? "-"}% | EBITDA=${row.ebitdaM?.toFixed?.(0) ?? "-"}M | EBITDA同比=${row.ebitdaGrowthYoY?.toFixed?.(1) ?? "-"}% | EBITDA利润率=${row.ebitdaMargin?.toFixed?.(1) ?? "-"}% | 经营利润率=${row.operatingMargin?.toFixed?.(1) ?? "-"}% | 经营现金流=${row.operatingCashFlowM?.toFixed?.(0) ?? "-"}M | 自由现金流=${row.freeCashFlowM?.toFixed?.(0) ?? "-"}M | 负债权益比=${row.debtToEquity?.toFixed?.(2) ?? "-"}`);
      if (ok) hits.push(row);
    }
  }

  console.log("");
  console.log("测试完成");
  console.log(`命中数量：${hits.length}`);
  if (hits.length > 0) {
    console.log("命中结果：");
    for (const row of hits) {
      console.log(`- ${row.symbol} | ${row.companyName || "-"} | 报告期=${row.reportDate || "-"} | 营收同比=${row.revenueGrowthYoY?.toFixed?.(1) ?? "-"}% | 毛利率=${row.grossMargin?.toFixed?.(1) ?? "-"}% | EBITDA同比=${row.ebitdaGrowthYoY?.toFixed?.(1) ?? "-"}% | EBITDA利润率=${row.ebitdaMargin?.toFixed?.(1) ?? "-"}%`);
    }
  }
}

main().catch((error) => {
  console.error(`FMP 财报筛选测试失败：${describeError(error)}`);
  process.exitCode = 1;
});
