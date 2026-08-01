import { normalizeHttpBaseUrl, fetchJSON } from "../shared-runtime.mjs";
import { sortUniverseRowsByMarketCapDesc, isoDateToday, isoDateShiftDays, isoDateShiftYears, nowMs, readJSON, writeJSON } from "./shared.mjs";
import {
  appendDesktopMarketAmvHistory,
  bulkAppendDesktopMarketAmvHistory,
  loadDesktopMarketAmvHistory,
  loadMarketAmvBackfillState,
  saveMarketAmvBackfillState
} from "../main/data-store.mjs";
import {
  fmpCompanyScreener,
  fmpHistoricalPriceEodFull,
  fmpSp500Constituents,
  fmpNasdaqConstituents
} from "./providers.mjs";

const SMA_PERIOD = 10;
const DEFAULT_SAMPLE_LIMIT = 100;
const CONSTITUENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function sma(values, period) {
  if (!values || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += (values[i] || 0);
  return sum / period;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function resolveConstituents({ baseUrl, apiKey, index, limit, dataPaths, log }) {
  const idx = String(index || "all").toLowerCase();

  if (idx === "all") {
    const rows = await fmpCompanyScreener({ baseUrl, apiKey, params: { exchange: "NYSE,NASDAQ", marketCapMoreThan: "10000000000", limit: String(Math.max(limit || 100, 500)) } });
    const sorted = sortUniverseRowsByMarketCapDesc(rows);
    return sorted.slice(0, limit || DEFAULT_SAMPLE_LIMIT).map((r) => ({ symbol: String(r.symbol || "").toUpperCase(), marketCap: Number(r.marketCap) || null }));
  }

  const cacheFile = idx === "nasdaq" ? dataPaths?.marketAmvConstituentsNasdaq : dataPaths?.marketAmvConstituentsSp500;
  let symbols = null;
  if (cacheFile) {
    const cached = await readJSON(cacheFile, null);
    const updatedAt = cached?.updatedAt ? Date.parse(String(cached.updatedAt)) : null;
    if (cached && Array.isArray(cached.symbols) && updatedAt && nowMs() - updatedAt <= CONSTITUENT_CACHE_TTL_MS) {
      symbols = cached.symbols;
      log?.(`[market-amv] 使用缓存成分股 ${idx}: ${symbols.length} 只`);
    }
  }
  if (!symbols) {
    log?.(`[market-amv] 拉取 ${idx} 成分股列表...`);
    const raw = idx === "nasdaq" ? await fmpNasdaqConstituents({ baseUrl, apiKey }) : await fmpSp500Constituents({ baseUrl, apiKey });
    symbols = raw.map((r) => r.symbol).filter(Boolean);
    if (cacheFile) await writeJSON(cacheFile, { updatedAt: new Date().toISOString(), provider: `fmp-${idx}-constituents`, symbols });
    log?.(`[market-amv] ${idx} 成分股: ${symbols.length} 只`);
  }

  log?.(`[market-amv] 拉取 screener 补全市值...`);
  const screenerRows = await fmpCompanyScreener({ baseUrl, apiKey, params: { exchange: "NYSE,NASDAQ", limit: "10000" } });
  const capMap = new Map();
  for (const r of screenerRows) capMap.set(String(r.symbol || "").toUpperCase(), Number(r.marketCap) || null);
  const merged = symbols.map((sym) => ({ symbol: sym, marketCap: capMap.get(sym) ?? null }));
  const sorted = merged.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  return sorted.slice(0, limit || DEFAULT_SAMPLE_LIMIT);
}

export function createMarketAmvService({ dataPaths, loadConfig, log, emitEvent }) {
  const emit = (event) => { if (emitEvent) emitEvent(event); };

  async function computeMarket0amv({ index = "all", limit, useFmp = true } = {}) {
    const cfg = await loadConfig();
    const baseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
    const apiKey = cfg.fmpApiKey;
    if (!apiKey) throw new Error("FMP API key is required for market 0AMV");
    const effectiveLimit = limit || cfg?.marketAmv?.sampleLimit || DEFAULT_SAMPLE_LIMIT;
    const idx = String(index || "all").toLowerCase();

    log(`[market-amv] 计算 ${idx} 0AMV，Top-N=${effectiveLimit}...`);
    const constituents = await resolveConstituents({ baseUrl, apiKey, index: idx, limit: effectiveLimit, dataPaths, log });
    if (constituents.length === 0) throw new Error(`No constituents for index ${idx}`);

    let totalAmv = 0;
    let processed = 0;
    const today = isoDateToday();

    for (const { symbol } of constituents) {
      if (!symbol) continue;
      try {
        const hist = await fmpHistoricalPriceEodFull({ baseUrl, apiKey, symbol });
        if (!Array.isArray(hist) || hist.length < SMA_PERIOD) continue;
        const sorted = hist.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const volumes = sorted.map((h) => h.volume);
        const lastClose = sorted[sorted.length - 1].close;
        const volSma = sma(volumes, SMA_PERIOD);
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
      index: idx,
      value: totalAmv / 1e6,
      sampleCount: constituents.length,
      processedCount: processed,
      source: "fmp"
    };
    try {
      await appendDesktopMarketAmvHistory(dataPaths, {
        date: result.date,
        index: idx,
        value: result.value,
        sampleCount: result.sampleCount,
        processedCount: result.processedCount,
        source: result.source,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      log(`[market-amv] 历史保存失败: ${e?.message || e}`);
    }
    log(`[market-amv] ${idx} 计算完成: ${result.value.toLocaleString()} 百万美元，有效样本 ${processed}/${constituents.length}`);
    return result;
  }

  let backfillAborted = false;

  async function backfillMarket0amv({ index, limit, fromDate, toDate } = {}) {
    const cfg = await loadConfig();
    const baseUrl = normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com");
    const apiKey = cfg.fmpApiKey;
    if (!apiKey) throw new Error("FMP API key is required for market 0AMV backfill");
    const idx = String(index || cfg?.marketAmv?.primaryIndex || "sp500").toLowerCase();
    const effectiveLimit = limit || cfg?.marketAmv?.sampleLimit || DEFAULT_SAMPLE_LIMIT;
    const backfillCfg = cfg?.marketAmv?.backfill || {};
    const concurrency = Math.max(1, backfillCfg.concurrency || 3);
    const delayMs = backfillCfg.delayMs || 200;
    const maxPerIndex = backfillCfg.maxPerIndex || 6000;
    const defaultYears = backfillCfg.defaultYears || 20;

    const today = toDate || isoDateToday();
    const from = fromDate || isoDateShiftYears(today, -defaultYears);
    log(`[market-amv] 回填 ${idx} 0AMV：${from} → ${today}，Top-N=${effectiveLimit}`);

    const constituents = await resolveConstituents({ baseUrl, apiKey, index: idx, limit: effectiveLimit, dataPaths, log });
    if (constituents.length === 0) throw new Error(`No constituents for index ${idx}`);
    const total = constituents.length;

    const backfillState = await loadMarketAmvBackfillState(dataPaths);
    const stateKey = idx;
    const saved = backfillState[stateKey] || {};
    const completedSymbols = new Set(Array.isArray(saved.completedSymbols) ? saved.completedSymbols : []);
    if (saved.fromDate !== from || saved.toDate !== today) {
      completedSymbols.clear();
    }

    const perSymbolSeries = new Map();
    let fetched = 0;
    let skipped = 0;
    const batches = chunk(constituents, concurrency);
    backfillAborted = false;

    for (let bi = 0; bi < batches.length; bi++) {
      if (backfillAborted) throw new Error("backfill aborted");
      const results = await Promise.all(batches[bi].map(async ({ symbol }) => {
        if (!symbol) return { symbol, ok: false };
        if (completedSymbols.has(symbol)) {
          return { symbol, ok: true, cached: true };
        }
        try {
          const hist = await fmpHistoricalPriceEodFull({ baseUrl, apiKey, symbol, from, to: today });
          if (!Array.isArray(hist) || hist.length < SMA_PERIOD) return { symbol, ok: false, reason: "data < SMA" };
          const sorted = hist.sort((a, b) => String(a.date).localeCompare(String(b.date)));
          return { symbol, ok: true, rows: sorted };
        } catch (e) {
          return { symbol, ok: false, reason: e.message };
        }
      }));
      for (const r of results) {
        if (r.ok && r.rows) {
          perSymbolSeries.set(r.symbol, r.rows);
          fetched++;
        } else if (!r.cached) {
          skipped++;
        }
        completedSymbols.add(r.symbol);
      }
      await saveMarketAmvBackfillState(dataPaths, {
        ...backfillState,
        [stateKey]: { fromDate: from, toDate: today, completedSymbols: [...completedSymbols], lastUpdatedAt: new Date().toISOString() }
      });
      const current = Math.min((bi + 1) * concurrency, total);
      emit({ type: "market_amv_progress", phase: "fetch", index: idx, current, total });
      log(`[market-amv] 拉取进度: ${current}/${total}`);
      if (delayMs > 0 && bi < batches.length - 1) await sleep(delayMs);
    }

    emit({ type: "market_amv_progress", phase: "aggregate", index: idx });
    log(`[market-amv] 本地聚合 ${idx} 0AMV 序列...`);

    const symbolData = new Map();
    const allDatesSet = new Set();
    for (const [symbol, rows] of perSymbolSeries) {
      const dates = rows.map((r) => String(r.date));
      const vols = rows.map((r) => Number(r.volume) || 0);
      const closes = rows.map((r) => Number(r.close) || 0);
      for (const d of dates) allDatesSet.add(d);
      symbolData.set(symbol, { dates, vols, closes, ptr: 0 });
    }
    const sortedDates = [...allDatesSet].sort((a, b) => a.localeCompare(b));
    const fromDateFilter = new Date(from);
    const toDateFilter = new Date(today);

    const entries = [];
    for (const date of sortedDates) {
      const dt = new Date(date);
      if (dt < fromDateFilter || dt > toDateFilter) continue;
      let sumAmv = 0;
      let processedCount = 0;
      for (const [symbol, data] of symbolData) {
        while (data.ptr + 1 < data.dates.length && data.dates[data.ptr + 1] <= date) data.ptr++;
        if (data.dates[data.ptr] !== date) continue;
        if (data.ptr < SMA_PERIOD - 1) continue;
        let volSum = 0;
        for (let k = data.ptr - SMA_PERIOD + 1; k <= data.ptr; k++) volSum += data.vols[k];
        const volSma = volSum / SMA_PERIOD;
        const closeOnDate = data.closes[data.ptr];
        if (closeOnDate > 0) {
          sumAmv += volSma * closeOnDate;
          processedCount++;
        }
      }
      if (processedCount > 0) {
        entries.push({
          date,
          index: idx,
          value: sumAmv / 1e6,
          sampleCount: constituents.length,
          processedCount,
          source: "fmp-backfill",
          timestamp: new Date().toISOString()
        });
      }
    }

    log(`[market-amv] 聚合完成: ${entries.length} 条，写入历史...`);
    await bulkAppendDesktopMarketAmvHistory(dataPaths, entries, { maxPerIndex });

    await saveMarketAmvBackfillState(dataPaths, {
      ...backfillState,
      [stateKey]: { fromDate: from, toDate: today, completedSymbols: [], lastUpdatedAt: new Date().toISOString(), lastCompletedAt: new Date().toISOString() }
    });

    emit({ type: "market_amv_progress", phase: "done", index: idx, entriesCount: entries.length });
    log(`[market-amv] ${idx} 回填完成: ${entries.length} 条，有效标的 ${fetched}/${total}`);
    return { index: idx, entries, processedSymbols: fetched, skippedSymbols: skipped, fromCache: 0 };
  }

  function cancelBackfill() {
    backfillAborted = true;
    log("[market-amv] 收到取消回填请求");
  }

  return { computeMarket0amv, backfillMarket0amv, cancelBackfill };
}
