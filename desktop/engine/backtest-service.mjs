/* 规则回测：把盯盘规则放到历史上做事件研究——复用与实盘完全相同的 evaluate 求值器，
 * 逐日滚动计算规则变量,统计触发事件与触发后的前向收益(1/5/20 个交易日)。
 * 价格侧变量纯本地计算;基本面变量用 point-in-time 对齐(只用财报 accepted/filing 日期
 * 早于当日的报表,避免未来函数)。
 * 资源口径:每个 symbol 一次全史 EOD(+需要 5 日新高对照 5 年窗口时多取 5 年缓冲),
 * 基本面每 symbol 一次 income(20 季)+key-metrics(20 季)。symbol 上限 10。 */
import { isoDateToday, isoDateShiftDays } from "./shared.mjs";
import { fmpHistoricalPriceEodFull, fmpIncomeStatements, fmpKeyMetrics } from "./providers.mjs";
import { evaluate, collectVars } from "./rule-domain.mjs";
import { loadDesktopRules } from "../main/data-store.mjs";

const MAX_SYMBOLS = 10;

/** 价格侧可滚动计算;基本面侧 point-in-time 对齐 */
const PRICE_VARS = new Set([
  "price", "changePercent", "turnoverM", "volumeRatio", "sma20", "rsi14",
  "recent5dCloseAth", "closeAth250d", "closeChangePercent1d"
]);
const FUNDAMENTAL_VARS = new Set([
  "marketCap", "revenueGrowthYoY", "grossMargin", "ebitdaM", "profitGrowthYoY",
  "revenueGrowthYoYDeltaVsPrevQuarter", "earningsWithin1TradingDay"
]);
const SUPPORTED_VARS = new Set([...PRICE_VARS, ...FUNDAMENTAL_VARS]);

function normalizeSymbolList(raw) {
  const list = (Array.isArray(raw) ? raw : []).map((s) => String(s || "").trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s));
  const unique = [...new Set(list)];
  if (unique.length === 0) throw new Error("symbols 不能为空（回测不跑全市场，请给 1-10 个代码）");
  if (unique.length > MAX_SYMBOLS) throw new Error(`回测 symbol 上限 ${MAX_SYMBOLS} 个，收到 ${unique.length} 个`);
  return unique;
}

function requireFmp(config) {
  const apiKey = String(config?.fmpApiKey || "");
  if (!apiKey) throw new Error("缺少 FMP API Key，请先在配置中填写");
  return { apiKey, baseUrl: String(config?.fmpBaseUrl || "https://financialmodelingprep.com") };
}

function resolveConditionVarNames(node) {
  return [...collectVars(node)].map((v) => String(v).replace(/^prev\./, ""));
}

/** Wilder RSI */
function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function rollingMax(values, window) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    let max = -Infinity;
    for (let j = start; j <= i; j += 1) if (values[j] !== null && values[j] > max) max = values[j];
    out[i] = max === -Infinity ? null : max;
  }
  return out;
}

function rollingMeanSkipNull(values, window, endIndex) {
  let sum = 0;
  let count = 0;
  const start = Math.max(0, endIndex - window + 1);
  for (let j = start; j <= endIndex; j += 1) {
    if (values[j] !== null && values[j] !== undefined) { sum += values[j]; count += 1; }
  }
  return count > 0 ? sum / count : null;
}

/** point-in-time 基本面:按财报生效日(accepted||filing||date)对齐到 <= 当日的最新一期 */
function buildFundamentalTimeline(symbol, income, keyMetrics) {
  const points = [];
  for (let i = 0; i < income.length; i += 1) {
    const row = income[i];
    const effective = row.acceptedDate || row.filingDate || row.date;
    const prevQ = income[i + 1] || null;
    const priorYearQ = income[i + 4] || null;
    const priorYearPrevQ = income[i + 5] || null;
    const growthYoY = row.revenue !== null && priorYearQ?.revenue
      ? ((row.revenue - priorYearQ.revenue) / priorYearQ.revenue) * 100 : null;
    const growthPrevQ = prevQ && priorYearPrevQ && prevQ.revenue !== null && priorYearPrevQ.revenue
      ? ((prevQ.revenue - priorYearPrevQ.revenue) / priorYearPrevQ.revenue) * 100 : null;
    points.push({
      effective,
      earningsDate: row.acceptedDate || row.filingDate || "",
      revenueGrowthYoY: growthYoY,
      revenueGrowthYoYDeltaVsPrevQuarter: growthYoY !== null && growthPrevQ !== null ? growthYoY - growthPrevQ : null,
      grossMargin: row.revenue && row.grossProfit !== null ? (row.grossProfit / row.revenue) * 100 : null,
      ebitdaM: row.ebitda !== null ? row.ebitda / 1e6 : null,
      profitGrowthYoY: row.netIncome !== null && priorYearQ?.netIncome !== null && priorYearQ.netIncome
        ? ((row.netIncome - priorYearQ.netIncome) / Math.abs(priorYearQ.netIncome)) * 100 : null
    });
  }
  for (const point of points) {
    // key-metrics 与财报的期末日未必同日(如 6-27 vs 6-30):按最近 60 天内匹配挂市值
    const match = keyMetrics.find((k) => Math.abs(Date.parse(k.date) - Date.parse(point.effective)) < 60 * 86400000);
    point.marketCap = match && match.marketCap !== null ? match.marketCap / 1e6 : null;
  }
  return points.filter((p) => p.effective).sort((a, b) => a.effective.localeCompare(b.effective));
}

function fundamentalAt(points, date) {
  let found = null;
  for (const p of points) {
    if (p.effective.slice(0, 10) <= date) found = p; else break;
  }
  return found;
}

export async function backtestRule({ dataPaths, config, ruleName, condition, symbols: rawSymbols, years = 2 }) {
  const symbols = normalizeSymbolList(rawSymbols);
  const lookbackYears = Math.max(1, Math.min(5, Math.trunc(Number(years) || 2)));

  // 解析条件:优先按规则名取现成规则,否则用调用方给的 condition 树
  let node = condition && typeof condition === "object" ? condition : null;
  let resolvedFrom = condition ? "inline" : "";
  if (ruleName) {
    const rules = await loadDesktopRules(dataPaths);
    const rule = rules.find((r) => r?.name === ruleName);
    if (!rule) throw new Error(`找不到规则：${ruleName}（先 list_rules 确认名称）`);
    if (!rule.condition || typeof rule.condition !== "object") {
      throw new Error(`规则 ${ruleName} 缺少引擎形状的 condition 树，无法回测`);
    }
    node = rule.condition;
    resolvedFrom = `规则「${ruleName}」`;
  }
  if (!node) throw new Error("需要 ruleName(回测现有规则)或 condition(临时条件树)二选一");

  const vars = resolveConditionVarNames(node);
  const unsupported = vars.filter((v) => !SUPPORTED_VARS.has(v));
  if (unsupported.length > 0) {
    throw new Error(
      `回测暂不支持这些变量：${unsupported.join("、")}。支持：${[...SUPPORTED_VARS].join("、")}。`
      + "可改写条件后重试。"
    );
  }
  const needFundamentals = vars.some((v) => FUNDAMENTAL_VARS.has(v));
  const needAth5yBuffer = vars.includes("recent5dCloseAth");
  const { apiKey, baseUrl } = requireFmp(config);

  const today = isoDateToday();
  const windowStart = isoDateShiftDays(today, -Math.round(lookbackYears * 365.25));
  const historyFrom = isoDateShiftDays(today, -Math.round((lookbackYears + (needAth5yBuffer ? 5.2 : 0.05)) * 365.25));

  const perSymbol = [];
  const events = [];
  const errors = [];

  for (const symbol of symbols) {
    try {
      const rows = await fmpHistoricalPriceEodFull({ baseUrl, apiKey, symbol, from: historyFrom });
      if (rows.length < 30) throw new Error(`历史数据不足(${rows.length} 根)`);

      const closes = rows.map((r) => r.close);
      const highs = rows.map((r) => r.high);
      const volumes = rows.map((r) => r.volume);
      const dates = rows.map((r) => r.date);
      const sma20 = closes.map((_, i) => rollingMeanSkipNull(closes, 20, i));
      const volSMA20 = volumes.map((_, i) => rollingMeanSkipNull(volumes, 20, i));
      const rsi14 = rsiSeries(closes);
      const maxHigh5d = rollingMax(highs, 5);
      const maxClose250d = rollingMax(closes, 250);
      const maxHigh5y = rollingMax(highs, Math.round(5 * 252));

      const fundamentalPoints = needFundamentals
        ? buildFundamentalTimeline(
          symbol,
          await fmpIncomeStatements({ baseUrl, apiKey, symbol, period: "quarter", limit: 20 }).catch(() => []),
          await fmpKeyMetrics({ baseUrl, apiKey, symbol, period: "quarter", limit: 20 }).catch(() => [])
        )
        : [];

      let prevCtx = null;
      let prevFired = false;
      for (let i = 1; i < rows.length; i += 1) {
        const date = dates[i];
        const ctx = {
          price: closes[i],
          changePercent: closes[i - 1] ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : null,
          closeChangePercent1d: closes[i - 1] ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : null,
          turnoverM: closes[i] !== null && volumes[i] !== null ? (closes[i] * volumes[i]) / 1e6 : null,
          volumeRatio: volSMA20[i] ? volumes[i] / volSMA20[i] : null,
          sma20: sma20[i],
          rsi14: rsi14[i],
          recent5dCloseAth: maxHigh5d[i] !== null && maxHigh5y[i - 1] !== null
            ? (maxHigh5d[i] >= maxHigh5y[i - 1] ? 1 : 0)
            : null,
          closeAth250d: maxClose250d[i - 1] !== null ? (closes[i] >= maxClose250d[i - 1] ? 1 : 0) : null
        };
        if (needFundamentals) {
          const f = fundamentalAt(fundamentalPoints, date);
          ctx.marketCap = f?.marketCap ?? null;
          ctx.revenueGrowthYoY = f?.revenueGrowthYoY ?? null;
          ctx.revenueGrowthYoYDeltaVsPrevQuarter = f?.revenueGrowthYoYDeltaVsPrevQuarter ?? null;
          ctx.grossMargin = f?.grossMargin ?? null;
          ctx.ebitdaM = f?.ebitdaM ?? null;
          ctx.profitGrowthYoY = f?.profitGrowthYoY ?? null;
          ctx.earningsWithin1TradingDay = f?.earningsDate
            ? (f.earningsDate.slice(0, 10) === date || f.earningsDate.slice(0, 10) === dates[i - 1] ? 1 : 0)
            : null;
        }

        const fired = Boolean(evaluate(node, ctx, prevCtx));
        // 只统计回看窗口内、且"由假转真"的事件起点(连续命中算一次)
        if (fired && !prevFired && date >= windowStart) {
          const fwd = (n) => (closes[i + n] != null && closes[i]
            ? Math.round(((closes[i + n] - closes[i]) / closes[i]) * 10000) / 100
            : null);
          events.push({
            symbol, date,
            close: closes[i],
            fwd1d: fwd(1), fwd5d: fwd(5), fwd20d: fwd(20)
          });
        }
        prevFired = fired;
        prevCtx = ctx;
      }
      perSymbol.push({ symbol, bars: rows.length, inWindowBars: rows.filter((r) => r.date >= windowStart).length });
    } catch (error) {
      errors.push({ symbol, error: String(error?.message || error).slice(0, 160) });
    }
  }

  const pick = (key) => events.map((e) => e[key]).filter((v) => v !== null && v !== undefined);
  const stat = (values) => values.length === 0 ? null : {
    count: values.length,
    avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
    winRate: Math.round((values.filter((v) => v > 0).length / values.length) * 1000) / 10
  };
  return {
    rule: resolvedFrom,
    windowStart,
    windowYears: lookbackYears,
    symbols,
    perSymbol,
    errors,
    stats: {
      totalEvents: events.length,
      fwd1d: stat(pick("fwd1d")),
      fwd5d: stat(pick("fwd5d")),
      fwd20d: stat(pick("fwd20d"))
    },
    total: events.length,
    truncated: events.length > 100,
    events: events.slice(-100)
  };
}
