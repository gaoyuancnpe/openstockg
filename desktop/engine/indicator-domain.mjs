import { toNumber } from "../shared-runtime.mjs";
import { nowMs } from "./shared.mjs";
import { finnhubBasicFinancials, finnhubCandles } from "./providers.mjs";

export function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const slice = values.slice(values.length - period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

export function rsi(values, period) {
  if (!Array.isArray(values) || values.length < period + 1 || period <= 0) return null;
  const recent = values.slice(values.length - (period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recent.length; i += 1) {
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

export function buildEvalContext({ symbol, quote, indicators }) {
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

export function quoteToEvalContext({ symbol, quote, extra }) {
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

export async function computeHistoryStats({ baseUrl, apiKey, symbol, state }) {
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
  const latestTurnoverM = recentCandles.lastClose !== null && recentCandles.lastVolume !== null
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

export async function computeIndicators({ baseUrl, apiKey, symbol, condition, state }) {
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
        const lastVolume = candles.v.length > 0 ? candles.v[candles.v.length - 1] : null;
        out.volumeAvg20 = avg;
        out.volumeRatio = avg && lastVolume ? lastVolume / avg : null;
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

