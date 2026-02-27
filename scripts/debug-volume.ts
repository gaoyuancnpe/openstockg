import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

async function fetchJSON(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return await res.json();
}

async function main() {
    const symbol = 'AAPL';
    const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    
    console.log(`Checking candle data for ${symbol}...`);

    // Get today's timestamp (start of day)
    const now = Math.floor(Date.now() / 1000);
    const startOfDay = now - (now % 86400); // Rough start of day in UTC
    // Use a slightly wider range to be safe (last 2 days)
    const from = now - 86400 * 2; 
    const to = now;

    const candleUrl = `${FINNHUB_BASE_URL}/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${token}`;
    const candles: any = await fetchJSON(candleUrl);

    console.log('--- Candle Response ---');
    console.log(JSON.stringify(candles, null, 2));

    if (candles.v && candles.v.length > 0) {
        console.log(`Latest Volume: ${candles.v[candles.v.length - 1]}`);
    } else {
        console.log('No volume data in candles');
    }
}

main().catch(console.error);
