import { MAJOR_US_STOCKS } from './constants/stocks';
import { getQuote, getBasicFinancials } from './actions/finnhub.actions';

export interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  high52Week?: number;
  low52Week?: number;
}

const DELAY_MS = 2000; // 2 seconds delay to respect API rate limits

export async function screenStocks(): Promise<StockData[]> {
  console.log(`Starting screener for ${MAJOR_US_STOCKS.length} stocks...`);
  const results: StockData[] = [];

  for (let i = 0; i < MAJOR_US_STOCKS.length; i++) {
    const symbol = MAJOR_US_STOCKS[i];
    
    // Rate limiting: wait before processing (except the first one)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }

    try {
      console.log(`Processing ${symbol} (${i + 1}/${MAJOR_US_STOCKS.length})...`);
      
      // Fetch quote
      const quote = await getQuote(symbol);
      
      // If no quote or invalid price, skip
      if (!quote || typeof quote.c !== 'number') {
        console.warn(`No valid quote data for ${symbol}`);
        continue;
      }

      // Fetch basic financials (metrics)
      let metrics = null;
      try {
         const financials = await getBasicFinancials(symbol);
         if (financials && financials.metric) {
            metrics = financials.metric;
         }
      } catch (err) {
         console.warn(`Failed to fetch metrics for ${symbol}`, err);
      }

      const stockData: StockData = {
        symbol,
        price: quote.c,
        change: quote.d,
        changePercent: quote.dp,
        marketCap: metrics?.marketCapitalization,
        peRatio: metrics?.peTTM,
        eps: metrics?.epsTTM,
        high52Week: metrics?.['52WeekHigh'],
        low52Week: metrics?.['52WeekLow'],
      };

      // Basic filtering logic can be added here.
      // For now, we collect all valid stocks.
      results.push(stockData);

      // Debug log for first 5 stocks to verify data quality
      if (i < 5) {
        console.log(`[DEBUG] Data for ${symbol}:`, JSON.stringify(stockData, null, 2));
      }

    } catch (error) {
      console.error(`Error processing ${symbol}:`, error);
    }
  }

  console.log(`Screener finished. Found ${results.length} stocks.`);
  return results;
}
