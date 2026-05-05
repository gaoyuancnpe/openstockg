import { normalizeHttpBaseUrl, toNumber } from "../shared-runtime.mjs";
import { chunk, appendJsonLine } from "./shared.mjs";
import { computeIndicators, buildEvalContext, quoteToEvalContext } from "./indicator-domain.mjs";
import { computeFmpDefaultStats, loadFmpDefaultUniverse, loadUniverseUS } from "./fmp-domain.mjs";
import { buildTransport, notifyAlert } from "./notification-domain.mjs";
import {
  buildRuleKey,
  fireRuleAlert,
  isFmpDefaultRuleCompatible,
  summarizeCondition
} from "./rule-domain.mjs";
import { finnhubBasicFinancials, finnhubQuote } from "./providers.mjs";

export function createAlertsRunner({
  dataPaths,
  loadConfig,
  loadRules,
  loadState,
  saveState,
  log,
  emitEvent
}) {
  let busy = false;

  const appendEventLine = async (event) => appendJsonLine(dataPaths.events, event);

  async function runFmpRule({
    rule,
    universe,
    useUniverse,
    manualSymbols,
    dryRun,
    state,
    runtime
  }) {
    const { fmpBaseUrl, fmpApiKey, transport, fromUser, defaultEmailTo, defaultWebhookUrl } = runtime;
    const ruleName = rule.name || "未命名规则";
    const notifyEmailTo = String(rule.notify?.email || defaultEmailTo || "");
    const notifyWebhookUrl = String(rule.notify?.webhookUrl || defaultWebhookUrl || "");
    const conditionText = summarizeCondition(rule.condition);
    const ruleKey = buildRuleKey(rule);
    const ruleCooldownSec = Number.parseInt(String(rule.cooldownSec || ""), 10);
    const cooldownSec = Number.isFinite(ruleCooldownSec) ? ruleCooldownSec : 900;

    let fmpRows = [];
    if (useUniverse) {
      const minMarketCap = toNumber(universe.minMarketCap) ?? 10000;
      log(`规则 ${ruleName}：准备加载 FMP 候选池...`);
      const meta = await loadFmpDefaultUniverse({
        dataPaths,
        baseUrl: fmpBaseUrl,
        apiKey: fmpApiKey,
        force: false,
        maxAgeDays: 1,
        log,
        minMarketCapM: minMarketCap
      });
      const list = meta.rows;
      const maxScan = Number.parseInt(String(universe.maxScan ?? "2000"), 10);
      const scanCount = Number.isFinite(maxScan) ? maxScan : 2000;
      fmpRows = list.slice(0, Math.min(list.length, scanCount));
      log(`规则 ${ruleName}：FMP 候选池 ${list.length} 支（按市值从高到低，来源=${meta.source}），本轮固定扫描前 ${fmpRows.length} 支`);
    } else {
      fmpRows = manualSymbols.map((symbol) => ({ symbol, marketCap: null }));
      log(`规则 ${ruleName}：手动标的 ${fmpRows.length} 支`);
    }

    let processedFmp = 0;
    for (const rowsBatch of chunk(fmpRows, 2)) {
      const batchResults = await Promise.all(rowsBatch.map(async (row) => {
        const symbol = String(row?.symbol || "").toUpperCase();
        if (!symbol) return null;
        const stats = await computeFmpDefaultStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol, state }).catch((error) => {
          log(`FMP error ${symbol} ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
        return stats ? { row, symbol, stats } : null;
      }));

      processedFmp += rowsBatch.length;
      log(`规则 ${ruleName}：FMP 进度 ${Math.min(processedFmp, fmpRows.length)}/${fmpRows.length}`);
      for (const result of batchResults) {
        if (!result) continue;
        const { row, symbol, stats } = result;
        const minPrice = useUniverse ? toNumber(universe.minPrice) : null;
        const minMarketCap = useUniverse ? toNumber(universe.minMarketCap) : null;
        if (minPrice !== null && stats.price !== null && stats.price < minPrice) continue;
        if (minMarketCap !== null && stats.marketCap !== null && stats.marketCap < minMarketCap) continue;

        const ctx = {
          symbol,
          price: stats.price,
          marketCap: stats.marketCap ?? toNumber(row?.marketCap),
          turnoverM: stats.turnoverM,
          recent5dCloseAth: stats.recent5dCloseAth,
          changePercent: null,
          change: null,
          prevClose: null,
          open: null,
          high: null,
          low: null
        };

        await fireRuleAlert({
          rule,
          symbol,
          ctx,
          conditionText,
          dryRun,
          state,
          ruleKey,
          cooldownSec,
          emitEvent,
          appendEventLine,
          log,
          notify: (payload) => notifyAlert({
            ...payload,
            notifyEmailTo,
            notifyWebhookUrl,
            transport,
            fromUser,
            log
          })
        });
      }
    }
  }

  async function runFinnhubRule({
    rule,
    universe,
    useUniverse,
    manualSymbols,
    dryRun,
    state,
    runtime
  }) {
    const { finnhubBaseUrl, finnhubApiKey, transport, fromUser, defaultEmailTo, defaultWebhookUrl } = runtime;
    const ruleName = rule.name || "未命名规则";
    const notifyEmailTo = String(rule.notify?.email || defaultEmailTo || "");
    const notifyWebhookUrl = String(rule.notify?.webhookUrl || defaultWebhookUrl || "");
    const conditionText = summarizeCondition(rule.condition);
    const ruleKey = buildRuleKey(rule);
    const ruleCooldownSec = Number.parseInt(String(rule.cooldownSec || ""), 10);
    const cooldownSec = Number.isFinite(ruleCooldownSec) ? ruleCooldownSec : 900;

    let symbols = manualSymbols;
    if (useUniverse) {
      log(`规则 ${ruleName}：准备加载 Finnhub 标的池...`);
      const universeMeta = await loadUniverseUS({
        dataPaths,
        baseUrl: finnhubBaseUrl,
        apiKey: finnhubApiKey,
        force: false,
        maxAgeDays: 7,
        log,
        provider: "finnhub"
      });
      const list = universeMeta.symbols;
      const maxScan = Number.parseInt(String(universe.maxScan ?? "2000"), 10);
      const scanCount = Number.isFinite(maxScan) ? maxScan : 2000;
      symbols = list.slice(0, Math.min(list.length, scanCount));
      log(`规则 ${ruleName}：Finnhub 标的池 ${list.length} 支，本轮固定扫描前 ${symbols.length} 支`);
    } else {
      log(`规则 ${ruleName}：手动标的 ${symbols.length} 支`);
    }

    if (!symbols || symbols.length === 0) return;

    let processedFinnhub = 0;
    for (const symbolsBatch of chunk(symbols, 25)) {
      const quotes = await Promise.all(symbolsBatch.map(async (symbol) => ({
        symbol,
        quote: await finnhubQuote({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol })
      })));
      processedFinnhub += symbolsBatch.length;
      log(`规则 ${ruleName}：Finnhub 进度 ${Math.min(processedFinnhub, symbols.length)}/${symbols.length}`);

      for (const { symbol, quote } of quotes) {
        if (!quote || quote.price === null) continue;

        if (useUniverse) {
          const minPrice = toNumber(universe.minPrice);
          const minMarketCap = toNumber(universe.minMarketCap);
          const minVolumeRatio = toNumber(universe.minVolumeRatio);
          if (minPrice !== null && quote.price !== null && quote.price < minPrice) continue;

          let extra = {};
          if (minMarketCap !== null) {
            const fin = await finnhubBasicFinancials({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol }).catch(() => null);
            if (!fin || fin.marketCap === null) continue;
            if (fin.marketCap < minMarketCap) continue;
            extra.marketCap = fin.marketCap;
          }

          if (minVolumeRatio !== null) {
            const volIndicators = await computeIndicators({
              baseUrl: finnhubBaseUrl,
              apiKey: finnhubApiKey,
              symbol,
              condition: { volumeRatio: true },
              state
            }).catch(() => ({}));
            const volumeRatio = toNumber(volIndicators.volumeRatio);
            if (volumeRatio === null || volumeRatio < minVolumeRatio) continue;
            extra.volumeRatio = volumeRatio;
          }

          const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: rule.condition, state });
          const ctx = quoteToEvalContext({ symbol, quote, extra: { ...extra, ...indicators } });
          await fireRuleAlert({
            rule,
            symbol,
            ctx,
            conditionText,
            dryRun,
            state,
            ruleKey,
            cooldownSec,
            emitEvent,
            appendEventLine,
            log,
            notify: (payload) => notifyAlert({
              ...payload,
              notifyEmailTo,
              notifyWebhookUrl,
              transport,
              fromUser,
              log
            })
          });
          continue;
        }

        const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: rule.condition, state });
        const ctx = buildEvalContext({ symbol, quote, indicators });
        await fireRuleAlert({
          rule,
          symbol,
          ctx,
          conditionText,
          dryRun,
          state,
          ruleKey,
          cooldownSec,
          emitEvent,
          appendEventLine,
          log,
          notify: (payload) => notifyAlert({
            ...payload,
            notifyEmailTo,
            notifyWebhookUrl,
            transport,
            fromUser,
            log
          })
        });
      }
    }
  }

  async function tick({ dryRun }) {
    if (busy) {
      log("已有任务在运行，已忽略本次请求");
      return;
    }
    busy = true;
    try {
      log(`开始${dryRun ? "dry-run" : "执行"}...`);
      const cfg = await loadConfig();
      const rules = (await loadRules()).filter((rule) => rule && rule.enabled);
      const state = await loadState();
      log(`本轮启用规则 ${rules.length} 条，数据源=${String(cfg.dataProvider || "finnhub").toUpperCase()}`);

      const runtime = {
        dataProvider: String(cfg.dataProvider || "finnhub").toLowerCase(),
        finnhubBaseUrl: normalizeHttpBaseUrl(cfg.finnhubBaseUrl, "https://finnhub.io/api/v1"),
        finnhubApiKey: String(cfg.finnhubApiKey || ""),
        fmpBaseUrl: normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com"),
        fmpApiKey: String(cfg.fmpApiKey || ""),
        transport: buildTransport(cfg.email),
        fromUser: String(cfg.email?.user || ""),
        defaultEmailTo: String(cfg.defaultEmailTo || ""),
        defaultWebhookUrl: String(cfg.defaultWebhookUrl || "")
      };

      for (const rule of rules) {
        const universe = rule.universe || { type: "manual" };
        const manualSymbols = Array.isArray(rule.symbols) ? rule.symbols.map((symbol) => String(symbol).toUpperCase()).filter(Boolean) : [];
        const useUniverse = String(universe.type || "manual") === "us_all";

        if (runtime.dataProvider === "fmp") {
          if (!isFmpDefaultRuleCompatible(rule)) {
            log(`FMP 模式暂只支持默认规则字段，已跳过规则：${rule.name || "未命名规则"}`);
            continue;
          }
          await runFmpRule({ rule, universe, useUniverse, manualSymbols, dryRun, state, runtime });
          continue;
        }

        await runFinnhubRule({ rule, universe, useUniverse, manualSymbols, dryRun, state, runtime });
      }

      await saveState(state);
      log(`${dryRun ? "dry-run" : "执行"}完成`);
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      busy = false;
    }
  }

  return { tick };
}

