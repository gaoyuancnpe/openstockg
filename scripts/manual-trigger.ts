import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// Load environment variables FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Loading environment variables...');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Dynamic imports to ensure env vars are loaded first
const { screenStocks } = await import('../lib/screener');
const { sendDailyScreenerEmail } = await import('../lib/nodemailer/index');
const { formatMarketCapValue } = await import('../lib/utils');

async function main() {
  console.log('Starting manual trigger...');
  
  // 1. Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI must be set in .env');
    process.exit(1);
  }
  
  try {
    await mongoose.connect(uri, { bufferCommands: false });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Database connection failed', err);
    process.exit(1);
  }

  try {
    // 2. Run Screener
    console.log('Running stock screener...');
    const stocks = await screenStocks();
    console.log(`✅ Screener completed. Found ${stocks.length} stocks.`);

    if (stocks.length === 0) {
      console.warn('No stocks found. Skipping email.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // 3. Format Table Rows
    // Sort by change percent descending (top gainers)
    stocks.sort((a, b) => b.changePercent - a.changePercent);

    const tableRows = stocks.map(stock => {
      const color = stock.change >= 0 ? 'green' : 'red';
      const arrow = stock.change >= 0 ? '▲' : '▼';
      // Basic styling for email table row
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><b>${stock.symbol}</b></td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${stock.price.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; color: ${color};">
            ${arrow} ${stock.change.toFixed(2)} (${stock.changePercent.toFixed(2)}%)
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${stock.marketCap ? formatMarketCapValue(stock.marketCap) : 'N/A'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${stock.peRatio ? stock.peRatio.toFixed(2) : 'N/A'}</td>
        </tr>
      `;
    }).join('');

    // 4. Get Users
    console.log('Fetching users...');
    const db = mongoose.connection.db;
    if (!db) throw new Error('DB connection lost');

    const users = await db.collection('user').find(
        { email: { $exists: true, $ne: null } },
        { projection: { email: 1, name: 1 } }
    ).toArray();

    console.log(`Found ${users.length} users to email.`);
    
    const today = new Date().toISOString().split('T')[0];

    // 5. Send Emails
    for (const user of users) {
      if (!user.email) continue;
      
      console.log(`Sending email to ${user.email}...`);
      try {
        await sendDailyScreenerEmail({
          email: user.email,
          date: today,
          tableRows
        });
        // Add small delay to avoid spamming SMTP
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Failed to send email to ${user.email}`, err);
      }
    }

    console.log('✅ All emails processed.');

  } catch (error) {
    console.error('❌ Error during manual trigger:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

main().catch(console.error);
