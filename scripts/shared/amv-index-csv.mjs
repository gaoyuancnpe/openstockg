import fs from 'node:fs';

const CSV_PATH = (process.argv.find(a => a.startsWith('--csv=')) || '--csv=screener_results.csv').split('=')[1];
const text = fs.readFileSync(CSV_PATH, 'utf8');
const rows = text.split('\n').slice(1).filter(Boolean).map(line => line.split(','));

let totalAMV = 0;
let count = 0;
const topStocks = [];

for (const row of rows) {
  const symbol = String(row[0] || '').trim().toUpperCase();
  const price = Number(row[1]);
  const avgVol10d = Number(row[9]);
  if (!symbol || !Number.isFinite(price) || !Number.isFinite(avgVol10d)) continue;
  const amv = avgVol10d * 1e6 * price;
  totalAMV += amv;
  count += 1;
  topStocks.push({ symbol, amv, price, avgVol10d });
}

topStocks.sort((a, b) => b.amv - a.amv);

console.log('0AMV 重编结果（基于本地 CSV 样本）');
console.log('数据源：' + CSV_PATH);
console.log('样本数量：' + count);
console.log('0AMV 总值：' + totalAMV.toFixed(2));
console.log('');
console.log('Top 10 单只贡献：');
for (const s of topStocks.slice(0, 10)) {
  console.log('  ' + s.symbol + ' | 价格=' + s.price.toFixed(2) + ' | 10日平均量=' + s.avgVol10d.toFixed(2) + 'M | 活筹市值=' + s.amv.toFixed(2));
}
