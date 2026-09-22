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

// ========== index.html: remove "取前 N 市值" row ==========
patch(ROOT + "\\renderer\\index.html", [
  {
    label: "remove marketAmvLimit row",
    find: `            <div class="row">
              <label>取前 N 市值</label>
              <input id="marketAmvLimit" type="number" min="1" max="1000" step="10" value="100" />
            </div>
            <div id="marketAmvResult" class="meta"></div>`,
    replace: `            <div id="marketAmvResult" class="meta"></div>`
  }
]);

// ========== renderer.mjs: remove limit refs ==========
patch(ROOT + "\\renderer\\renderer.mjs", [
  {
    label: "remove marketAmvLimit el ref",
    find: '  marketAmvLimit: $("marketAmvLimit"),\n',
    replace: ''
  },
  {
    label: "btnComputeMarketAmv: remove limit",
    find: `    const limitRaw = Number(el.marketAmvLimit?.value);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const indexName = INDEX_NAME_MAP[index] || "全市场";`,
    replace: `    const indexName = INDEX_NAME_MAP[index] || "全市场";`
  },
  {
    label: "btnComputeMarketAmv: remove limit from API call",
    find: `      const result = await window.api.engine.runMarketAmv({ index, limit });`,
    replace: `      const result = await window.api.engine.runMarketAmv({ index });`
  },
  {
    label: "btnBackfillMarketAmv: remove limit",
    find: `    const limitRaw = Number(el.marketAmvLimit?.value);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const indexName = INDEX_NAME_MAP[index] || "全市场";
    const fromDate = "2000-01-01";`,
    replace: `    const indexName = INDEX_NAME_MAP[index] || "全市场";
    const fromDate = "2000-01-01";`
  },
  {
    label: "btnBackfillAllMarketAmv: remove limit",
    find: `    const limitRaw = Number(el.marketAmvLimit?.value);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const fromDate = "2000-01-01";
    const indices = ["sp500", "nasdaq"];`,
    replace: `    const fromDate = "2000-01-01";
    const indices = ["sp500", "nasdaq"];`
  },
  {
    label: "btnBackfillAllMarketAmv: remove limit from API call",
    find: `        const result = await window.api.engine.backfillMarketAmv({ index: idx, limit, fromDate });`,
    replace: `        const result = await window.api.engine.backfillMarketAmv({ index: idx, fromDate });`
  },
  {
    label: "btnBackfillMarketAmv: remove limit from API call",
    find: `      const result = await window.api.engine.backfillMarketAmv({ index, limit, fromDate });`,
    replace: `      const result = await window.api.engine.backfillMarketAmv({ index, fromDate });`
  }
]);

// ========== market-amv-service.mjs: remove limit from service ==========
patch(ROOT + "\\engine\\market-amv-service.mjs", [
  {
    label: "computeMarket0amv: remove effectiveLimit",
    find: `    const effectiveLimit = limit || cfg?.marketAmv?.sampleLimit || DEFAULT_SAMPLE_LIMIT;
    const idx = String(index || "all").toLowerCase();

    log(\`[market-amv] 计算 \${idx} 0AMV，Top-N=\${effectiveLimit}...\`);
    const constituents = await resolveConstituents({ baseUrl, apiKey, index: idx, limit: effectiveLimit, dataPaths, log });`,
    replace: `    const idx = String(index || "all").toLowerCase();

    log(\`[market-amv] 计算 \${idx} 0AMV（全部成分股）...\`);
    const constituents = await resolveConstituents({ baseUrl, apiKey, index: idx, dataPaths, log });`
  },
  {
    label: "backfillMarket0amv: remove effectiveLimit",
    find: `    const effectiveLimit = limit || cfg?.marketAmv?.sampleLimit || DEFAULT_SAMPLE_LIMIT;
    const backfillCfg = cfg?.marketAmv?.backfill || {};
    const concurrency = Math.max(1, backfillCfg.concurrency || 3);
    const delayMs = backfillCfg.delayMs || 200;
    const maxPerIndex = backfillCfg.maxPerIndex || 6000;
    const defaultYears = backfillCfg.defaultYears || 20;

    const today = toDate || isoDateToday();
    const from = fromDate || isoDateShiftYears(today, -defaultYears);
    log(\`[market-amv] 回填 \${idx} 0AMV：\${from} → \${today}，Top-N=\${effectiveLimit}\`);

    const constituents = await resolveConstituents({ baseUrl, apiKey, index: idx, limit: effectiveLimit, dataPaths, log });`,
    replace: `    const backfillCfg = cfg?.marketAmv?.backfill || {};
    const concurrency = Math.max(1, backfillCfg.concurrency || 3);
    const delayMs = backfillCfg.delayMs || 200;
    const maxPerIndex = backfillCfg.maxPerIndex || 6000;
    const defaultYears = backfillCfg.defaultYears || 20;

    const today = toDate || isoDateToday();
    const from = fromDate || isoDateShiftYears(today, -defaultYears);
    log(\`[market-amv] 回填 \${idx} 0AMV：\${from} → \${today}（全部成分股）\`);

    const constituents = await resolveConstituents({ baseUrl, apiKey, index: idx, dataPaths, log });`
  },
  {
    label: "resolveConstituents: don't slice for sp500/nasdaq",
    find: `  return sorted.slice(0, limit || DEFAULT_SAMPLE_LIMIT);
}`,
    replace: `  return sorted;
}`
  }
]);

console.log("All patches applied.");
