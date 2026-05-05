import { toNumber } from "../shared-runtime.mjs";
import {
  isRecentIsoTime,
  isoDateShiftDays,
  isoDateShiftYears,
  isoDateToday,
  nowMs,
  readJSON,
  sortUniverseRowsByMarketCapDesc,
  toPercent,
  toRatio,
  writeJSON
} from "./shared.mjs";
import {
  finnhubUSSymbols,
  fmpBalanceSheetStatements,
  fmpCashFlowStatements,
  fmpCompanyScreener,
  fmpHistoricalPriceEodFull,
  fmpIncomeStatements,
  fmpProfile
} from "./providers.mjs";

export async function loadUniverseUS({ dataPaths, baseUrl, apiKey, force, maxAgeDays, log, provider }) {
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
  if (filePath) await writeJSON(filePath, payload);
  if (log) log(`美股标的列表已更新：${symbols.length} 个`);
  return { symbols, updatedAt: payload.updatedAt, source: "remote" };
}

export async function loadFmpDefaultUniverse({ dataPaths, baseUrl, apiKey, force, maxAgeDays, log, minMarketCapM }) {
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

export async function loadFmpFinancialUniverse({ dataPaths, baseUrl, apiKey, force, maxAgeDays, log, minMarketCapM }) {
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

export async function computeFmpFinancialStats({ baseUrl, apiKey, symbol, state }) {
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

export async function computeFmpDefaultStats({ baseUrl, apiKey, symbol, state }) {
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
  const recent5Highs = recent5.map((row) => row.high ?? row.close).filter((value) => value !== null);
  const recent5MaxHigh = recent5Highs.length > 0 ? Math.max(...recent5Highs) : null;
  const turnoverM = last?.close !== null && last?.volume !== null ? (last.close * last.volume) / 1e6 : null;

  const recentHistoryHighs = recentHistory.map((row) => row.high ?? row.close).filter((value) => value !== null);
  const recentChunkMax = recentHistoryHighs.length > 0 ? Math.max(...recentHistoryHighs) : null;
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
      const olderHighs = olderRows.map((row) => row.high ?? row.close).filter((value) => value !== null);
      const olderMax = olderHighs.length > 0 ? Math.max(...olderHighs) : null;
      if (recent5MaxHigh !== null && olderMax !== null && olderMax > recent5MaxHigh) {
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

