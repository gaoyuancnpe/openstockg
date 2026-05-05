import { config } from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
config({ path: envPath });

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

async function test() {
    const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    console.log('Token length:', token?.length);
    console.log('Token start:', token?.substring(0, 4));

    if (!token) {
        console.error('No token found');
        return;
    }

    // Test 1: Quote (Real-time)
    const quoteUrl = `${FINNHUB_BASE_URL}/quote?symbol=AAPL&token=${token}`;
    console.log('\nTesting Quote endpoint...');
    try {
        const res = await fetch(quoteUrl);
        if (res.ok) {
            console.log('✅ Quote success:', await res.json());
        } else {
            console.error('❌ Quote failed:', res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Quote error:', e);
    }

    // Test 2: Candles (1 day)
    const to = Math.floor(Date.now() / 1000);
    const from = to - 86400; // Last 24 hours
    const candlesUrl = `${FINNHUB_BASE_URL}/stock/candle?symbol=AAPL&resolution=D&from=${from}&to=${to}&token=${token}`;
    console.log('\nTesting Candles endpoint (1 day)...');
    try {
        const res = await fetch(candlesUrl);
        if (res.ok) {
            console.log('✅ Candles success:', await res.json());
        } else {
            console.error('❌ Candles failed:', res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Candles error:', e);
    }
}

test();
