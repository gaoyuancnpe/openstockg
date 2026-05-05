import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
 dotenv.config({ path: path.resolve(__dirname, '../../.env') });

 import { MAJOR_US_STOCKS } from '../../lib/constants/stocks';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const DELAY_MS = 2000; // 2 seconds delay
 const CSV_FILE = path.resolve(__dirname, '../../screener_results.csv');

async function fetchJSON(url: string) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) {
             throw new Error(`Fetch failed ${res.status}: ${await res.text().catch(() => '')}`);
        }
        return await res.json();
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function getQuote(symbol: string) {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        return await fetchJSON(url);
    } catch (e) {
        console.error('Error fetching quote for', symbol, e);
        return null;
    }
}

async function getBasicFinancials(symbol: string) {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');
        const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`;
        return await fetchJSON(url);
    } catch (e) {
        console.error('Error fetching metrics for', symbol, e);
        return null;
    }
}

async function main() {
    console.log(`Starting fetch for ${MAJOR_US_STOCKS.length} stocks...`);
    console.log(`Saving to ${CSV_FILE}`);

    // CSV Header - Added Volume columns
    const header = 'Symbol,Price,Change,ChangePercent,MarketCap,PERatio,EPS,High52Week,Low52Week,AvgVolume10D,AvgVolume3M\n';
    fs.writeFileSync(CSV_FILE, header);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < MAJOR_US_STOCKS.length; i++) {
        const symbol = MAJOR_US_STOCKS[i];
        
        if (i > 0) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }

        process.stdout.write(`Processing ${symbol} (${i + 1}/${MAJOR_US_STOCKS.length})... `);
        
        try {
            // Fetch Quote
            const quote: any = await getQuote(symbol);
            if (!quote || typeof quote.c !== 'number') {
                console.log('❌ Invalid Quote');
                failCount++;
                continue;
            }

            // Fetch Metrics
            let metrics: any = {};
            try {
                const financials: any = await getBasicFinancials(symbol);
                if (financials && financials.metric) {
                    metrics = financials.metric;
                }
            } catch (e) {
                console.warn('(Metrics failed)');
            }

            // Prepare row
            const row = [
                symbol,
                quote.c ?? '',
                quote.d ?? '',
                quote.dp ?? '',
                metrics['marketCapitalization'] ?? '',
                metrics['peTTM'] ?? '',
                metrics['epsTTM'] ?? '',
                metrics['52WeekHigh'] ?? '',
                metrics['52WeekLow'] ?? '',
                metrics['10DayAverageTradingVolume'] ?? '', // Added Volume
                metrics['3MonthAverageTradingVolume'] ?? '' // Added Volume
            ].map(val => String(val).replace(/,/g, '')).join(','); 

            fs.appendFileSync(CSV_FILE, row + '\n');
            console.log('✅ Saved');
            successCount++;

        } catch (err) {
            console.log('❌ Error');
            console.error(err);
            failCount++;
        }
    }

    console.log(`\nDone!`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Results saved to ${CSV_FILE}`);
}

main().catch(console.error);
