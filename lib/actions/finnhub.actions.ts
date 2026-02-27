'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { cache } from 'react';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const options: RequestInit & { next?: { revalidate?: number } } = {
        signal: controller.signal,
        headers: {
            'User-Agent': 'OpenStock/1.0',
            'Accept': 'application/json',
        },
        ...(revalidateSeconds
            ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
            : { cache: 'no-store' })
    };

    try {
        const res = await fetch(url, options);
        clearTimeout(id);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            // console.error(`Fetch failed ${res.status}: ${text}`);
            throw new Error(`Fetch failed ${res.status}: ${text}`);
        }
        return (await res.json()) as T;
    } catch (error: any) {
        clearTimeout(id);
        throw error;
    }
}

export { fetchJSON };

export async function getUSStockSymbols() {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');
        
        const url = `${FINNHUB_BASE_URL}/stock/symbol?exchange=US&token=${token}`;
        // Cache for 24 hours
        return await fetchJSON<{ symbol: string; description: string; type: string }[]>(url, 86400);
    } catch (e) {
        console.error('Error fetching US symbols', e);
        return [];
    }
}

export async function getStockCandles(
    symbol: string,
    resolution: '1' | '5' | '15' | '30' | '60' | 'D' | 'W' | 'M',
    from: number,
    to: number
) {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');

        const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(
            symbol
        )}&resolution=${resolution}&from=${from}&to=${to}&token=${token}`;
        // No caching for latest candles if we want fresh data
        return await fetchJSON<{
            c: number[]; // close prices
            h: number[]; // high prices
            l: number[]; // low prices
            o: number[]; // open prices
            s: string;   // status
            t: number[]; // timestamps
            v: number[]; // volumes
        }>(url, 0);
    } catch (e) {
        console.error('Error fetching candles for', symbol, e);
        return null;
    }
}

export async function getQuote(symbol: string) {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');

        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        // No caching for real-time price
        return await fetchJSON<any>(url, 0);
    } catch (e) {
        console.error('Error fetching quote for', symbol, e);
        return null;
    }
}

export async function getCompanyProfile(symbol: string) {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');

        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        // Cache profile for 24 hours
        return await fetchJSON<any>(url, 86400);
    } catch (e) {
        console.error('Error fetching profile for', symbol, e);
        return null;
    }
}

export async function getBasicFinancials(symbol: string) {
    try {
        const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) throw new Error('Finnhub API Key is missing');

        const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`;
        // Cache for 24 hours
        return await fetchJSON<any>(url, 86400);
    } catch (e) {
        console.error('Error fetching metrics for', symbol, e);
        return null;
    }
}

export async function getWatchlistData(symbols: string[]) {
    if (!symbols || symbols.length === 0) return [];
    // ... (rest of implementation if needed, but for screener we don't need this yet)
    return [];
}
