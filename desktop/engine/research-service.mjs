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
  fmpHistoricalPriceEodFull
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

/** 财报序列 + 衍生指标：原始三大报表(近 N 期) + computeFmpFinancialStats(48h 缓存) */
export async function getFinancialReport({ dataPaths, config, symbol: rawSymbol, period = "quarter", limit = 8 }) {
  const symbol = normalizeSymbol(rawSymbol);
  const normalizedPeriod = period === "annual" ? "annual" : "quarter";
  const normalizedLimit = Math.max(2, Math.min(20, Math.trunc(Number(limit) || 8)));
  const { apiKey, baseUrl } = requireFmp(config);
  const state = await loadDesktopState(dataPaths);

  const [financialStats, profile, income, cashflow, balance] = await Promise.all([
    computeFmpFinancialStats({ baseUrl, apiKey, symbol, state }),
    fmpProfile({ baseUrl, apiKey, symbol }),
    fmpIncomeStatements({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: normalizedLimit }),
    fmpCashFlowStatements({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: Math.min(normalizedLimit, 6) }),
    fmpBalanceSheetStatements({ baseUrl, apiKey, symbol, period: normalizedPeriod, limit: Math.min(normalizedLimit, 6) })
  ]);
  await persistSymbolState(dataPaths, state, symbol);

  return {
    symbol,
    period: normalizedPeriod,
    profile,
    income,
    cashflow,
    balance,
    indicators: financialStats
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
