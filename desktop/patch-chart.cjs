const fs = require("fs");
const ROOT = "\\\\wsl.localhost\\Ubuntu-22.04\\home\\gaoyuan\\openstock-g\\OpenStock\\desktop";

function patch(path, replacements) {
  let content = fs.readFileSync(path, "utf8");
  for (const { find, replace, label } of replacements) {
    const count = content.split(find).length - 1;
    if (count === 0) throw new Error("[" + label + "] Anchor not found");
    if (count > 1) throw new Error("[" + label + "] Anchor not unique (" + count + "x)");
    content = content.replace(find, replace);
    console.log("  [" + label + "] OK");
  }
  fs.writeFileSync(path, content, "utf8");
}

// 1. index.html: add canvas before history list
patch(ROOT + "\\renderer\\index.html", [
  {
    label: "add canvas",
    find: '            <div id="marketAmvHistoryList" class="meta scrollList"></div>',
    replace: '            <canvas id="marketAmvChart" style="width:100%;max-width:640px;height:220px;display:block;margin:8px 0;border:1px solid #e0e0e0;border-radius:4px;"></canvas>\n            <div id="marketAmvHistoryList" class="meta scrollList"></div>'
  }
]);

// 2. renderer.mjs: el ref + drawMarketAmvChart + refresh call
const chartFn = [
  "function drawMarketAmvChart(history) {",
  "  const canvas = el.marketAmvChart;",
  "  if (!canvas) return;",
  "  const ctx = canvas.getContext(\"2d\");",
  "  const dpr = window.devicePixelRatio || 1;",
  "  const cssW = canvas.clientWidth || 640;",
  "  const cssH = canvas.clientHeight || 220;",
  "  canvas.width = Math.round(cssW * dpr);",
  "  canvas.height = Math.round(cssH * dpr);",
  "  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);",
  "  ctx.clearRect(0, 0, cssW, cssH);",
  "  if (!Array.isArray(history) || history.length < 2) {",
  "    ctx.fillStyle = \"#999\";",
  "    ctx.font = \"13px sans-serif\";",
  "    ctx.textAlign = \"center\";",
  "    ctx.fillText(\"暂无足够历史数据（回填后显示曲线）\", cssW / 2, cssH / 2);",
  "    return;",
  "  }",
  "  const rows = history.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));",
  "  const values = rows.map((r) => Number(r.value || 0));",
  "  const dates = rows.map((r) => String(r.date || \"\"));",
  "  let minV = Infinity, maxV = -Infinity;",
  "  for (const v of values) { if (v < minV) minV = v; if (v > maxV) maxV = v; }",
  "  if (minV === maxV) { minV -= 1; maxV += 1; }",
  "  const range = maxV - minV;",
  "  const ml = 56, mr = 14, mt = 18, mb = 30;",
  "  const plotW = cssW - ml - mr;",
  "  const plotH = cssH - mt - mb;",
  "  const xAt = (i) => ml + (i / (rows.length - 1)) * plotW;",
  "  const yAt = (v) => mt + plotH - ((v - minV) / range) * plotH;",
  "  ctx.strokeStyle = \"#e8e8e8\";",
  "  ctx.lineWidth = 1;",
  "  ctx.fillStyle = \"#666\";",
  "  ctx.font = \"11px sans-serif\";",
  "  ctx.textAlign = \"right\";",
  "  for (let t = 0; t <= 4; t++) {",
  "    const y = mt + (t / 4) * plotH;",
  "    const val = maxV - (t / 4) * range;",
  "    ctx.beginPath();",
  "    ctx.moveTo(ml, y);",
  "    ctx.lineTo(cssW - mr, y);",
  "    ctx.stroke();",
  "    ctx.fillText(val.toLocaleString(\"zh-CN\", { maximumFractionDigits: 0 }), ml - 4, y + 3);",
  "  }",
  "  ctx.textAlign = \"center\";",
  "  const xLabels = [0, Math.floor(rows.length / 2), rows.length - 1];",
  "  for (const idx of xLabels) {",
  "    if (dates[idx]) ctx.fillText(dates[idx], xAt(idx), cssH - 10);",
  "  }",
  "  ctx.strokeStyle = \"#2563eb\";",
  "  ctx.lineWidth = 1.5;",
  "  ctx.beginPath();",
  "  for (let i = 0; i < rows.length; i++) {",
  "    const x = xAt(i);",
  "    const y = yAt(values[i]);",
  "    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);",
  "  }",
  "  ctx.stroke();",
  "  const lastIdx = rows.length - 1;",
  "  const lx = xAt(lastIdx), ly = yAt(values[lastIdx]);",
  "  ctx.fillStyle = \"#2563eb\";",
  "  ctx.beginPath();",
  "  ctx.arc(lx, ly, 3, 0, Math.PI * 2);",
  "  ctx.fill();",
  "  ctx.fillStyle = \"#1e40af\";",
  "  ctx.font = \"bold 11px sans-serif\";",
  "  ctx.textAlign = \"right\";",
  "  ctx.fillText(values[lastIdx].toLocaleString(\"zh-CN\", { maximumFractionDigits: 1 }), cssW - mr - 2, ly - 6);",
  "}",
].join("\n");

patch(ROOT + "\\renderer\\renderer.mjs", [
  {
    label: "el marketAmvChart ref",
    find: '  marketAmvHistoryList: $("marketAmvHistoryList"),',
    replace: '  marketAmvHistoryList: $("marketAmvHistoryList"),\n  marketAmvChart: $("marketAmvChart"),'
  },
  {
    label: "insert drawMarketAmvChart before renderMarketAmvHistory",
    find: "function renderMarketAmvHistory(history) {",
    replace: chartFn + "\n\nfunction renderMarketAmvHistory(history) {"
  },
  {
    label: "call drawMarketAmvChart in refreshMarketAmvHistory",
    find: ".then((history) => renderMarketAmvHistory(history))",
    replace: ".then((history) => { renderMarketAmvHistory(history); drawMarketAmvChart(history); })"
  }
]);

console.log("All patches applied.");
