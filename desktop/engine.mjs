import { appendFile, readFile, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";

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

async function readJSON(filePath, fallback) {
  try {
    const txt = await readFile(filePath, "utf-8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function writeJSON(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
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

async function fetchJSON(url, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        body: options.body,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "OpenStock-AlertsDesktop/1.0",
          ...(options.headers || {})
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
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

function appendQuery(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === "") continue;
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

function normalizeHttpBaseUrl(url, fallback) {
  const raw = String(url || fallback || "").trim();
  return raw.replace(/\/+$/, "");
}

function normalizeDeepSeekModel(value) {
  const model = String(value || "").trim();
  return model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "max") return "max";
  return "high";
}

function extractOpenAIText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

async function deepseekChatCompletion({ baseUrl, apiKey, model, thinkingEnabled, reasoningEffort, messages }) {
  if (!apiKey) throw new Error("缺少 DeepSeek API Key，请先在配置页填写");
  const root = normalizeHttpBaseUrl(baseUrl, "https://api.deepseek.com");
  const body = {
    model: normalizeDeepSeekModel(model),
    messages: Array.isArray(messages) ? messages : [],
    stream: false
  };
  if (thinkingEnabled) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = normalizeReasoningEffort(reasoningEffort);
  }
  return fetchJSON(`${root}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
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

function isRecentIsoTime(iso, maxAgeMs) {
  const t = iso ? Date.parse(String(iso)) : NaN;
  return Number.isFinite(t) && nowMs() - t <= maxAgeMs;
}

async function fmpFetchJSON({ baseUrl, pathName, apiKey, params }) {
  if (!apiKey) throw new Error("缺少 FMP API Key，请先在配置页填写");
  const root = normalizeHttpBaseUrl(baseUrl, "https://financialmodelingprep.com");
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
    companyName: String(row?.companyName || row?.companyName || row?.name || ""),
    marketCapM: row?.marketCap !== null && row?.marketCap !== undefined ? Number(row.marketCap) / 1e6 : null,
    ipoDate: String(row?.ipoDate || "")
  };
}

async function fmpIncomeStatements({ baseUrl, apiKey, symbol, period, limit }) {
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

async function fmpCashFlowStatements({ baseUrl, apiKey, symbol, period, limit }) {
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

async function fmpBalanceSheetStatements({ baseUrl, apiKey, symbol, period, limit }) {
  const data = await fmpFetchJSON({
    baseUrl,
    pathName: "/stable/balance-sheet-statement",
    apiKey,
    params: { symbol, period: period || "quarter", limit: limit || 2 }
  });
  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      date: String(row?.date || ""),
      totalDebt: toNumber(row?.totalDebt) ?? (
        (toNumber(row?.shortTermDebt) || 0) + (toNumber(row?.longTermDebt) || 0)
      ),
      totalStockholdersEquity: toNumber(row?.totalStockholdersEquity ?? row?.totalEquity)
    }))
    .filter((row) => row.date)
    .sort((a, b) => b.date.localeCompare(a.date));
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

async function finnhubQuote({ baseUrl, apiKey, symbol }) {
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

async function finnhubCandles({ baseUrl, apiKey, symbol, resolution, fromSec, toSec }) {
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

async function finnhubBasicFinancials({ baseUrl, apiKey, symbol }) {
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

async function finnhubUSSymbols({ baseUrl, apiKey }) {
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

async function loadUniverseUS({ dataPaths, baseUrl, apiKey, force, maxAgeDays, log, provider }) {
  const filePath = dataPaths?.universeUS;
  const maxAgeMs = (Number.isFinite(maxAgeDays) ? maxAgeDays : 7) * 86400 * 1000;
  const now = nowMs();
  const providerName = String(provider || "finnhub");

  if (filePath && !force) {
    const cached = await readJSON(filePath, null);
    const updatedAt = cached?.updatedAt ? Date.parse(String(cached.updatedAt)) : null;
    if (cached && cached.provider === providerName && Array.isArray(cached.symbols) && updatedAt && now - updatedAt <= maxAgeMs) {
      return { symbols: cached.symbols, updatedAt: new Date(updatedAt).toISOString(), source: "cache" };
    }
  }

  let symbols = [];
  if (providerName === "fmp") {
    if (log) log("拉取全量美股标的列表（FMP /stable/company-screener?exchange=NASDAQ,NYSE）...");
    const rows = await fmpCompanyScreener({
      baseUrl,
      apiKey,
      params: { exchange: "NASDAQ,NYSE", limit: 10000 }
    });
    symbols = Array.from(
      new Set(
        rows
          .map((row) => String(row?.symbol || "").trim().toUpperCase())
          .filter((sym) => /^[A-Z0-9.\-]+$/.test(sym))
      )
    );
  } else {
    if (log) log("拉取全量美股标的列表（Finnhub /stock/symbol?exchange=US）...");
    symbols = await finnhubUSSymbols({ baseUrl, apiKey });
  }

  const payload = { updatedAt: new Date().toISOString(), symbols, provider: providerName };
  if (filePath) {
    await writeJSON(filePath, payload);
  }
  if (log) log(`美股标的列表已更新：${symbols.length} 个`);
  return { symbols, updatedAt: payload.updatedAt, source: "remote" };
}

async function loadFmpDefaultUniverse({ dataPaths, baseUrl, apiKey, force, maxAgeDays, log, minMarketCapM }) {
  const filePath = dataPaths?.universeFmpDefault || dataPaths?.universeUS;
  const maxAgeMs = (Number.isFinite(maxAgeDays) ? maxAgeDays : 1) * 86400 * 1000;
  const now = nowMs();
  const minMarketCap = Number.isFinite(Number(minMarketCapM)) ? Number(minMarketCapM) : 10000;

  if (filePath && !force) {
    const cached = await readJSON(filePath, null);
    const updatedAt = cached?.updatedAt ? Date.parse(String(cached.updatedAt)) : null;
    if (
      cached &&
      cached.provider === "fmp-default-universe" &&
      Number(cached.minMarketCapM) === minMarketCap &&
      Array.isArray(cached.rows)
    ) {
      const rows = sortUniverseRowsByMarketCapDesc(cached.rows);
      return {
        rows,
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
        source: updatedAt && now - updatedAt <= maxAgeMs ? "cache" : "snapshot"
      };
    }
  }

  if (log) log(`拉取 FMP 默认规则候选池（NASDAQ+NYSE，市值 >= ${minMarketCap} 百万美元）...`);
  const rows = await fmpCompanyScreener({
    baseUrl,
    apiKey,
    params: {
      exchange: "NASDAQ,NYSE",
      marketCapMoreThan: Math.round(minMarketCap * 1e6),
      limit: 10000
    }
  });

  const normalized = sortUniverseRowsByMarketCapDesc(rows
    .map((row) => ({
      symbol: String(row?.symbol || "").trim().toUpperCase(),
      marketCap: toNumber(row?.marketCap)
    }))
    .filter((row) => row.symbol && /^[A-Z0-9.\-]+$/.test(row.symbol)));

  const payload = {
    updatedAt: new Date().toISOString(),
    provider: "fmp-default-universe",
    minMarketCapM: minMarketCap,
    rows: normalized
  };
  if (filePath) await writeJSON(filePath, payload);
  if (log) log(`FMP 默认规则候选池已更新：${normalized.length} 个，已按市值从高到低固定排序`);
  return { rows: normalized, updatedAt: payload.updatedAt, source: "remote" };
}

async function loadFmpFinancialUniverse({ dataPaths, baseUrl, apiKey, force, maxAgeDays, log, minMarketCapM }) {
  const filePath = dataPaths?.universeFmpFinancial || dataPaths?.universeUS;
  const maxAgeMs = (Number.isFinite(maxAgeDays) ? maxAgeDays : 1) * 86400 * 1000;
  const now = nowMs();
  const minMarketCap = Number.isFinite(Number(minMarketCapM)) ? Number(minMarketCapM) : 0;

  if (filePath && !force) {
    const cached = await readJSON(filePath, null);
    const updatedAt = cached?.updatedAt ? Date.parse(String(cached.updatedAt)) : null;
    if (
      cached &&
      cached.provider === "fmp-financial-universe" &&
      Number(cached.minMarketCapM) === minMarketCap &&
      Array.isArray(cached.rows)
    ) {
      const rows = sortUniverseRowsByMarketCapDesc(cached.rows);
      return {
        rows,
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
        source: updatedAt && now - updatedAt <= maxAgeMs ? "cache" : "snapshot"
      };
    }
  }

  if (log) log(`拉取财报筛选候选池（NASDAQ+NYSE，市值 >= ${minMarketCap} 百万美元）...`);
  const rows = await fmpCompanyScreener({
    baseUrl,
    apiKey,
    params: {
      exchange: "NASDAQ,NYSE",
      marketCapMoreThan: minMarketCap > 0 ? Math.round(minMarketCap * 1e6) : undefined,
      limit: 10000
    }
  });

  const normalized = sortUniverseRowsByMarketCapDesc(rows
    .map((row) => ({
      symbol: String(row?.symbol || "").trim().toUpperCase(),
      marketCap: toNumber(row?.marketCap)
    }))
    .filter((row) => row.symbol && /^[A-Z0-9.\-]+$/.test(row.symbol)));

  const payload = {
    updatedAt: new Date().toISOString(),
    provider: "fmp-financial-universe",
    minMarketCapM: minMarketCap,
    rows: normalized
  };
  if (filePath) await writeJSON(filePath, payload);
  if (log) log(`财报筛选候选池已更新：${normalized.length} 个，已按市值从高到低固定排序`);
  return { rows: normalized, updatedAt: payload.updatedAt, source: "remote" };
}

function sortUniverseRowsByMarketCapDesc(rows) {
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

function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function toRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

async function computeFmpFinancialStats({ baseUrl, apiKey, symbol, state }) {
  state.fmpFinancialStats = state.fmpFinancialStats && typeof state.fmpFinancialStats === "object" ? state.fmpFinancialStats : {};
  const cached = state.fmpFinancialStats[symbol] || null;
  if (cached && isRecentIsoTime(cached.updatedAt, 48 * 3600 * 1000)) {
    return {
      symbol,
      companyName: String(cached.companyName || ""),
      marketCap: toNumber(cached.marketCap),
      reportDate: String(cached.reportDate || ""),
      filingDate: String(cached.filingDate || ""),
      revenueM: toNumber(cached.revenueM),
      revenueGrowthYoY: toNumber(cached.revenueGrowthYoY),
      grossMargin: toNumber(cached.grossMargin),
      ebitdaM: toNumber(cached.ebitdaM),
      ebitdaGrowthYoY: toNumber(cached.ebitdaGrowthYoY),
      ebitdaMargin: toNumber(cached.ebitdaMargin),
      operatingMargin: toNumber(cached.operatingMargin),
      netMargin: toNumber(cached.netMargin),
      operatingCashFlowM: toNumber(cached.operatingCashFlowM),
      freeCashFlowM: toNumber(cached.freeCashFlowM),
      debtToEquity: toNumber(cached.debtToEquity)
    };
  }

  const [profile, incomeRows, cashFlowRows, balanceRows] = await Promise.all([
    fmpProfile({ baseUrl, apiKey, symbol }),
    fmpIncomeStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 5 }),
    fmpCashFlowStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 2 }),
    fmpBalanceSheetStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 2 })
  ]);

  const latestIncome = incomeRows[0] || null;
  const priorYearIncome = incomeRows[4] || null;
  const latestCashFlow = cashFlowRows[0] || null;
  const latestBalance = balanceRows[0] || null;

  const revenueGrowthYoY = latestIncome?.revenue !== null && priorYearIncome?.revenue !== null && priorYearIncome?.revenue
    ? ((latestIncome.revenue / priorYearIncome.revenue) - 1) * 100
    : null;
  const grossMargin = latestIncome ? toPercent(latestIncome.grossProfit, latestIncome.revenue) : null;
  const ebitdaM = latestIncome?.ebitda !== null ? latestIncome.ebitda / 1e6 : null;
  const ebitdaGrowthYoY = latestIncome?.ebitda !== null && priorYearIncome?.ebitda !== null && priorYearIncome?.ebitda
    ? ((latestIncome.ebitda / priorYearIncome.ebitda) - 1) * 100
    : null;
  const ebitdaMargin = latestIncome ? toPercent(latestIncome.ebitda, latestIncome.revenue) : null;
  const operatingMargin = latestIncome ? toPercent(latestIncome.operatingIncome, latestIncome.revenue) : null;
  const netMargin = latestIncome ? toPercent(latestIncome.netIncome, latestIncome.revenue) : null;
  const operatingCashFlowM = latestCashFlow?.operatingCashFlow !== null ? latestCashFlow.operatingCashFlow / 1e6 : null;
  const freeCashFlowM = latestCashFlow?.freeCashFlow !== null ? latestCashFlow.freeCashFlow / 1e6 : null;
  const debtToEquity = latestBalance ? toRatio(latestBalance.totalDebt, latestBalance.totalStockholdersEquity) : null;
  const marketCap = profile.marketCapM;

  state.fmpFinancialStats[symbol] = {
    updatedAt: new Date().toISOString(),
    companyName: profile.companyName,
    marketCap,
    reportDate: latestIncome?.date || "",
    filingDate: latestIncome?.filingDate || "",
    revenueM: latestIncome?.revenue !== null ? latestIncome.revenue / 1e6 : null,
    revenueGrowthYoY,
    grossMargin,
    ebitdaM,
    ebitdaGrowthYoY,
    ebitdaMargin,
    operatingMargin,
    netMargin,
    operatingCashFlowM,
    freeCashFlowM,
    debtToEquity
  };

  return {
    symbol,
    companyName: profile.companyName,
    marketCap,
    reportDate: latestIncome?.date || "",
    filingDate: latestIncome?.filingDate || "",
    revenueM: latestIncome?.revenue !== null ? latestIncome.revenue / 1e6 : null,
    revenueGrowthYoY,
    grossMargin,
    ebitdaM,
    ebitdaGrowthYoY,
    ebitdaMargin,
    operatingMargin,
    netMargin,
    operatingCashFlowM,
    freeCashFlowM,
    debtToEquity
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

function quoteToEvalContext({ symbol, quote, extra }) {
  return {
    symbol,
    price: quote?.price ?? null,
    changePercent: quote?.changePercent ?? null,
    change: quote?.change ?? null,
    prevClose: quote?.prevClose ?? null,
    open: quote?.open ?? null,
    high: quote?.high ?? null,
    low: quote?.low ?? null,
    ...(extra || {})
  };
}

function evaluate(node, ctx, prevCtx) {
  if (node === null || node === undefined) return null;
  if (typeof node === "number") return node;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;

  if (node.var) return ctx[node.var];
  if (node.prev && node.prev.var) return prevCtx ? prevCtx[node.prev.var] : null;

  if (node.op) {
    const op = node.op;
    if (op === "and" || op === "or") {
      const args = Array.isArray(node.args) ? node.args : [];
      const vals = args.map((n) => Boolean(evaluate(n, ctx, prevCtx)));
      return op === "and" ? vals.every(Boolean) : vals.some(Boolean);
    }
    if (op === "not") return !Boolean(evaluate(node.arg, ctx, prevCtx));
    if (op === "crossesAbove" || op === "crossesBelow") {
      const leftNow = toNumber(evaluate(node.left, ctx, prevCtx));
      const rightNow = toNumber(evaluate(node.right, ctx, prevCtx));
      const leftPrev = prevCtx ? toNumber(evaluate(node.left, prevCtx, null)) : null;
      const rightPrev = prevCtx ? toNumber(evaluate(node.right, prevCtx, null)) : null;
      if (leftNow === null || rightNow === null || leftPrev === null || rightPrev === null) return false;
      if (op === "crossesAbove") return leftPrev <= rightPrev && leftNow > rightNow;
      return leftPrev >= rightPrev && leftNow < rightNow;
    }

    const ln = toNumber(evaluate(node.left, ctx, prevCtx));
    const rn = toNumber(evaluate(node.right, ctx, prevCtx));
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

function collectVars(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.var) out.add(String(node.var));
  if (node.prev?.var) out.add(`prev.${String(node.prev.var)}`);
  if (Array.isArray(node.args)) {
    for (const arg of node.args) collectVars(arg, out);
  }
  if (node.left) collectVars(node.left, out);
  if (node.right) collectVars(node.right, out);
  if (node.arg) collectVars(node.arg, out);
  return out;
}

function getFmpUnsupportedVars(rule) {
  const vars = Array.from(collectVars(rule?.condition));
  const supported = new Set(["marketCap", "turnoverM", "recent5dCloseAth"]);
  return vars.filter((name) => !supported.has(name));
}

function isFmpDefaultRuleCompatible(rule) {
  return getFmpUnsupportedVars(rule).length === 0;
}

async function computeHistoryStats({ baseUrl, apiKey, symbol, state }) {
  const nowSec = Math.floor(nowMs() / 1000);
  const recentFromSec = nowSec - 45 * 86400;

  state.historyStats = state.historyStats && typeof state.historyStats === "object" ? state.historyStats : {};
  const cached = state.historyStats[symbol] || null;

  let allTimeHighClose = toNumber(cached?.allTimeHighClose);
  let recentCandles = null;

  if (allTimeHighClose === null) {
    const fullFromSec = Math.floor(new Date("1970-01-01T00:00:00Z").getTime() / 1000);
    const full = await finnhubCandles({ baseUrl, apiKey, symbol, resolution: "D", fromSec: fullFromSec, toSec: nowSec });
    if (!full || !Array.isArray(full.c) || full.c.length === 0) {
      return { allTimeHighClose: null, recent5dCloseAth: null, latestTurnoverM: null };
    }

    allTimeHighClose = Math.max(...full.c);
    const recentClose = full.c.slice(-5);
    const recentVol = full.v.slice(-1);
    recentCandles = {
      c: full.c.slice(-30),
      v: full.v.slice(-30),
      lastClose: recentClose.length > 0 ? recentClose[recentClose.length - 1] : null,
      lastVolume: recentVol.length > 0 ? recentVol[0] : null,
      recent5MaxClose: recentClose.length > 0 ? Math.max(...recentClose) : null
    };
  } else {
    const recent = await finnhubCandles({ baseUrl, apiKey, symbol, resolution: "D", fromSec: recentFromSec, toSec: nowSec });
    if (!recent || !Array.isArray(recent.c) || recent.c.length === 0) {
      return {
        allTimeHighClose,
        recent5dCloseAth: null,
        latestTurnoverM: null
      };
    }

    const recentMax = Math.max(...recent.c);
    if (recentMax > allTimeHighClose) allTimeHighClose = recentMax;
    recentCandles = {
      c: recent.c,
      v: recent.v,
      lastClose: recent.c.length > 0 ? recent.c[recent.c.length - 1] : null,
      lastVolume: recent.v.length > 0 ? recent.v[recent.v.length - 1] : null,
      recent5MaxClose: recent.c.slice(-5).length > 0 ? Math.max(...recent.c.slice(-5)) : null
    };
  }

  const recent5dCloseAth = recentCandles.recent5MaxClose !== null && allTimeHighClose !== null && recentCandles.recent5MaxClose >= allTimeHighClose ? 1 : 0;
  const latestTurnoverM =
    recentCandles.lastClose !== null && recentCandles.lastVolume !== null
      ? (recentCandles.lastClose * recentCandles.lastVolume) / 1e6
      : null;

  state.historyStats[symbol] = {
    allTimeHighClose,
    updatedAt: new Date().toISOString()
  };

  return {
    allTimeHighClose,
    recent5dCloseAth,
    latestTurnoverM
  };
}

async function computeFmpDefaultStats({ baseUrl, apiKey, symbol, state }) {
  state.fmpHistoryStats = state.fmpHistoryStats && typeof state.fmpHistoryStats === "object" ? state.fmpHistoryStats : {};
  const cached = state.fmpHistoryStats[symbol] || null;
  if (cached && isRecentIsoTime(cached.updatedAt, 20 * 3600 * 1000)) {
    return {
      price: toNumber(cached.latestClose),
      marketCap: toNumber(cached.marketCapM),
      turnoverM: toNumber(cached.turnoverM),
      recent5dCloseAth: toNumber(cached.recent5dCloseAth)
    };
  }

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

  state.fmpHistoryStats[symbol] = {
    updatedAt: new Date().toISOString(),
    latestDate: last?.date || "",
    latestClose: last?.close ?? null,
    latestVolume: last?.volume ?? null,
    turnoverM,
    marketCapM: profile.marketCapM,
    recent5dCloseAth
  };

  return {
    price: last?.close ?? null,
    marketCap: profile.marketCapM,
    turnoverM,
    recent5dCloseAth
  };
}

function buildTransport(email) {
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

async function sendEmail(transport, { fromUser, to, subject, text }) {
  if (!transport) throw new Error("Email is not configured");
  const from = `"美股提醒工具" <${fromUser}>`;
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

function formatMessage({ rule, symbol, ctx, conditionText }) {
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

function buildRuleKey(rule) {
  const name = rule.name ? String(rule.name) : "";
  const condition = rule.condition ? stableStringify(rule.condition) : "";
  const symbols = Array.isArray(rule.symbols) ? rule.symbols.map(String).sort().join(",") : "";
  return stableStringify({ name, symbols, condition });
}

function stateKey(ruleKey, symbol) {
  return `${ruleKey}:${symbol}`;
}

async function computeIndicators({ baseUrl, apiKey, symbol, condition, state }) {
  const conditionStr = JSON.stringify(condition || {});
  const needsSma20 = conditionStr.includes("sma20");
  const needsRsi14 = conditionStr.includes("rsi14");
  const needsVolume = conditionStr.includes("volumeRatio") || conditionStr.includes("volumeAvg20");
  const needsMarketCap = conditionStr.includes("marketCap");
  const needsTurnoverM = conditionStr.includes("turnoverM");
  const needsRecent5dCloseAth = conditionStr.includes("recent5dCloseAth");
  if (!needsSma20 && !needsRsi14 && !needsVolume && !needsMarketCap && !needsTurnoverM && !needsRecent5dCloseAth) return {};

  const out = {};

  if (needsSma20 || needsRsi14 || needsVolume) {
    const toSec = Math.floor(nowMs() / 1000);
    const fromSec = toSec - 90 * 86400;
    const candles = await finnhubCandles({ baseUrl, apiKey, symbol, resolution: "D", fromSec, toSec });
    if (candles && candles.c && candles.c.length > 0) {
      if (needsSma20) out.sma20 = sma(candles.c, 20);
      if (needsRsi14) out.rsi14 = rsi(candles.c, 14);
      if (needsVolume) {
        const avg = sma(candles.v, 20);
        const lastV = candles.v.length > 0 ? candles.v[candles.v.length - 1] : null;
        out.volumeAvg20 = avg;
        out.volumeRatio = avg && lastV ? lastV / avg : null;
      }
    }
  }

  if (needsMarketCap) {
    const fin = await finnhubBasicFinancials({ baseUrl, apiKey, symbol }).catch(() => null);
    out.marketCap = fin?.marketCap ?? null;
  }

  if (needsTurnoverM || needsRecent5dCloseAth) {
    const stats = await computeHistoryStats({ baseUrl, apiKey, symbol, state });
    if (needsTurnoverM) out.turnoverM = stats.latestTurnoverM;
    if (needsRecent5dCloseAth) out.recent5dCloseAth = stats.recent5dCloseAth;
  }
  return out;
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

function computeNextDailyRunMs({ timeHHMM, weekdaysOnly }) {
  const t = parseTimeHHMM(timeHHMM);
  if (!t) return null;

  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(t.hh, t.mm, 0, 0);

  const isWeekday = (d) => d.getDay() >= 1 && d.getDay() <= 5;

  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  if (weekdaysOnly) {
    while (!isWeekday(next)) next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

export function createAlertsEngine({ dataPaths, onLog, onEvent }) {
  let timer = null;
  let dailyTimeout = null;
  let busy = false;

  const log = (line) => {
    if (onLog) onLog(String(line));
  };

  const emitEvent = (evt) => {
    if (onEvent) onEvent(evt);
  };

  async function loadConfig() {
    const cfg = await readJSON(dataPaths.config, null);
    return cfg || {
      dataProvider: "fmp",
      finnhubBaseUrl: "https://finnhub.io/api/v1",
      finnhubApiKey: "",
      fmpBaseUrl: "https://financialmodelingprep.com",
      fmpApiKey: "",
      ai: {
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "",
        model: "deepseek-v4-flash",
        thinkingEnabled: false,
        reasoningEffort: "high"
      },
      pollIntervalSec: 60,
      scheduler: { mode: "interval", intervalSec: 60, dailyTime: "09:30", weekdaysOnly: true },
      defaultEmailTo: "",
      email: { provider: "gmail", user: "", pass: "" },
      defaultWebhookUrl: ""
    };
  }

  async function loadRules() {
    const rules = await readJSON(dataPaths.rules, []);
    return Array.isArray(rules) ? rules : [];
  }

  async function loadState() {
    const st = await readJSON(dataPaths.state, {});
    return st && typeof st === "object" ? st : {};
  }

  async function saveState(st) {
    await writeJSON(dataPaths.state, st);
  }

  async function appendEventLine(obj) {
    const line = JSON.stringify(obj) + "\n";
    await appendFile(dataPaths.events, line, "utf-8").catch(() => {});
  }

  async function fireEvent({ rule, symbol, ctx, conditionText, dryRun, state, ruleKey, cooldownSec, notifyEmailTo, notifyWebhookUrl, transport, fromUser }) {
    const sk = stateKey(ruleKey, symbol);
    const prevCtx = state[sk]?.ctx || null;
    const lastFiredAt = state[sk]?.lastFiredAt ? Number(state[sk].lastFiredAt) : null;
    const canFire = !lastFiredAt || (nowMs() - lastFiredAt) >= cooldownSec * 1000;

    state[sk] = { ctx, lastFiredAt: lastFiredAt || null };

    const matched = Boolean(evaluate(rule.condition, ctx, prevCtx));
    if (!matched || !canFire) return false;

    const event = {
      type: "alert",
      provider: String(rule.provider || ""),
      rule: { name: String(rule.name || ""), key: ruleKey, cooldownSec },
      symbol,
      conditionText,
      ctx,
      matchedAt: new Date().toISOString()
    };

    emitEvent(event);
    await appendEventLine(event);

    if (dryRun) {
      log(`DRY_RUN FIRED ${symbol} ${conditionText}`);
      state[sk].lastFiredAt = nowMs();
      return true;
    }

    const message = formatMessage({ rule, symbol, ctx, conditionText });

    if (notifyWebhookUrl) {
      await sendWebhook({ url: notifyWebhookUrl, payload: event }).catch((e) => log(`Webhook error ${symbol} ${e instanceof Error ? e.message : String(e)}`));
    }

    if (notifyEmailTo) {
      await sendEmail(transport, {
        fromUser,
        to: notifyEmailTo,
        subject: `Alert: ${symbol}${rule.name ? ` - ${rule.name}` : ""}`,
        text: message
      }).catch((e) => log(`Email error ${symbol} ${e instanceof Error ? e.message : String(e)}`));
    }

    state[sk].lastFiredAt = nowMs();
    log(`FIRED ${symbol} ${conditionText}`);
    return true;
  }

  async function tick({ dryRun }) {
    if (busy) {
      log("已有任务在运行，已忽略本次请求");
      return;
    }
    busy = true;
    try {
      log(`开始${dryRun ? "dry-run" : "执行"}...`);
      const cfg = await loadConfig();
      const rules = (await loadRules()).filter((r) => r && r.enabled);
      const state = await loadState();
      log(`本轮启用规则 ${rules.length} 条，数据源=${String(cfg.dataProvider || "finnhub").toUpperCase()}`);

      const dataProvider = String(cfg.dataProvider || "finnhub").toLowerCase();
      const finnhubBaseUrl = normalizeHttpBaseUrl(cfg.finnhubBaseUrl, "https://finnhub.io/api/v1");
      const finnhubApiKey = String(cfg.finnhubApiKey || "");
      const fmpBaseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
      const fmpApiKey = String(cfg.fmpApiKey || "");
      const transport = buildTransport(cfg.email);
      const fromUser = String(cfg.email?.user || "");
      const defaultEmailTo = String(cfg.defaultEmailTo || "");
      const defaultWebhookUrl = String(cfg.defaultWebhookUrl || "");

      for (const rule of rules) {
        const universe = rule.universe || { type: "manual" };
        const manualSymbols = Array.isArray(rule.symbols) ? rule.symbols.map((s) => String(s).toUpperCase()).filter(Boolean) : [];
        const useUniverse = String(universe.type || "manual") === "us_all";

        const ruleCooldownSec = Number.parseInt(String(rule.cooldownSec || ""), 10);
        const cooldownSec = Number.isFinite(ruleCooldownSec) ? ruleCooldownSec : 900;
        const conditionText = summarizeCondition(rule.condition);
        const ruleKey = buildRuleKey(rule);

        const notifyEmailTo = String(rule.notify?.email || defaultEmailTo || "");
        const notifyWebhookUrl = String(rule.notify?.webhookUrl || defaultWebhookUrl || "");

        if (dataProvider === "fmp") {
          if (!isFmpDefaultRuleCompatible(rule)) {
            log(`FMP 模式暂只支持默认规则字段，已跳过规则：${rule.name || "未命名规则"}`);
            continue;
          }

          let fmpRows = [];
          if (useUniverse) {
            const minMarketCap = toNumber(universe.minMarketCap) ?? 10000;
            log(`规则 ${rule.name || "未命名规则"}：准备加载 FMP 候选池...`);
            const meta = await loadFmpDefaultUniverse({
              dataPaths,
              baseUrl: fmpBaseUrl,
              apiKey: fmpApiKey,
              force: false,
              maxAgeDays: 1,
              log,
              minMarketCapM: minMarketCap
            });
            const list = meta.rows;
            const maxScan = Number.parseInt(String(universe.maxScan ?? "2000"), 10);
            const scanCount = Number.isFinite(maxScan) ? maxScan : 2000;
            const end = Math.min(list.length, scanCount);
            fmpRows = list.slice(0, end);
            log(`规则 ${rule.name || "未命名规则"}：FMP 候选池 ${list.length} 支（按市值从高到低，来源=${meta.source}），本轮固定扫描前 ${fmpRows.length} 支`);
          } else {
            fmpRows = manualSymbols.map((symbol) => ({ symbol, marketCap: null }));
            log(`规则 ${rule.name || "未命名规则"}：手动标的 ${fmpRows.length} 支`);
          }

          let processedFmp = 0;
          for (const rowsBatch of chunk(fmpRows, 2)) {
            const batchResults = await Promise.all(rowsBatch.map(async (row) => {
              const symbol = String(row?.symbol || "").toUpperCase();
              if (!symbol) return null;
              const stats = await computeFmpDefaultStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol, state }).catch((e) => {
                log(`FMP error ${symbol} ${e instanceof Error ? e.message : String(e)}`);
                return null;
              });
              return stats ? { row, symbol, stats } : null;
            }));

            processedFmp += rowsBatch.length;
            log(`规则 ${rule.name || "未命名规则"}：FMP 进度 ${Math.min(processedFmp, fmpRows.length)}/${fmpRows.length}`);
            for (const result of batchResults) {
              if (!result) continue;
              const { row, symbol, stats } = result;
              const minPrice = useUniverse ? toNumber(universe.minPrice) : null;
              const minMarketCap = useUniverse ? toNumber(universe.minMarketCap) : null;
              if (minPrice !== null && stats.price !== null && stats.price < minPrice) continue;
              if (minMarketCap !== null && stats.marketCap !== null && stats.marketCap < minMarketCap) continue;

              const ctx = {
                symbol,
                price: stats.price,
                marketCap: stats.marketCap ?? toNumber(row?.marketCap),
                turnoverM: stats.turnoverM,
                recent5dCloseAth: stats.recent5dCloseAth,
                changePercent: null,
                change: null,
                prevClose: null,
                open: null,
                high: null,
                low: null
              };

              await fireEvent({
                rule,
                symbol,
                ctx,
                conditionText,
                dryRun,
                state,
                ruleKey,
                cooldownSec,
                notifyEmailTo,
                notifyWebhookUrl,
                transport,
                fromUser
              });
            }
          }
          continue;
        }

        let symbols = manualSymbols;
        if (useUniverse) {
          log(`规则 ${rule.name || "未命名规则"}：准备加载 Finnhub 标的池...`);
          const universeMeta = await loadUniverseUS({
            dataPaths,
            baseUrl: finnhubBaseUrl,
            apiKey: finnhubApiKey,
            force: false,
            maxAgeDays: 7,
            log,
            provider: "finnhub"
          });
          const list = universeMeta.symbols;
          const maxScan = Number.parseInt(String(universe.maxScan ?? "2000"), 10);
          const scanCount = Number.isFinite(maxScan) ? maxScan : 2000;

          const end = Math.min(list.length, scanCount);
          symbols = list.slice(0, end);
          log(`规则 ${rule.name || "未命名规则"}：Finnhub 标的池 ${list.length} 支，本轮固定扫描前 ${symbols.length} 支`);
        } else {
          log(`规则 ${rule.name || "未命名规则"}：手动标的 ${symbols.length} 支`);
        }

        if (!symbols || symbols.length === 0) continue;

        let processedFinnhub = 0;
        for (const symbolsBatch of chunk(symbols, 25)) {
          const quotes = await Promise.all(symbolsBatch.map(async (symbol) => ({ symbol, quote: await finnhubQuote({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol }) })));
          processedFinnhub += symbolsBatch.length;
          log(`规则 ${rule.name || "未命名规则"}：Finnhub 进度 ${Math.min(processedFinnhub, symbols.length)}/${symbols.length}`);

          for (const { symbol, quote } of quotes) {
            if (!quote || quote.price === null) continue;

            if (useUniverse) {
              const minPrice = toNumber(universe.minPrice);
              const minMarketCap = toNumber(universe.minMarketCap);
              const minVolumeRatio = toNumber(universe.minVolumeRatio);
              if (minPrice !== null && quote.price !== null && quote.price < minPrice) continue;

              let extra = {};
              if (minMarketCap !== null) {
                const fin = await finnhubBasicFinancials({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol }).catch(() => null);
                if (!fin || fin.marketCap === null) continue;
                if (fin.marketCap < minMarketCap) continue;
                extra.marketCap = fin.marketCap;
              }

              if (minVolumeRatio !== null) {
                const volInd = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: { volumeRatio: true }, state }).catch(() => ({}));
                const vr = toNumber(volInd.volumeRatio);
                if (vr === null) continue;
                if (vr < minVolumeRatio) continue;
                extra.volumeRatio = vr;
              }

              const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: rule.condition, state });
              const merged = { ...extra, ...indicators };
              const ctx = quoteToEvalContext({ symbol, quote, extra: merged });
              await fireEvent({
                rule,
                symbol,
                ctx,
                conditionText,
                dryRun,
                state,
                ruleKey,
                cooldownSec,
                notifyEmailTo,
                notifyWebhookUrl,
                transport,
                fromUser
              });
              continue;
            }

            const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: rule.condition, state });
            const ctx = buildEvalContext({ symbol, quote, indicators });
            await fireEvent({
              rule,
              symbol,
              ctx,
              conditionText,
              dryRun,
              state,
              ruleKey,
              cooldownSec,
              notifyEmailTo,
              notifyWebhookUrl,
              transport,
              fromUser
            });
          }
        }
      }

      await saveState(state);
      log(`${dryRun ? "dry-run" : "执行"}完成`);
    } catch (e) {
      log(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      busy = false;
    }
  }

  return {
    start: () => {
      if (timer || dailyTimeout) return;
      const startLoop = async () => {
        const cfg = await loadConfig();
        const scheduler = cfg.scheduler || { mode: "interval", intervalSec: cfg.pollIntervalSec || 60, dailyTime: "09:30", weekdaysOnly: true };
        const mode = String(scheduler.mode || "interval");

        const intervalSec = Number.parseInt(String(scheduler.intervalSec ?? cfg.pollIntervalSec ?? "60"), 10);
        const intervalMs = (Number.isFinite(intervalSec) ? intervalSec : 60) * 1000;

        const dailyTime = String(scheduler.dailyTime || "09:30");
        const weekdaysOnly = Boolean(scheduler.weekdaysOnly);

        if (mode === "daily") {
          const scheduleNext = async () => {
            await tick({ dryRun: false });
            const delayMsAfterTick = computeNextDailyRunMs({ timeHHMM: dailyTime, weekdaysOnly });
            if (delayMsAfterTick === null) {
              log("Invalid dailyTime, fallback to interval mode");
              timer = setInterval(() => tick({ dryRun: false }), intervalMs);
              return;
            }

            dailyTimeout = setTimeout(() => {
              scheduleNext().catch((e) => log(e instanceof Error ? e.message : String(e)));
            }, delayMsAfterTick);
          };

          await scheduleNext();
          return;
        }

        await tick({ dryRun: false });
        timer = setInterval(() => tick({ dryRun: false }), intervalMs);
      };

      startLoop().catch((e) => log(e instanceof Error ? e.message : String(e)));
      log("Engine started");
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (dailyTimeout) {
        clearTimeout(dailyTimeout);
        dailyTimeout = null;
      }
      log("Engine stopped");
    },
    runOnce: async ({ dryRun }) => {
      await tick({ dryRun: Boolean(dryRun) });
    },
    runScreener: async ({ symbols, criteria }) => {
      const cfg = await loadConfig();
      const dataProvider = String(cfg.dataProvider || "finnhub").toLowerCase();
      const finnhubBaseUrl = normalizeHttpBaseUrl(cfg.finnhubBaseUrl, "https://finnhub.io/api/v1");
      const finnhubApiKey = String(cfg.finnhubApiKey || "");
      const fmpBaseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
      const fmpApiKey = String(cfg.fmpApiKey || "");
      const inputSymbols = Array.isArray(symbols) ? symbols.map((s) => String(s).toUpperCase()).filter(Boolean) : [];
      const c = criteria || {};

      const useUniverse = String(c.universe || "").toLowerCase() === "us_all";
      const maxScan = Number.parseInt(String(c.maxScan ?? "500"), 10);
      const scanCount = Number.isFinite(maxScan) ? maxScan : 500;

      const st = await loadState();

      let list = inputSymbols;
      let universeMeta = null;
      if (useUniverse) {
        if (dataProvider === "fmp") {
          universeMeta = await loadFmpDefaultUniverse({
            dataPaths,
            baseUrl: fmpBaseUrl,
            apiKey: fmpApiKey,
            force: Boolean(c.forceRefreshUniverse),
            maxAgeDays: 1,
            log,
            minMarketCapM: toNumber(c.minMarketCap) ?? 0
          });
          list = universeMeta.rows;
        } else {
          universeMeta = await loadUniverseUS({
            dataPaths,
            baseUrl: finnhubBaseUrl,
            apiKey: finnhubApiKey,
            force: Boolean(c.forceRefreshUniverse),
            maxAgeDays: 7,
            log,
            provider: "finnhub"
          });
          list = universeMeta.symbols;
        }
      }

      const minPrice = toNumber(c.minPrice);
      const maxPrice = toNumber(c.maxPrice);
      const minMarketCap = toNumber(c.minMarketCap);
      const minTurnoverM = toNumber(c.minTurnoverM);
      const maxMarketCap = toNumber(c.maxMarketCap);
      const minChangePercent = toNumber(c.minChangePercent);
      const maxChangePercent = toNumber(c.maxChangePercent);
      const minVolumeRatio = toNumber(c.minVolumeRatio);
      const requireRecent5dCloseAth = Boolean(c.requireRecent5dCloseAth);

      const out = [];
      const start = 0;
      const end = Math.min(list.length, scanCount);
      const slice = list.slice(0, end);

      for (const batch of chunk(slice, dataProvider === "fmp" ? 2 : 1)) {
        const rowsBatch = dataProvider === "fmp"
          ? (await Promise.all(batch.map(async (item) => {
            try {
              const sym = typeof item === "string" ? item : String(item?.symbol || "").toUpperCase();
              if (!sym) return null;
              const stats = await computeFmpDefaultStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol: sym, state: st }).catch(() => null);
              if (!stats || stats.price === null) return null;
              const row = {
                symbol: sym,
                price: stats.price,
                changePercent: null,
                marketCap: stats.marketCap ?? toNumber(item?.marketCap),
                peTTM: null,
                volumeAvg20: null,
                volumeRatio: null,
                turnoverM: stats.turnoverM,
                recent5dCloseAth: stats.recent5dCloseAth
              };
              if (minPrice !== null && row.price !== null && row.price < minPrice) return null;
              if (maxPrice !== null && row.price !== null && row.price > maxPrice) return null;
              if (minMarketCap !== null && row.marketCap !== null && row.marketCap < minMarketCap) return null;
              if (maxMarketCap !== null && row.marketCap !== null && row.marketCap > maxMarketCap) return null;
              if (minTurnoverM !== null && row.turnoverM !== null && row.turnoverM < minTurnoverM) return null;
              if (requireRecent5dCloseAth && !row.recent5dCloseAth) return null;
              return row;
            } catch (e) {
              const label = typeof item === "string" ? item : item?.symbol;
              log(`Screener error ${label} ${e instanceof Error ? e.message : String(e)}`);
              return null;
            }
          }))).filter(Boolean)
          : [];

        if (dataProvider !== "fmp") {
          for (const item of batch) {
            try {
              const sym = typeof item === "string" ? item : String(item?.symbol || "").toUpperCase();
              if (!sym) continue;
              const quote = await finnhubQuote({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol: sym });
              if (!quote || quote.price === null) continue;

              const fin = await finnhubBasicFinancials({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol: sym }).catch(() => null);
              const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol: sym, condition: { volumeRatio: true }, state: st }).catch(() => ({}));

              const row = {
                symbol: sym,
                price: quote.price,
                changePercent: quote.changePercent,
                marketCap: fin ? fin.marketCap : null,
                peTTM: fin ? fin.peTTM : null,
                volumeAvg20: indicators.volumeAvg20 ?? null,
                volumeRatio: indicators.volumeRatio ?? null
              };

              if (minPrice !== null && row.price !== null && row.price < minPrice) continue;
              if (maxPrice !== null && row.price !== null && row.price > maxPrice) continue;
              if (minChangePercent !== null && row.changePercent !== null && row.changePercent < minChangePercent) continue;
              if (maxChangePercent !== null && row.changePercent !== null && row.changePercent > maxChangePercent) continue;
              if (minMarketCap !== null && row.marketCap !== null && row.marketCap < minMarketCap) continue;
              if (maxMarketCap !== null && row.marketCap !== null && row.marketCap > maxMarketCap) continue;
              if (minVolumeRatio !== null && row.volumeRatio !== null && row.volumeRatio < minVolumeRatio) continue;

              rowsBatch.push(row);
            } catch (e) {
              const label = typeof item === "string" ? item : item?.symbol;
              log(`Screener error ${label} ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
        out.push(...rowsBatch);
      }

      return {
        rows: out,
        meta: {
          universe: useUniverse ? "us_all" : "manual",
          totalSymbols: list.length,
          scannedFrom: start,
          scannedTo: end,
          scannedCount: slice.length,
          nextCursor: null,
          universeUpdatedAt: universeMeta?.updatedAt || null,
          universeSource: universeMeta?.source || null,
          order: useUniverse && String(cfg.dataProvider || "finnhub").toLowerCase() === "fmp" ? "marketCap_desc" : null
        }
      };
    },
    explainFinancialRow: async ({ row }) => {
      const cfg = await loadConfig();
      const ai = cfg?.ai && typeof cfg.ai === "object" ? cfg.ai : {};
      const provider = String(ai.provider || "deepseek").toLowerCase();
      if (provider !== "deepseek") {
        throw new Error(`当前桌面端仅支持 DeepSeek，收到 provider=${provider}`);
      }

      const payload = row && typeof row === "object" ? row : null;
      if (!payload || !payload.symbol) {
        throw new Error("缺少可解读的财报结果");
      }

      const model = normalizeDeepSeekModel(ai.model);
      const thinkingEnabled = Boolean(ai.thinkingEnabled);
      const reasoningEffort = normalizeReasoningEffort(ai.reasoningEffort);
      const metrics = {
        symbol: String(payload.symbol || ""),
        companyName: String(payload.companyName || ""),
        reportDate: String(payload.reportDate || ""),
        filingDate: String(payload.filingDate || ""),
        marketCapM: toNumber(payload.marketCap),
        revenueM: toNumber(payload.revenueM),
        revenueGrowthYoY: toNumber(payload.revenueGrowthYoY),
        grossMargin: toNumber(payload.grossMargin),
        ebitdaM: toNumber(payload.ebitdaM),
        ebitdaGrowthYoY: toNumber(payload.ebitdaGrowthYoY),
        ebitdaMargin: toNumber(payload.ebitdaMargin),
        operatingMargin: toNumber(payload.operatingMargin),
        netMargin: toNumber(payload.netMargin),
        operatingCashFlowM: toNumber(payload.operatingCashFlowM),
        freeCashFlowM: toNumber(payload.freeCashFlowM),
        debtToEquity: toNumber(payload.debtToEquity),
        reasons: Array.isArray(payload.reasons) ? payload.reasons.map((x) => String(x)) : []
      };

      const messages = [
        {
          role: "system",
          content:
            "你是严谨的美股财报分析助手。只允许基于提供的结构化数据做中文判断，不要编造公司新闻、行业故事或管理层表述。输出保持控制台风格，直接、量化、去宣传化。"
        },
        {
          role: "user",
          content:
            `请基于以下结构化财报数据，给出一份简短但有判断力的中文解读。\n` +
            `要求：\n` +
            `1. 明确一句结论，说明这家公司当前财报质量偏强、一般还是偏弱。\n` +
            `2. 用“优势”“风险”“后续跟踪”三个小节输出。\n` +
            `3. 每个小节最多 3 条，每条尽量量化。\n` +
            `4. 不要复述无意义套话，不要使用营销口吻。\n` +
            `5. 如果信息不足，直接指出缺口。\n\n` +
            `结构化数据：\n${JSON.stringify(metrics, null, 2)}`
        }
      ];

      const data = await deepseekChatCompletion({
        baseUrl: ai.baseUrl,
        apiKey: String(ai.apiKey || ""),
        model,
        thinkingEnabled,
        reasoningEffort,
        messages
      });
      const text = extractOpenAIText(data);
      if (!text) {
        throw new Error("DeepSeek 未返回可读内容");
      }
      return {
        text,
        meta: {
          provider: "deepseek",
          model,
          thinkingEnabled,
          reasoningEffort: thinkingEnabled ? reasoningEffort : null
        }
      };
    },
    runFinancialScreener: async ({ symbols, criteria }) => {
      const cfg = await loadConfig();
      const fmpBaseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
      const fmpApiKey = String(cfg.fmpApiKey || "");
      const inputSymbols = Array.isArray(symbols) ? symbols.map((s) => String(s).toUpperCase()).filter(Boolean) : [];
      const c = criteria || {};
      const useUniverse = String(c.universe || "").toLowerCase() === "us_all";
      const maxScan = Number.parseInt(String(c.maxScan ?? "100"), 10);
      const scanCount = Number.isFinite(maxScan) ? maxScan : 100;
      const minMarketCap = toNumber(c.minMarketCap);
      const minRevenueGrowthYoY = toNumber(c.minRevenueGrowthYoY);
      const minGrossMargin = toNumber(c.minGrossMargin);
      const minEbitdaGrowthYoY = toNumber(c.minEbitdaGrowthYoY);
      const minEbitdaMargin = toNumber(c.minEbitdaMargin);
      const minOperatingMargin = toNumber(c.minOperatingMargin);
      const requirePositiveOperatingCashFlow = Boolean(c.requirePositiveOperatingCashFlow);
      const requirePositiveFreeCashFlow = Boolean(c.requirePositiveFreeCashFlow);
      const maxDebtToEquity = toNumber(c.maxDebtToEquity);

      const st = await loadState();
      let list = inputSymbols;
      let universeMeta = null;
      if (useUniverse) {
        universeMeta = await loadFmpFinancialUniverse({
          dataPaths,
          baseUrl: fmpBaseUrl,
          apiKey: fmpApiKey,
          force: Boolean(c.forceRefreshUniverse),
          maxAgeDays: 1,
          log,
          minMarketCapM: minMarketCap ?? 0
        });
        list = universeMeta.rows;
      }

      const out = [];
      const slice = list.slice(0, Math.min(list.length, scanCount));
      for (const batch of chunk(slice, 2)) {
        const rowsBatch = await Promise.all(batch.map(async (item) => {
          const sym = typeof item === "string" ? item : String(item?.symbol || "").toUpperCase();
          if (!sym) return null;
          try {
            const stats = await computeFmpFinancialStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol: sym, state: st });
            const row = {
              symbol: sym,
              companyName: stats.companyName,
              reportDate: stats.reportDate,
              filingDate: stats.filingDate,
              marketCap: stats.marketCap ?? toNumber(item?.marketCap),
              revenueM: stats.revenueM,
              revenueGrowthYoY: stats.revenueGrowthYoY,
              grossMargin: stats.grossMargin,
              ebitdaM: stats.ebitdaM,
              ebitdaGrowthYoY: stats.ebitdaGrowthYoY,
              ebitdaMargin: stats.ebitdaMargin,
              operatingMargin: stats.operatingMargin,
              netMargin: stats.netMargin,
              operatingCashFlowM: stats.operatingCashFlowM,
              freeCashFlowM: stats.freeCashFlowM,
              debtToEquity: stats.debtToEquity,
              reasons: []
            };

            if (minMarketCap !== null && row.marketCap !== null && row.marketCap < minMarketCap) return null;
            if (minRevenueGrowthYoY !== null) {
              if (row.revenueGrowthYoY === null || row.revenueGrowthYoY < minRevenueGrowthYoY) return null;
              row.reasons.push(`营收同比 ${row.revenueGrowthYoY.toFixed(1)}%`);
            }
            if (minGrossMargin !== null) {
              if (row.grossMargin === null || row.grossMargin < minGrossMargin) return null;
              row.reasons.push(`毛利率 ${row.grossMargin.toFixed(1)}%`);
            }
            if (minEbitdaGrowthYoY !== null) {
              if (row.ebitdaGrowthYoY === null || row.ebitdaGrowthYoY < minEbitdaGrowthYoY) return null;
              row.reasons.push(`EBITDA同比 ${row.ebitdaGrowthYoY.toFixed(1)}%`);
            }
            if (minEbitdaMargin !== null) {
              if (row.ebitdaMargin === null || row.ebitdaMargin < minEbitdaMargin) return null;
              row.reasons.push(`EBITDA利润率 ${row.ebitdaMargin.toFixed(1)}%`);
            }
            if (minOperatingMargin !== null) {
              if (row.operatingMargin === null || row.operatingMargin < minOperatingMargin) return null;
              row.reasons.push(`经营利润率 ${row.operatingMargin.toFixed(1)}%`);
            }
            if (requirePositiveOperatingCashFlow) {
              if (row.operatingCashFlowM === null || row.operatingCashFlowM <= 0) return null;
              row.reasons.push(`经营现金流 ${row.operatingCashFlowM.toFixed(0)}M`);
            }
            if (requirePositiveFreeCashFlow) {
              if (row.freeCashFlowM === null || row.freeCashFlowM <= 0) return null;
              row.reasons.push(`自由现金流 ${row.freeCashFlowM.toFixed(0)}M`);
            }
            if (maxDebtToEquity !== null) {
              if (row.debtToEquity === null || row.debtToEquity > maxDebtToEquity) return null;
              row.reasons.push(`负债权益比 ${row.debtToEquity.toFixed(2)}x`);
            }
            return row;
          } catch (e) {
            log(`Financial screener error ${sym} ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }
        }));
        out.push(...rowsBatch.filter(Boolean));
      }

      await saveState(st);
      return {
        rows: out,
        meta: {
          universe: useUniverse ? "us_all" : "manual",
          totalSymbols: list.length,
          scannedCount: slice.length,
          universeUpdatedAt: universeMeta?.updatedAt || null,
          universeSource: universeMeta?.source || null,
          order: useUniverse ? "marketCap_desc" : null
        }
      };
    }
  };
}
