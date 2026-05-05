import { config } from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
config({ path: envPath });

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

async function test() {
    const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
        console.error('No token found');
        return;
    }

    const symbol = 'AAPL';
    const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${symbol}&metric=all&token=${token}`;
    
    console.log(`Testing Metric endpoint for ${symbol}...`);
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log('✅ Metric success!');
            console.log('Keys:', Object.keys(data));
            if (data.metric) {
                console.log('52WeekHigh:', data.metric['52WeekHigh']);
                console.log('52WeekLow:', data.metric['52WeekLow']);
                console.log('MarketCap:', data.metric['marketCapitalization']);
            } else {
                console.log('No metric data found in response.');
            }
        } else {
            console.error('❌ Metric failed:', res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Metric error:', e);
    }
}

test();
