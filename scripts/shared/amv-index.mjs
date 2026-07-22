import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_KEY = process.env.FMP_API_KEY;
const BASE_URL = (process.env.FMP_BASE_URL || 'https://financialmodelingprep.com').replace(/\/+\$/, '');
const SMA_PERIOD = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
function sma(v, p) { return v.slice(-p).reduce((a, b) => a + b, 0) / p; }
function toNumber(x) { const n = typeof x === 'number' ? x : Number(x); return Number.isFinite(n) ? n : null; }

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fmp(pathName, params) {
  const u = new URL(BASE_URL + pathName);
  u.searchParams.set('apikey', API_KEY);
  if (params) for (const [k, v] of Object.entries(params)) { if (v != null && v !== '') u.searchParams.set(k, String(v)); }
  return fetchJSON(u.toString());
}

async function getSymbols(index, limit) {
  if (index === 'nasdaq') {
    const data = await fmp('/stable/company-screener', { exchange: 'NASDAQ', marketCapMoreThan: 10000000000, limit: limit || 500 });
    return Array.isArray(data) ? data.map(r => String(r.symbol).trim().toUpperCase()).filter(s => /^[A-Z0-9.-]+$/.test(s)) : [];
  }
  const data = await fmp('/stable/company-screener', { exchange: 'NASDAQ,NYSE', marketCapMoreThan: 10000000000, limit: limit || 1000 });
  return Array.isArray(data) ? data.map(r => String(r.symbol).trim().toUpperCase()).filter(s => /^[A-Z0-9.-]+$/.test(s)) : [];
}

async function getHistory(symbol) {
  const data = await fmp('/stable/historical-price-eod/full', { symbol });
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.historical) ? data.historical : []);
  return rows.map(r => ({ date: String(r.date || ''), close: toNumber(r.close), volume: toNumber(r.volume) }))
    .filter(r => r.date && r.close !== null && r.volume !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function computeIndex(symbols, concurrency, delayMs) {
  let total = 0;
  let processed = 0;
  let skipped = 0;
  let latestDate = '';
  const details = [];
  const batches = chunk(symbols, concurrency);
  for (let i = 0; i < batches.length; i++) {
    const results = await Promise.all(batches[i].map(async s => {
      try {
        const h = await getHistory(s);
        if (h.length < SMA_PERIOD) return { symbol: s, ok: false, reason: 'data < ' + SMA_PERIOD };
        const last = h[h.length - 1];
        const volSma = sma(h.map(x => x.volume), SMA_PERIOD);
        const amv = volSma * last.close;
        return { symbol: s, ok: true, date: last.date, close: last.close, volSma, amv };
      } catch (e) {
        return { symbol: s, ok: false, reason: e.message };
      }
    }));
    for (const r of results) {
      if (r.ok) { total += r.amv; processed++; latestDate = r.date; details.push(r); }
      else { skipped++; }
    }
    if (delayMs > 0 && i < batches.length - 1) await sleep(delayMs);
  }
  return { total, processed, skipped, latestDate, details };
}

const index = (process.argv.find(a => a.startsWith('--index=')) || '--index=sp500').split('=')[1];
const limit = Number((process.argv.find(a => a.startsWith('--limit=')) || '--limit=0').split('=')[1]);
const concurrency = Number((process.argv.find(a => a.startsWith('--concurrency=')) || '--concurrency=3').split('=')[1]);
const delayMs = Number((process.argv.find(a => a.startsWith('--delay=')) || '--delay=0').split('=')[1]);
const topN = Number((process.argv.find(a => a.startsWith('--top=')) || '--top=10').split('=')[1]);

if (index !== 'sp500' && index !== 'nasdaq') { console.error('--index must be sp500 or nasdaq'); process.exit(1); }

console.log('Computing 0AMV for ' + index.toUpperCase());
console.log('SMA period: ' + SMA_PERIOD + ' days');
const symbols = await getSymbols(index, limit > 0 ? limit : 0);
console.log('Constituents: ' + symbols.length);
const targets = limit > 0 ? symbols.slice(0, limit) : symbols;
console.log('Processing: ' + targets.length);
console.log('');

const start = Date.now();
const result = await computeIndex(targets, concurrency, delayMs);
result.details.sort((a, b) => b.amv - a.amv);

console.log('============================================================');
console.log('0AMV ' + index.toUpperCase());
console.log('Latest date: ' + result.latestDate);
console.log('Processed: ' + result.processed);
console.log('Skipped: ' + result.skipped);
console.log('0AMV value: ' + result.total.toFixed(2));
console.log('Time: ' + ((Date.now() - start) / 1000).toFixed(1) + 's');
console.log('============================================================');
console.log('');
console.log('Top ' + topN + ' contributors:');
for (const s of result.details.slice(0, topN)) {
  console.log('  ' + s.symbol + ' | close=' + s.close.toFixed(2) + ' | volSMA10=' + (s.volSma / 1e6).toFixed(2) + 'M | AMV=' + s.amv.toFixed(2));
}
