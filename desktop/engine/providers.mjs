import { fetchJSON, normalizeHttpBaseUrl, toNumber } from "../shared-runtime.mjs";
import { appendQuery } from "./shared.mjs";

export async function fmpFetchJSON({ baseUrl, pathName, apiKey, params }) {
  if (!apiKey) throw new Error("缺少 FMP API Key，请先在配置页填写");
  const root = normalizeHttpBaseUrl(baseUrl, "https://financialmodelingprep.com");
  const url = appendQuery(`${root}${pathName}`, { ...(params || {}), apikey: apiKey });
  return fetchJSON(url);
}

export async function fmpCompanyScreener({ baseUrl, apiKey, params }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/company-screener",
    apiKey,
    params
  });
  return Array.isArray(data) ? data : [];
}

export async function fmpProfile({ baseUrl, apiKey, symbol }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/profile",
    apiKey,
    params: { symbol }
  });
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return {
    symbol: String(row?.symbol || symbol || "").toUpperCase(),
    companyName: String(row?.companyName || row?.name || ""),
    marketCapM: row?.marketCap !== null && row?.marketCap !== undefined ? Number(row.marketCap) / 1e6 : null,
    ipoDate: String(row?.ipoDate || "")
  };
}

export async function fmpIncomeStatements({ baseUrl, apiKey, symbol, period, limit }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/income-statement",
    apiKey,
    params: { symbol, period: period || "quarter", limit: limit || 5 }
  });
  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      date: String(row?.date || ""),
      filingDate: String(row?.filingDate || ""),
      revenue: toNumber(row?.revenue),
      grossProfit: toNumber(row?.grossProfit),
      ebitda: toNumber(row?.ebitda),
      operatingIncome: toNumber(row?.operatingIncome),
      netIncome: toNumber(row?.netIncome)
    }))
    .filter((row) => row.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function fmpCashFlowStatements({ baseUrl, apiKey, symbol, period, limit }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/cash-flow-statement",
    apiKey,
    params: { symbol, period: period || "quarter", limit: limit || 2 }
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

export async function fmpBalanceSheetStatements({ baseUrl, apiKey, symbol, period, limit }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/balance-sheet-statement",
    apiKey,
    params: { symbol, period: period || "quarter", limit: limit || 2 }
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

export async function fmpHistoricalPriceEodFull({ baseUrl, apiKey, symbol, from, to }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/historical-price-eod/full",
    apiKey,
    params: { symbol, from, to }
  });
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.historical) ? data.historical : []);
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

export async function finnhubQuote({ baseUrl, apiKey, symbol }) {
  if (!apiKey) throw new Error("Finnhub API Key is missing");
  const url = `${baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
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

export async function finnhubCandles({ baseUrl, apiKey, symbol, resolution, fromSec, toSec }) {
  if (!apiKey) throw new Error("Finnhub API Key is missing");
  const url = `${baseUrl}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(apiKey)}`;
  const data = await fetchJSON(url);
  if (!data || data.s !== "ok") return null;
  return {
    t: Array.isArray(data.t) ? data.t.map(toNumber).filter((x) => x !== null) : [],
    c: Array.isArray(data.c) ? data.c.map(toNumber).filter((x) => x !== null) : [],
    v: Array.isArray(data.v) ? data.v.map(toNumber).filter((x) => x !== null) : []
  };
}

export async function finnhubBasicFinancials({ baseUrl, apiKey, symbol }) {
  if (!apiKey) throw new Error("Finnhub API Key is missing");
  const url = `${baseUrl}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${encodeURIComponent(apiKey)}`;
  const data = await fetchJSON(url);
  const metric = data?.metric || {};
  return {
    marketCap: toNumber(metric.marketCapitalization),
    peTTM: toNumber(metric.peTTM),
    epsTTM: toNumber(metric.epsTTM),
    week52High: toNumber(metric["52WeekHigh"]),
    week52Low: toNumber(metric["52WeekLow"])
  };
}

export async function finnhubUSSymbols({ baseUrl, apiKey }) {
  if (!apiKey) throw new Error("Finnhub API Key is missing");
  const url = `${baseUrl}/stock/symbol?exchange=US&token=${encodeURIComponent(apiKey)}`;
  const data = await fetchJSON(url);
  if (!Array.isArray(data)) return [];
  const symbols = [];
  for (const row of data) {
    const sym = String(row?.symbol || "").trim().toUpperCase();
    if (!sym) continue;
    if (!/^[A-Z0-9.\-]+$/.test(sym)) continue;
    symbols.push(sym);
  }
  return Array.from(new Set(symbols));
}

