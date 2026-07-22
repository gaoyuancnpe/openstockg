import { normalizeHttpBaseUrl, fetchJSON } from "../shared-runtime.mjs";
import { sortUniverseRowsByMarketCapDesc, isoDateToday, isoDateShiftDays } from "./shared.mjs";
import { appendDesktopMarketAmvHistory } from "../main/data-store.mjs";

const SMA_PERIOD = 10;
const DEFAULT_SAMPLE_LIMIT = 100; // 默认取市值前100只股票合成

function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + (b || 0), 0);
  return sum / period;
}

export function createMarketAmvService({ dataPaths, loadConfig, log }) {
  async function computeMarket0amv({ limit = DEFAULT_SAMPLE_LIMIT, useFmp = true } = {}) {
    const cfg = await loadConfig();
    const baseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
    const apiKey = cfg.fmpApiKey;
    if (!apiKey) throw new Error("FMP API key is required for market 0AMV");

    log("[market-amv] fetching screener universe...");
    const params = new URLSearchParams({
      marketCapMoreThan: "10000000000",
      exchange: "NYSE,NASDAQ",
      apikey: apiKey,
      limit: String(limit)
    });
    const url = `${baseUrl}/api/v3/stock-screener?${params.toString()}`;
    const rows = await fetchJSON(url);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("No screener results for market 0AMV");
    }

    let totalAmv = 0;
    let processed = 0;
    const today = isoDateToday();
    const from = isoDateShiftDays(today, -30);
    const to = today;

    for (const row of rows) {
      const symbol = row.symbol;
      if (!symbol) continue;
      try {
        const histUrl = `${baseUrl}/api/v3/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&apikey=${apiKey}`;
        const hist = await fetchJSON(histUrl);
        if (!Array.isArray(hist) || hist.length < SMA_PERIOD) continue;
        const sorted = hist.sort((a, b) => new Date(a.date) - new Date(b.date));
        const volumes = sorted.map((h) => h.volume);
        const closes = sorted.map((h) => h.close);
        const volSma = sma(volumes, SMA_PERIOD);
        const lastClose = closes[closes.length - 1];
        if (volSma !== null && lastClose != null) {
          totalAmv += volSma * lastClose;
          processed++;
        }
      } catch (err) {
        log(`[market-amv] ${symbol} skipped: ${err.message}`);
      }
    }

    const result = {
      date: today,
      value: totalAmv / 1e6, // 百万美元
      sampleCount: rows.length,
      processedCount: processed,
      source: "fmp"
    };
    try {
      await appendDesktopMarketAmvHistory(dataPaths, {
        date: result.date,
        value: result.value,
        sampleCount: result.sampleCount,
        processedCount: result.processedCount,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /*不影响主流程 */ }
    return result;
  }

  return { computeMarket0amv };
}