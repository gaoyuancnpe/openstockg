import YahooFinance from 'yahoo-finance2';

async function testYahoo() {
  console.log('Testing Yahoo Finance connectivity...');
  
  try {
    console.log('Instantiating YahooFinance...');
    // @ts-ignore
    const yf = new YahooFinance();
    
    console.log('Fetching quote for AAPL...');
    const quote = await yf.quote('AAPL');
    console.log('✅ Success! Yahoo Finance is accessible.');
    console.log('Price:', quote.regularMarketPrice);
    
    console.log('Fetching historical data for AAPL...');
    const queryOptions = { period1: '2024-01-01', interval: '1d' };
    const history = await yf.historical('AAPL', queryOptions);
    console.log(`✅ History fetched. ${history.length} days.`);
    
  } catch (error: any) {
    console.error('❌ Failed.');
    console.error('Error details:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

testYahoo();
