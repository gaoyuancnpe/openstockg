/* 个股研究服务：把 FMP 的原始数据 + 既有指标计算聚合成智能体可直接消费的口径。
 * 只读 FMP、复用 state.json 缓存（价格 20h / 财报 48h），不碰规则与调度。
 * MCP 进程与 Web 调度进程共享 state.json——写回走"重读→只更新本 symbol 键→落盘"，
 * 把与调度器 last-writer-wins 的互相覆盖窗口压到最小。 */
import { isoDateToday, isoDateShiftDays } from "./shared.mjs";
import {
  fmpQuote,
  fmpEarningsCalendar,
  fmpProfile,
  fmpIncomeStatements,
  fmpCashFlowStatements,
  fmpBalanceSheetStatements,
  fmpHistoricalPriceEodFull,
  fmpKeyMetrics,
  fmpRatios,
  fmpPeers,
  fmpAnalystEstimates,
  fmpDividends,
  eodhdEod,
  eodhdDividends,
  eodhdSplits
} from "./providers.mjs";
import { computeFmpDefaultStats, computeFmpFinancialStats } from "./fmp-domain.mjs";
import { loadDesktopState, saveDesktopState } from "../main/data-store.mjs";

function normalizeSymbol(raw) {
  const symbol = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    throw new Error(`无效的股票代码：${String(raw)}（只允许字母数字和 . -，例如 AAPL、BRK.B）`);
  }
  return symbol;
}

/** 只回写本 symbol 的缓存键，避免覆盖调度器并行写入的其它键 */
async function persistSymbolState(dataPaths, state, symbol) {
  try {
    const latest = await loadDesktopState(dataPaths);
    for (const key of ["fmpHistoryStats", "fmpFinancialStats"]) {
      if (state[key]?.[symbol] !== undefined) {
        latest[key] = latest[key] && typeof latest[key] === "object" ? latest[key] : {};
        latest[key][symbol] = state[key][symbol];
      }
    }
    await saveDesktopState(dataPaths, latest);
  } catch { /* 缓存写回失败不影响结果返回 */ }
}

function requireFmp(config) {
  const apiKey = String(config?.fmpApiKey || "");
  if (!apiKey) throw new Error("缺少 FMP API Key，请先在配置中填写（面板设置页或 update_config）");
  return {
    apiKey,
    baseUrl: String(config?.fmpBaseUrl || "https://financialmodelingprep.com")
  };
}

/** 个股快照：实时报价(套餐不支持时回退 EOD 收盘) + 既有价格指标(20h 缓存) + 公司摘要 */
export async function getQuoteSnapshot({ dataPaths, config, symbol: rawSymbol }) {
  const symbol = normalizeSymbol(rawSymbol);
  const { apiKey, baseUrl } = requireFmp(config);
  const state = await loadDesktopState(dataPaths);

  const [priceStats, profile, quoteResult] = await Promise.all([
    computeFmpDefaultStats({ baseUrl, apiKey, symbol, state }),
    fmpProfile({ baseUrl, apiKey, symbol }),
    fmpQuote({ baseUrl, apiKey, symbol }).catch((error) => ({ error: error.message }))
  ]);
  await persistSymbolState(dataPaths, state, symbol);

  const quote = quoteResult.error ? null : quoteResult;
  return {
    symbol,
    quote: quote
      ? {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        open: quote.open,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        yearHigh: quote.yearHigh,
        yearLow: quote.yearLow,
        volume: quote.volume
      }
      : { note: `实时报价不可用（${quoteResult.error}），以下为最近收盘口径` },
    priceStats,
    profile,
    asOf: priceStats?.latestDate || null
  };
}

/** 财报序列 + 衍生指标 + 估值/比率/分析师预期/分红：一次调用看全"业绩+估值" */
export async function getFinancialReport({ dataPaths, config, symbol: rawSymbol, period = "quarter", limit = 8 }) {
  const symbol = normalizeSymbol(rawSymbol);
  const normalizedPeriod = period === "annual" ? "annual" : "quarter";
  const normalizedLimit = Math.max(2, Math.min(20, Math.trunc(Number(limit) || 8)));
  const { apiKey, baseUrl } = requireFmp(config);
  const state = await loadDesktopState(dataPaths);

  const [financialStats, profile, income, cashflow, balance, keyMetrics, ratios, analystEstimates, dividends] = await Promise.all([
    computeFmpFinancialStats({ baseUrl, apiKey, symbol, state }),
    fmpProfile({ baseUrl, apiKey, symbol }),
    fmpIncomeStatements({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: normalizedLimit }),
    fmpCashFlowStatements({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: Math.min(normalizedLimit, 6) }),
    fmpBalanceSheetStatements({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: Math.min(normalizedLimit, 6) }),
    fmpKeyMetrics({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: Math.min(normalizedLimit, 8) }),
    fmpRatios({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: Math.min(normalizedLimit, 8) }),
    // 分析师预期只取年度口径(季度预期该端点不稳定),失败不阻塞整体
    fmpAnalystEstimates({ baseUrl, apiKey, symbol, period: "annual", limit: 4 }).catch(() => []),
    fmpDividends({ baseUrl, apiKey, symbol, limit: 8 }).catch(() => [])
  ]);
  await persistSymbolState(dataPaths, state, symbol);

  return {
    symbol,
    period: normalizedPeriod,
    profile,
    income,
    cashflow,
    balance,
    valuation: keyMetrics,
    ratios,
    analystEstimates,
    dividends,
    indicators: financialStats
  };
}

/** 同业对比：FMP 自带公司名/股价/市值，无需二次查询 */
export async function getPeersReport({ config, symbol: rawSymbol }) {
  const symbol = normalizeSymbol(rawSymbol);
  const { apiKey, baseUrl } = requireFmp(config);
  const peers = await fmpPeers({ baseUrl, apiKey, symbol });
  if (peers.length === 0) {
    throw new Error(`未取到 ${symbol} 的同业清单（FMP 未覆盖或代码有误）`);
  }
  return {
    symbol,
    total: peers.length,
    peers: peers.map((row) => ({
      symbol: row.symbol,
      companyName: row.companyName,
      price: row.price,
      marketCapM: row.marketCapM === null ? null : Math.round(row.marketCapM)
    }))
  };
}

function sma(values, window) {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / window) * 100) / 100;
}

/** 行情历史：全量 EOD 取回后本地按窗口切片，附区间摘要；不落 state(轻量、按需) */
export async function getPriceHistoryReport({ dataPaths, config, symbol: rawSymbol, windowDays = 183 }) {
  const symbol = normalizeSymbol(rawSymbol);
  const days = Math.max(7, Math.min(730, Math.trunc(Number(windowDays) || 183)));
  const { apiKey, baseUrl } = requireFmp(config);

  const from = isoDateShiftDays(isoDateToday(), -days);
  const [rows, profile] = await Promise.all([
    fmpHistoricalPriceEodFull({ baseUrl, apiKey, symbol, from }),
    fmpProfile({ baseUrl, apiKey, symbol })
  ]);
  if (rows.length === 0) {
    throw new Error(`未取到 ${symbol} 的行情数据（代码是否正确？FMP 是否覆盖该标的？）`);
  }

  const closes = rows.map((row) => row.close).filter((v) => v !== null);
  const first = rows.find((row) => row.close !== null);
  const last = rows[rows.length - 1];
  const windowHigh = rows.reduce((acc, row) => Math.max(acc, row.high ?? row.close ?? 0), 0);
  const windowLow = rows.reduce((acc, row) => Math.min(acc || Infinity, row.high ?? row.close ?? Infinity), Infinity);
  const avgTurnoverM = rows.reduce((acc, row) => acc + ((row.close ?? 0) * (row.volume ?? 0)) / 1e6, 0) / rows.length;
  const summary = {
    from: rows[0]?.date || from,
    to: last.date,
    tradingDays: rows.length,
    firstClose: first?.close ?? null,
    lastClose: last.close,
    changePercent: first?.close ? Math.round(((last.close - first.close) / first.close) * 10000) / 100 : null,
    windowHigh: windowHigh === 0 ? null : windowHigh,
    windowLow: Number.isFinite(windowLow) ? windowLow : null,
    avgTurnoverM: Math.round(avgTurnoverM * 100) / 100,
    sma20: sma(closes, 20),
    sma60: sma(closes, 60),
    marketCapM: profile.marketCapM
  };

  const chronological = [...rows].reverse();
  return {
    symbol,
    windowDays: days,
    summary,
    total: chronological.length,
    truncated: chronological.length > 100,
    rows: chronological.slice(0, 100).map((row) => ({
      date: row.date,
      close: row.close,
      high: row.high,
      volume: row.volume,
      turnoverM: row.close !== null && row.volume !== null ? Math.round((row.close * row.volume) / 1e4) / 100 : null
    }))
  };
}

/** 财报日历：未来 N 天将发财报的标的(美股为主——按"代码无交易所后缀"过滤,
 *  .L/.TO 等境外后缀剔除;BRK.B 这类带点的美股代码会被误伤,量少且可接受) */
export async function getEarningsCalendarReport({ config, days = 7 }) {
  const normalizedDays = Math.max(1, Math.min(30, Math.trunc(Number(days) || 7)));
  const { apiKey, baseUrl } = requireFmp(config);
  const today = isoDateToday();
  const to = isoDateShiftDays(today, normalizedDays);
  const all = await fmpEarningsCalendar({ baseUrl, apiKey, from: today, to });
  const rows = all.filter((row) => !row.symbol.includes("."));
  return {
    from: today,
    to,
    total: rows.length,
    truncated: rows.length > 100,
    rows: rows.slice(0, 100)
  };
}

/* ── EODHD(第二数据源)研究口径 ─────────────────────────────────────
 * 独立 Key(eodhdApiKey)、独立缓存键(eodhdCandles/eodhdActions,24h),
 * 写回同样走"重读→只更新本 symbol 键→落盘"。 */

function requireEodhd(config) {
  const apiKey = String(config?.eodhdApiKey || "");
  if (!apiKey) {
    throw new Error("缺少 EODHD API Key，请先在配置中填写（面板设置页或 update_config 的 eodhdApiKey）。免费注册即得，每天 20 次调用额度");
  }
  return {
    apiKey,
    baseUrl: String(config?.eodhdBaseUrl || "https://eodhd.com/api")
  };
}

async function readEodhdCache(dataPaths, kind, symbol, maxAgeMs) {
  const state = await loadDesktopState(dataPaths);
  const entry = state?.[kind]?.[symbol];
  if (!entry || typeof entry !== "object") return null;
  if (Date.now() - Number(entry.fetchedAt || 0) > maxAgeMs) return null;
  return entry;
}

async function persistEodhdCache(dataPaths, kind, symbol, entry) {
  try {
    const latest = await loadDesktopState(dataPaths);
    latest[kind] = latest[kind] && typeof latest[kind] === "object" ? latest[kind] : {};
    latest[kind][symbol] = entry;
    await saveDesktopState(dataPaths, latest);
  } catch { /* 缓存写回失败不影响结果返回 */ }
}

/** EODHD 复权日线:长历史(默认 5 年,最长 30 年)+停止交易检测。
 *  与 FMP 的 get_price_history 互补——EODHD 保留退市标的,
 *  "数据停在哪天"本身就是信号(主数据源对僵尸代码只会返回旧数据)。 */
export async function getEodhdPriceHistoryReport({ dataPaths, config, symbol: rawSymbol, years = 5 }) {
  const symbol = normalizeSymbol(rawSymbol);
  const { apiKey, baseUrl } = requireEodhd(config);
  const spanYears = Math.max(1, Math.min(30, Math.trunc(Number(years) || 5)));
  const from = isoDateShiftDays(isoDateToday(), -spanYears * 366);

  let rows = null;
  const entry = await readEodhdCache(dataPaths, "eodhdCandles", symbol, 24 * 3600 * 1000);
  if (Array.isArray(entry?.rows) && entry.rows.length > 0 && String(entry.from || "") <= from) {
    rows = entry.rows.filter((row) => row.date >= from);
  }
  if (!rows) {
    rows = await eodhdEod({ baseUrl, apiKey, symbol, from });
    await persistEodhdCache(dataPaths, "eodhdCandles", symbol, { fetchedAt: Date.now(), from, rows });
  }
  if (rows.length === 0) {
    throw new Error(`未取到 ${symbol} 的 EODHD 行情。可能原因：代码写错；该代码不在覆盖范围；或免费档每日 20 次调用已用尽`);
  }

  const last = rows[rows.length - 1];
  const closes = rows.map((row) => (row.adjustedClose !== null ? row.adjustedClose : row.close)).filter((v) => v !== null);
  const firstAdj = closes[0];
  const lastAdj = closes[closes.length - 1];
  const windowHigh = rows.reduce((acc, row) => Math.max(acc, row.high ?? row.close ?? 0), 0);
  const windowLow = rows.reduce((acc, row) => Math.min(acc || Infinity, row.low ?? row.close ?? Infinity), Infinity);
  const avgTurnoverM = rows.reduce((acc, row) => acc + ((row.close ?? 0) * (row.volume ?? 0)) / 1e6, 0) / rows.length;

  // 停止交易检测:最新数据日距今超过 10 个自然日,多半已退市/被收购/长期停牌
  const daysSinceLast = Math.round((Date.now() - new Date(`${last.date}T00:00:00Z`).getTime()) / 86400000);
  const tradingStatus = daysSinceLast > 10
    ? {
        status: "stopped",
        latestDate: last.date,
        daysSinceLast,
        note: `数据停在 ${last.date}——标的可能已退市/被收购/长期停牌。EODHD 保留退市标的历史，这正是它相对主数据源的价值（无幸存者偏差）。`
      }
    : { status: "active", latestDate: last.date, daysSinceLast };

  return {
    symbol,
    provider: "eodhd",
    spanYears,
    adjustedBasis: "adjusted_close（分红与拆分复权）",
    summary: {
      from: rows[0].date,
      to: last.date,
      tradingDays: rows.length,
      firstAdjustedClose: firstAdj ?? null,
      lastAdjustedClose: lastAdj ?? null,
      changePercent: firstAdj ? Math.round(((lastAdj - firstAdj) / firstAdj) * 10000) / 100 : null,
      windowHigh: windowHigh || null,
      windowLow: Number.isFinite(windowLow) ? windowLow : null,
      avgTurnoverM: Math.round(avgTurnoverM * 100) / 100,
      sma20: sma(closes, 20),
      sma60: sma(closes, 60)
    },
    tradingStatus,
    total: rows.length,
    truncated: rows.length > 100,
    rows: [...rows].slice(-100).reverse().map((row) => ({
      date: row.date,
      close: row.close,
      adjustedClose: row.adjustedClose,
      volume: row.volume,
      turnoverM: row.close !== null && row.volume !== null ? Math.round((row.close * row.volume) / 1e4) / 100 : null
    }))
  };
}

/** 分红/拆分全史:历年分红统计 + 最近事件清单,判断股息连续性与复权口径。 */
export async function getEodhdCorporateActionsReport({ dataPaths, config, symbol: rawSymbol }) {
  const symbol = normalizeSymbol(rawSymbol);
  const { apiKey, baseUrl } = requireEodhd(config);

  let dividends = null;
  let splits = null;
  const entry = await readEodhdCache(dataPaths, "eodhdActions", symbol, 24 * 3600 * 1000);
  if (Array.isArray(entry?.dividends) && Array.isArray(entry?.splits)) {
    dividends = entry.dividends;
    splits = entry.splits;
  } else {
    [dividends, splits] = await Promise.all([
      eodhdDividends({ baseUrl, apiKey, symbol }),
      eodhdSplits({ baseUrl, apiKey, symbol })
    ]);
    await persistEodhdCache(dataPaths, "eodhdActions", symbol, { fetchedAt: Date.now(), dividends, splits });
  }

  const byYear = {};
  for (const d of dividends) {
    const year = d.date.slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    byYear[year] = Math.round(((byYear[year] || 0) + (d.amount || 0)) * 1000) / 1000;
  }
  const years = Object.keys(byYear).sort();
  const recentAnnualTotals = years.slice(-3).map((year) => ({ year, total: byYear[year] }));

  return {
    symbol,
    provider: "eodhd",
    dividends: {
      count: dividends.length,
      firstDate: dividends[0]?.date || null,
      lastDate: dividends[dividends.length - 1]?.date || null,
      recentAnnualTotals,
      latest: [...dividends].slice(-15).reverse()
    },
    splits: {
      count: splits.length,
      latest: [...splits].slice(-10).reverse()
    }
  };
}
