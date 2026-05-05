import { normalizeHttpBaseUrl, toNumber } from "../shared-runtime.mjs";
import { chunk } from "./shared.mjs";
import { computeIndicators } from "./indicator-domain.mjs";
import {
  computeFmpDefaultStats,
  computeFmpFinancialStats,
  loadFmpDefaultUniverse,
  loadFmpFinancialUniverse,
  loadUniverseUS
} from "./fmp-domain.mjs";
import { finnhubBasicFinancials, finnhubQuote } from "./providers.mjs";

export function createScreenerService({ dataPaths, loadConfig, loadState, saveState, log }) {
  return {
    runScreener: async ({ symbols, criteria }) => {
      const cfg = await loadConfig();
      const dataProvider = String(cfg.dataProvider || "finnhub").toLowerCase();
      const finnhubBaseUrl = normalizeHttpBaseUrl(cfg.finnhubBaseUrl, "https://finnhub.io/api/v1");
      const finnhubApiKey = String(cfg.finnhubApiKey || "");
      const fmpBaseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
      const fmpApiKey = String(cfg.fmpApiKey || "");
      const inputSymbols = Array.isArray(symbols) ? symbols.map((symbol) => String(symbol).toUpperCase()).filter(Boolean) : [];
      const c = criteria || {};

      const useUniverse = String(c.universe || "").toLowerCase() === "us_all";
      const maxScan = Number.parseInt(String(c.maxScan ?? "500"), 10);
      const scanCount = Number.isFinite(maxScan) ? maxScan : 500;

      const state = await loadState();
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
              const symbol = typeof item === "string" ? item : String(item?.symbol || "").toUpperCase();
              if (!symbol) return null;
              const stats = await computeFmpDefaultStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol, state }).catch(() => null);
              if (!stats || stats.price === null) return null;
              const row = {
                symbol,
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
            } catch (error) {
              const label = typeof item === "string" ? item : item?.symbol;
              log(`Screener error ${label} ${error instanceof Error ? error.message : String(error)}`);
              return null;
            }
          }))).filter(Boolean)
          : [];

        if (dataProvider !== "fmp") {
          for (const item of batch) {
            try {
              const symbol = typeof item === "string" ? item : String(item?.symbol || "").toUpperCase();
              if (!symbol) continue;
              const quote = await finnhubQuote({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol });
              if (!quote || quote.price === null) continue;

              const fin = await finnhubBasicFinancials({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol }).catch(() => null);
              const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: { volumeRatio: true }, state }).catch(() => ({}));

              const row = {
                symbol,
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
            } catch (error) {
              const label = typeof item === "string" ? item : item?.symbol;
              log(`Screener error ${label} ${error instanceof Error ? error.message : String(error)}`);
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
          order: useUniverse && dataProvider === "fmp" ? "marketCap_desc" : null
        }
      };
    },
    runFinancialScreener: async ({ symbols, criteria }) => {
      const cfg = await loadConfig();
      const fmpBaseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
      const fmpApiKey = String(cfg.fmpApiKey || "");
      const inputSymbols = Array.isArray(symbols) ? symbols.map((symbol) => String(symbol).toUpperCase()).filter(Boolean) : [];
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

      const state = await loadState();
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
          const symbol = typeof item === "string" ? item : String(item?.symbol || "").toUpperCase();
          if (!symbol) return null;
          try {
            const stats = await computeFmpFinancialStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol, state });
            const row = {
              symbol,
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
          } catch (error) {
            log(`Financial screener error ${symbol} ${error instanceof Error ? error.message : String(error)}`);
            return null;
          }
        }));
        out.push(...rowsBatch.filter(Boolean));
      }

      await saveState(state);
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

