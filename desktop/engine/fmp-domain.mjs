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

function hasAllKeys(record, keys) {
  return Boolean(record) && keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function normalizeIsoDate(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function computeGrowthPercent(currentValue, priorValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(priorValue) || priorValue === 0) return null;
  return ((currentValue / priorValue) - 1) * 100;
}

function computeDelta(currentValue, priorValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(priorValue)) return null;
  return currentValue - priorValue;
}

function buildFieldMeta({ value, source, reason, ...extra }) {
  return {
    source,
    status: value === null ? "missing" : "ok",
    reason: value === null ? String(reason || "unavailable") : null,
    ...extra
  };
}

function collectMissingFields(fieldMeta) {
  return Object.entries(fieldMeta || {})
    .filter(([, meta]) => !meta || meta.status !== "ok")
    .map(([name]) => name);
}

function mergeMissingFields(...lists) {
  return Array.from(new Set(lists.flat().filter(Boolean)));
}

function detectFundLikeSecurity(profile, symbol, incomeRows) {
  const name = String(profile?.companyName || "").toUpperCase();
  const symbolUpper = String(symbol || "").toUpperCase();
  const nameLooksFundLike = /\b(ETF|ETN|FUND|PORTFOLIO|MUTUAL|INDEX)\b/.test(name);
  const shareClassFundLike = symbolUpper.endsWith("X") && /\b(SHARES|INVESTOR|ADMIRAL|INSTITUTIONAL|INDEX|FUND)\b/.test(name);
  const explicitFlag = Boolean(profile?.isEtf) || Boolean(profile?.isFund);
  const noIncomeStatements = !Array.isArray(incomeRows) || incomeRows.length === 0;
  const isFundLike = explicitFlag || nameLooksFundLike || shareClassFundLike;
  return {
    isFundLike,
    shouldSkipFinancialRules: isFundLike && noIncomeStatements,
    reason: isFundLike
      ? (noIncomeStatements ? "fund_like_security_without_income_statement" : "fund_like_security")
      : ""
  };
}

async function computeFmpPriceStats({ baseUrl, apiKey, symbol, state }) {
  state.fmpHistoryStats = state.fmpHistoryStats && typeof state.fmpHistoryStats === "object" ? state.fmpHistoryStats : {};
  const cached = state.fmpHistoryStats[symbol] || null;
  if (
    cached &&
    isRecentIsoTime(cached.updatedAt, 20 * 3600 * 1000) &&
    hasAllKeys(cached, ["closeAth250d", "closeChangePercent1d", "fieldMeta", "missingFields"])
  ) {
    return {
      price: toNumber(cached.latestClose),
      marketCap: toNumber(cached.marketCapM),
      turnoverM: toNumber(cached.turnoverM),
      recent5dCloseAth: toNumber(cached.recent5dCloseAth),
      closeAth250d: toNumber(cached.closeAth250d),
      closeChangePercent1d: toNumber(cached.closeChangePercent1d),
      latestDate: String(cached.latestDate || ""),
      previousTradingDate: String(cached.previousTradingDate || ""),
      fieldMeta: cached.fieldMeta && typeof cached.fieldMeta === "object" ? cached.fieldMeta : {},
      missingFields: Array.isArray(cached.missingFields) ? cached.missingFields : []
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
    const fieldMeta = {
      turnoverM: buildFieldMeta({ value: null, source: "historical-price-eod", reason: "price_history_unavailable" }),
      recent5dCloseAth: buildFieldMeta({ value: null, source: "historical-price-eod", reason: "price_history_unavailable" }),
      closeAth250d: buildFieldMeta({ value: null, source: "historical-price-eod", reason: "price_history_unavailable" }),
      closeChangePercent1d: buildFieldMeta({ value: null, source: "historical-price-eod", reason: "price_history_unavailable" })
    };
    const payload = {
      updatedAt: new Date().toISOString(),
      latestDate: "",
      previousTradingDate: "",
      latestClose: null,
      latestVolume: null,
      turnoverM: null,
      marketCapM: profile.marketCapM,
      recent5dCloseAth: null,
      closeAth250d: null,
      closeChangePercent1d: null,
      fieldMeta,
      missingFields: collectMissingFields(fieldMeta)
    };
    state.fmpHistoryStats[symbol] = payload;
    return {
      price: null,
      marketCap: profile.marketCapM,
      turnoverM: null,
      recent5dCloseAth: null,
      closeAth250d: null,
      closeChangePercent1d: null,
      latestDate: "",
      previousTradingDate: "",
      fieldMeta,
      missingFields: payload.missingFields
    };
  }

  const last = recentHistory[recentHistory.length - 1] || null;
  const prev = recentHistory.length >= 2 ? recentHistory[recentHistory.length - 2] : null;
  const recent5 = recentHistory.slice(-5);
  const recent5Highs = recent5.map((row) => row.high ?? row.close).filter((value) => value !== null);
  const recent5MaxHigh = recent5Highs.length > 0 ? Math.max(...recent5Highs) : null;
  const turnoverM = last?.close != null && last?.volume != null ? (last.close * last.volume) / 1e6 : null;
  const volSma10 = recentHistory.length >= 10
    ? recentHistory.slice(-10).reduce((sum, r) => sum + (r.volume || 0), 0) / 10
    : null;
  const amv = volSma10 !== null && last?.close != null ? (volSma10 * last.close) / 1e6 : null;
  const activeChips = volSma10 !== null ? volSma10 / 1e6 : null;

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

  const recent250Closes = recentHistory.slice(-250).map((row) => row.close).filter((value) => value !== null);
  const recent250MaxClose = recent250Closes.length > 0 ? Math.max(...recent250Closes) : null;
  const closeAth250d = last?.close != null && recent250MaxClose !== null ? (last.close >= recent250MaxClose ? 1 : 0) : null;
  const closeChangePercent1d = computeGrowthPercent(last?.close, prev?.close);

  const latestDate = String(last?.date || "");
  const previousTradingDate = String(prev?.date || "");
  const fieldMeta = {
    turnoverM: buildFieldMeta({
      value: turnoverM,
      source: "historical-price-eod",
      reason: last?.close === null || last?.volume === null ? "latest_close_or_volume_unavailable" : null,
      latestTradingDate: latestDate
    }),
    activeChips: buildFieldMeta({
      value: activeChips,
      source: "historical-price-eod",
      reason: volSma10 === null ? "recent_10d_volume_unavailable" : null,
      latestTradingDate: latestDate
    }),
    recent5dCloseAth: buildFieldMeta({
      value: recent5dCloseAth,
      source: "historical-price-eod",
      reason: recent5MaxHigh === null ? "recent_5d_highs_unavailable" : null,
      latestTradingDate: latestDate
    }),
    closeAth250d: buildFieldMeta({
      value: closeAth250d,
      source: "historical-price-eod",
      reason: recent250MaxClose === null ? "recent_250d_closes_unavailable" : null,
      latestTradingDate: latestDate,
      lookbackTradingDays: Math.min(recentHistory.length, 250)
    }),
    closeChangePercent1d: buildFieldMeta({
      value: closeChangePercent1d,
      source: "historical-price-eod",
      reason: prev?.close === null ? "previous_close_unavailable" : (prev?.close === 0 ? "previous_close_zero" : null),
      latestTradingDate: latestDate,
      previousTradingDate
    })
  };

  const payload = {
    updatedAt: new Date().toISOString(),
    latestDate,
    previousTradingDate,
    latestClose: last?.close ?? null,
    latestVolume: last?.volume ?? null,
    turnoverM,
    amv,
    activeChips,
    marketCapM: profile.marketCapM,
    recent5dCloseAth,
    closeAth250d,
    closeChangePercent1d,
    fieldMeta,
    missingFields: collectMissingFields(fieldMeta)
  };

  state.fmpHistoryStats[symbol] = payload;
  return {
    price: last?.close ?? null,
    marketCap: profile.marketCapM,
    turnoverM,
    amv,
    activeChips,
    recent5dCloseAth,
    closeAth250d,
    closeChangePercent1d,
    latestDate,
    previousTradingDate,
    fieldMeta,
    missingFields: payload.missingFields
  };
}

export async function computeFmpFinancialStats({ baseUrl, apiKey, symbol, state }) {
  state.fmpFinancialStats = state.fmpFinancialStats && typeof state.fmpFinancialStats === "object" ? state.fmpFinancialStats : {};
  const cached = state.fmpFinancialStats[symbol] || null;
  if (
    cached &&
    isRecentIsoTime(cached.updatedAt, 48 * 3600 * 1000) &&
    hasAllKeys(cached, [
      "acceptedDate",
      "earningsEventDate",
      "earningsEventDateSource",
      "ebitda",
      "netIncomeGrowthYoY",
      "operatingIncomeGrowthYoY",
      "grossMarginYoYDelta",
      "grossMarginQoQDelta",
      "revenueGrowthYoYPrevQuarter",
      "revenueGrowthYoYDeltaVsPrevQuarter",
      "fieldMeta",
      "missingFields"
    ])
  ) {
    return {
      symbol,
      companyName: String(cached.companyName || ""),
      financialRuleEligible:
        cached.financialRuleEligible === undefined ? true : Boolean(cached.financialRuleEligible),
      financialRuleSkipReason: String(cached.financialRuleSkipReason || ""),
      marketCap: toNumber(cached.marketCap),
      reportDate: String(cached.reportDate || ""),
      filingDate: String(cached.filingDate || ""),
      acceptedDate: String(cached.acceptedDate || ""),
      earningsEventDate: String(cached.earningsEventDate || ""),
      earningsEventDateSource: String(cached.earningsEventDateSource || ""),
      revenueM: toNumber(cached.revenueM),
      revenueGrowthYoY: toNumber(cached.revenueGrowthYoY),
      revenueGrowthYoYPrevQuarter: toNumber(cached.revenueGrowthYoYPrevQuarter),
      revenueGrowthYoYDeltaVsPrevQuarter: toNumber(cached.revenueGrowthYoYDeltaVsPrevQuarter),
      grossMargin: toNumber(cached.grossMargin),
      grossMarginYoYDelta: toNumber(cached.grossMarginYoYDelta),
      grossMarginQoQDelta: toNumber(cached.grossMarginQoQDelta),
      ebitda: toNumber(cached.ebitda),
      ebitdaM: toNumber(cached.ebitdaM),
      ebitdaGrowthYoY: toNumber(cached.ebitdaGrowthYoY),
      operatingIncome: toNumber(cached.operatingIncome),
      operatingIncomeGrowthYoY: toNumber(cached.operatingIncomeGrowthYoY),
      netIncome: toNumber(cached.netIncome),
      netIncomeGrowthYoY: toNumber(cached.netIncomeGrowthYoY),
      ebitdaMargin: toNumber(cached.ebitdaMargin),
      operatingMargin: toNumber(cached.operatingMargin),
      netMargin: toNumber(cached.netMargin),
      operatingCashFlowM: toNumber(cached.operatingCashFlowM),
      freeCashFlowM: toNumber(cached.freeCashFlowM),
      debtToEquity: toNumber(cached.debtToEquity),
      fieldMeta: cached.fieldMeta && typeof cached.fieldMeta === "object" ? cached.fieldMeta : {},
      missingFields: Array.isArray(cached.missingFields) ? cached.missingFields : []
    };
  }

  const [profile, incomeRows, cashFlowRows, balanceRows] = await Promise.all([
    fmpProfile({ baseUrl, apiKey, symbol }),
    fmpIncomeStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 6 }),
    fmpCashFlowStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 2 }),
    fmpBalanceSheetStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 2 })
  ]);

  const latestIncome = incomeRows[0] || null;
  const previousQuarterIncome = incomeRows[1] || null;
  const priorYearIncome = incomeRows[4] || null;
  const priorYearPreviousQuarterIncome = incomeRows[5] || null;
  const latestCashFlow = cashFlowRows[0] || null;
  const latestBalance = balanceRows[0] || null;

  const revenueGrowthYoY = computeGrowthPercent(latestIncome?.revenue, priorYearIncome?.revenue);
  const revenueGrowthYoYPrevQuarter = computeGrowthPercent(previousQuarterIncome?.revenue, priorYearPreviousQuarterIncome?.revenue);
  const revenueGrowthYoYDeltaVsPrevQuarter = computeDelta(revenueGrowthYoY, revenueGrowthYoYPrevQuarter);
  const grossMargin = latestIncome ? toPercent(latestIncome.grossProfit, latestIncome.revenue) : null;
  const previousQuarterGrossMargin = previousQuarterIncome ? toPercent(previousQuarterIncome.grossProfit, previousQuarterIncome.revenue) : null;
  const priorYearGrossMargin = priorYearIncome ? toPercent(priorYearIncome.grossProfit, priorYearIncome.revenue) : null;
  const grossMarginYoYDelta = computeDelta(grossMargin, priorYearGrossMargin);
  const grossMarginQoQDelta = computeDelta(grossMargin, previousQuarterGrossMargin);
  const ebitda = latestIncome?.ebitda ?? null;
  const ebitdaM = latestIncome?.ebitda != null ? latestIncome.ebitda / 1e6 : null;
  const ebitdaGrowthYoY = computeGrowthPercent(latestIncome?.ebitda, priorYearIncome?.ebitda);
  const operatingIncome = latestIncome?.operatingIncome ?? null;
  const operatingIncomeGrowthYoY = computeGrowthPercent(latestIncome?.operatingIncome, priorYearIncome?.operatingIncome);
  const netIncome = latestIncome?.netIncome ?? null;
  const netIncomeGrowthYoY = computeGrowthPercent(latestIncome?.netIncome, priorYearIncome?.netIncome);
  const ebitdaMargin = latestIncome ? toPercent(latestIncome.ebitda, latestIncome.revenue) : null;
  const operatingMargin = latestIncome ? toPercent(latestIncome.operatingIncome, latestIncome.revenue) : null;
  const netMargin = latestIncome ? toPercent(latestIncome.netIncome, latestIncome.revenue) : null;
  const operatingCashFlowM = latestCashFlow?.operatingCashFlow != null ? latestCashFlow.operatingCashFlow / 1e6 : null;
  const freeCashFlowM = latestCashFlow?.freeCashFlow != null ? latestCashFlow.freeCashFlow / 1e6 : null;
  const debtToEquity = latestBalance ? toRatio(latestBalance.totalDebt, latestBalance.totalStockholdersEquity) : null;
  const marketCap = profile.marketCapM;
  const fundLike = detectFundLikeSecurity(profile, symbol, incomeRows);
  const acceptedDate = String(latestIncome?.acceptedDate || "");
  const filingDate = String(latestIncome?.filingDate || "");
  const earningsEventDate = normalizeIsoDate(acceptedDate || filingDate);
  const earningsEventDateSource = acceptedDate
    ? "income-statement.acceptedDate"
    : (filingDate ? "income-statement.filingDate" : "");
  const reportDate = String(latestIncome?.date || "");

  const fieldMeta = {
    revenueGrowthYoY: buildFieldMeta({
      value: revenueGrowthYoY,
      source: "income-statement",
      reason: !latestIncome ? "latest_quarter_unavailable" : (!priorYearIncome ? "prior_year_quarter_unavailable" : "revenue_unavailable_or_zero_base"),
      currentQuarterDate: reportDate,
      compareQuarterDate: String(priorYearIncome?.date || "")
    }),
    revenueGrowthYoYPrevQuarter: buildFieldMeta({
      value: revenueGrowthYoYPrevQuarter,
      source: "income-statement",
      reason: !previousQuarterIncome ? "previous_quarter_unavailable" : (!priorYearPreviousQuarterIncome ? "previous_quarter_prior_year_unavailable" : "revenue_unavailable_or_zero_base"),
      currentQuarterDate: String(previousQuarterIncome?.date || ""),
      compareQuarterDate: String(priorYearPreviousQuarterIncome?.date || "")
    }),
    revenueGrowthYoYDeltaVsPrevQuarter: buildFieldMeta({
      value: revenueGrowthYoYDeltaVsPrevQuarter,
      source: "income-statement",
      reason: revenueGrowthYoY === null || revenueGrowthYoYPrevQuarter === null ? "revenue_growth_series_incomplete" : null,
      currentQuarterDate: reportDate,
      previousQuarterDate: String(previousQuarterIncome?.date || "")
    }),
    grossMargin: buildFieldMeta({
      value: grossMargin,
      source: "income-statement",
      reason: !latestIncome ? "latest_quarter_unavailable" : "gross_profit_or_revenue_unavailable",
      currentQuarterDate: reportDate
    }),
    grossMarginYoYDelta: buildFieldMeta({
      value: grossMarginYoYDelta,
      source: "income-statement",
      reason: grossMargin === null || priorYearGrossMargin === null ? "gross_margin_series_incomplete" : null,
      currentQuarterDate: reportDate,
      compareQuarterDate: String(priorYearIncome?.date || "")
    }),
    grossMarginQoQDelta: buildFieldMeta({
      value: grossMarginQoQDelta,
      source: "income-statement",
      reason: grossMargin === null || previousQuarterGrossMargin === null ? "gross_margin_series_incomplete" : null,
      currentQuarterDate: reportDate,
      previousQuarterDate: String(previousQuarterIncome?.date || "")
    }),
    ebitda: buildFieldMeta({
      value: ebitda,
      source: "income-statement",
      reason: !latestIncome ? "latest_quarter_unavailable" : "ebitda_unavailable",
      currentQuarterDate: reportDate
    }),
    ebitdaGrowthYoY: buildFieldMeta({
      value: ebitdaGrowthYoY,
      source: "income-statement",
      reason: !latestIncome ? "latest_quarter_unavailable" : (!priorYearIncome ? "prior_year_quarter_unavailable" : "ebitda_unavailable_or_zero_base"),
      currentQuarterDate: reportDate,
      compareQuarterDate: String(priorYearIncome?.date || "")
    }),
    operatingIncomeGrowthYoY: buildFieldMeta({
      value: operatingIncomeGrowthYoY,
      source: "income-statement",
      reason: !latestIncome ? "latest_quarter_unavailable" : (!priorYearIncome ? "prior_year_quarter_unavailable" : "operating_income_unavailable_or_zero_base"),
      currentQuarterDate: reportDate,
      compareQuarterDate: String(priorYearIncome?.date || "")
    }),
    netIncomeGrowthYoY: buildFieldMeta({
      value: netIncomeGrowthYoY,
      source: "income-statement",
      reason: !latestIncome ? "latest_quarter_unavailable" : (!priorYearIncome ? "prior_year_quarter_unavailable" : "net_income_unavailable_or_zero_base"),
      currentQuarterDate: reportDate,
      compareQuarterDate: String(priorYearIncome?.date || "")
    }),
    earningsEventDate: buildFieldMeta({
      value: earningsEventDate || null,
      source: earningsEventDateSource || "income-statement",
      reason: acceptedDate || filingDate ? "earnings_event_date_parse_failed" : "accepted_or_filing_date_unavailable",
      reportDate,
      filingDate,
      acceptedDate
    }),
    financialRuleEligible: buildFieldMeta({
      value: fundLike.shouldSkipFinancialRules ? 0 : 1,
      source: "profile+income-statement",
      reason: fundLike.reason || null,
      symbol,
      companyName: profile.companyName
    })
  };

  state.fmpFinancialStats[symbol] = {
    updatedAt: new Date().toISOString(),
    companyName: profile.companyName,
    financialRuleEligible: !fundLike.shouldSkipFinancialRules,
    financialRuleSkipReason: fundLike.reason,
    marketCap,
    reportDate,
    filingDate,
    acceptedDate,
    earningsEventDate,
    earningsEventDateSource,
    revenueM: latestIncome?.revenue != null ? latestIncome.revenue / 1e6 : null,
    revenueGrowthYoY,
    revenueGrowthYoYPrevQuarter,
    revenueGrowthYoYDeltaVsPrevQuarter,
    grossMargin,
    grossMarginYoYDelta,
    grossMarginQoQDelta,
    ebitda,
    ebitdaM,
    ebitdaGrowthYoY,
    operatingIncome,
    operatingIncomeGrowthYoY,
    netIncome,
    netIncomeGrowthYoY,
    ebitdaMargin,
    operatingMargin,
    netMargin,
    operatingCashFlowM,
    freeCashFlowM,
    debtToEquity,
    fieldMeta,
    missingFields: collectMissingFields(fieldMeta)
  };

  return {
    symbol,
    companyName: profile.companyName,
    financialRuleEligible: !fundLike.shouldSkipFinancialRules,
    financialRuleSkipReason: fundLike.reason,
    marketCap,
    reportDate,
    filingDate,
    acceptedDate,
    earningsEventDate,
    earningsEventDateSource,
    revenueM: latestIncome?.revenue != null ? latestIncome.revenue / 1e6 : null,
    revenueGrowthYoY,
    revenueGrowthYoYPrevQuarter,
    revenueGrowthYoYDeltaVsPrevQuarter,
    grossMargin,
    grossMarginYoYDelta,
    grossMarginQoQDelta,
    ebitda,
    ebitdaM,
    ebitdaGrowthYoY,
    operatingIncome,
    operatingIncomeGrowthYoY,
    netIncome,
    netIncomeGrowthYoY,
    ebitdaMargin,
    operatingMargin,
    netMargin,
    operatingCashFlowM,
    freeCashFlowM,
    debtToEquity,
    fieldMeta,
    missingFields: collectMissingFields(fieldMeta)
  };
}

export async function computeFmpDefaultStats({ baseUrl, apiKey, symbol, state }) {
  return computeFmpPriceStats({ baseUrl, apiKey, symbol, state });
}

export async function computeFmpRuleStats({ baseUrl, apiKey, symbol, state }) {
  const [priceStats, financialStats] = await Promise.all([
    computeFmpPriceStats({ baseUrl, apiKey, symbol, state }),
    computeFmpFinancialStats({ baseUrl, apiKey, symbol, state })
  ]);

  const earningsWithin1TradingDayValue = financialStats.earningsEventDate
    ? (
      financialStats.earningsEventDate === priceStats.latestDate ||
      financialStats.earningsEventDate === priceStats.previousTradingDate
        ? 1
        : 0
    )
    : null;

  const earningsWithin1TradingDayMeta = buildFieldMeta({
    value: earningsWithin1TradingDayValue,
    source: financialStats.earningsEventDateSource || "income-statement",
    reason: !financialStats.earningsEventDate
      ? "earnings_event_date_unavailable"
      : (!priceStats.latestDate ? "latest_trading_date_unavailable" : null),
    earningsEventDate: financialStats.earningsEventDate,
    latestTradingDate: priceStats.latestDate,
    previousTradingDate: priceStats.previousTradingDate
  });

  const fieldMeta = {
    ...(priceStats.fieldMeta || {}),
    ...(financialStats.fieldMeta || {}),
    earningsWithin1TradingDay: earningsWithin1TradingDayMeta
  };

  return {
    symbol,
    companyName: financialStats.companyName,
    financialRuleEligible: financialStats.financialRuleEligible,
    financialRuleSkipReason: financialStats.financialRuleSkipReason,
    price: priceStats.price,
    marketCap: priceStats.marketCap ?? financialStats.marketCap,
    turnoverM: priceStats.turnoverM,
    amv: priceStats.amv,
    activeChips: priceStats.activeChips,
    recent5dCloseAth: priceStats.recent5dCloseAth,
    closeAth250d: priceStats.closeAth250d,
    closeChangePercent1d: priceStats.closeChangePercent1d,
    latestDate: priceStats.latestDate,
    previousTradingDate: priceStats.previousTradingDate,
    reportDate: financialStats.reportDate,
    filingDate: financialStats.filingDate,
    acceptedDate: financialStats.acceptedDate,
    earningsEventDate: financialStats.earningsEventDate,
    earningsEventDateSource: financialStats.earningsEventDateSource,
    earningsWithin1TradingDay: earningsWithin1TradingDayValue,
    revenueM: financialStats.revenueM,
    revenueGrowthYoY: financialStats.revenueGrowthYoY,
    revenueGrowthYoYPrevQuarter: financialStats.revenueGrowthYoYPrevQuarter,
    revenueGrowthYoYDeltaVsPrevQuarter: financialStats.revenueGrowthYoYDeltaVsPrevQuarter,
    grossMargin: financialStats.grossMargin,
    grossMarginYoYDelta: financialStats.grossMarginYoYDelta,
    grossMarginQoQDelta: financialStats.grossMarginQoQDelta,
    ebitda: financialStats.ebitda,
    ebitdaM: financialStats.ebitdaM,
    ebitdaGrowthYoY: financialStats.ebitdaGrowthYoY,
    operatingIncome: financialStats.operatingIncome,
    operatingIncomeGrowthYoY: financialStats.operatingIncomeGrowthYoY,
    netIncome: financialStats.netIncome,
    netIncomeGrowthYoY: financialStats.netIncomeGrowthYoY,
    ebitdaMargin: financialStats.ebitdaMargin,
    operatingMargin: financialStats.operatingMargin,
    netMargin: financialStats.netMargin,
    operatingCashFlowM: financialStats.operatingCashFlowM,
    freeCashFlowM: financialStats.freeCashFlowM,
    debtToEquity: financialStats.debtToEquity,
    fieldMeta,
    missingFields: mergeMissingFields(priceStats.missingFields, financialStats.missingFields, collectMissingFields({
      earningsWithin1TradingDay: earningsWithin1TradingDayMeta
    }))
  };
}
