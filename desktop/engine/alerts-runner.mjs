import { normalizeHttpBaseUrl, toNumber } from "../shared-runtime.mjs";
import { chunk, appendJsonLine } from "./shared.mjs";
import { computeIndicators, buildEvalContext, quoteToEvalContext } from "./indicator-domain.mjs";
import { computeFmpRuleStats, loadFmpDefaultUniverse, loadUniverseUS } from "./fmp-domain.mjs";
import {
  buildTransport,
  flushQueuedRuleEmail,
  flushQueuedRuleWebhook,
  formatWebhookTargetLabel,
  normalizeWebhookTarget,
  notifyAlert
} from "./notification-domain.mjs";
import {
  buildRuleKey,
  formatAdoptedFieldSummary,
  fireRuleAlert,
  isFmpDefaultRuleCompatible,
  summarizeCondition
} from "./rule-domain.mjs";
import { finnhubBasicFinancials, finnhubQuote } from "./providers.mjs";
import { createMarketAmvService } from "./market-amv-service.mjs";
import { loadDesktopMarketAmvHistory } from "../main/data-store.mjs";

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

  const marketAmvService = createMarketAmvService({ dataPaths, loadConfig, log, emitEvent });

  const appendEventLine = async (event) => appendJsonLine(dataPaths.events, event);

  function describeNotifyTargets({ rule, defaultEmailTo, defaultWebhookType, defaultWebhookUrl }) {
    const emailTarget = String(rule?.notify?.email || defaultEmailTo || "");
    const webhookTarget = normalizeWebhookTarget({
      type: rule?.notify?.webhookType || defaultWebhookType,
      url: rule?.notify?.webhookUrl || defaultWebhookUrl
    });
    const parts = [];
    if (emailTarget) parts.push(`邮件=${emailTarget}`);
    if (webhookTarget.url) parts.push(formatWebhookTargetLabel(webhookTarget));
    return parts.length > 0 ? parts.join("，") : "无通知目标";
  }

  function summarizeResultForLog(fireResult) {
    return {
      evidence: fireResult?.evaluationSummary?.evidenceLines?.slice(0, 4).join("；") || "",
      missing: fireResult?.evaluationSummary?.missingFieldDetails?.slice(0, 3).join("；") || "",
      adopted: formatAdoptedFieldSummary(fireResult?.adoptedFields || [])
    };
  }

  function conditionUsesAnyVar(node, wantedVars) {
    if (!node || typeof node !== "object") return false;
    if (node.var && wantedVars.has(String(node.var))) return true;
    if (node.left && conditionUsesAnyVar(node.left, wantedVars)) return true;
    if (node.right && conditionUsesAnyVar(node.right, wantedVars)) return true;
    if (Array.isArray(node.args)) return node.args.some((item) => conditionUsesAnyVar(item, wantedVars));
    return false;
  }

  function ruleUsesFinancialFields(rule) {
    const wantedVars = new Set([
      "earningsWithin1TradingDay",
      "revenueGrowthYoY",
      "revenueGrowthYoYPrevQuarter",
      "revenueGrowthYoYDeltaVsPrevQuarter",
      "grossMargin",
      "grossMarginYoYDelta",
      "grossMarginQoQDelta",
      "ebitda",
      "ebitdaM",
      "ebitdaGrowthYoY",
      "operatingIncome",
      "operatingIncomeGrowthYoY",
      "netIncome",
      "netIncomeGrowthYoY",
      "profitGrowthYoY",
      "profitGrowthRateYoY",
      "operatingOutlookImprovedProxy"
    ]);
    return conditionUsesAnyVar(rule?.condition, wantedVars);
  }

  async function runFmpRule({
    rule,
    universe,
    useUniverse,
    manualSymbols,
    dryRun,
    ignoreCooldown,
    state,
    runtime,
    marketAmv
  }) {
    const { fmpBaseUrl, fmpApiKey, transport, fromUser, defaultEmailTo, defaultWebhookType, defaultWebhookUrl } = runtime;
    const ruleName = rule.name || "未命名规则";
    const notifyEmailTo = String(rule.notify?.email || defaultEmailTo || "");
    const notifyWebhookTarget = normalizeWebhookTarget({
      type: rule.notify?.webhookType || defaultWebhookType,
      url: rule.notify?.webhookUrl || defaultWebhookUrl
    });
    const conditionText = summarizeCondition(rule.condition);
    const ruleKey = buildRuleKey(rule);
    const ruleCooldownSec = Number.parseInt(String(rule.cooldownSec || ""), 10);
    const cooldownSec = Number.isFinite(ruleCooldownSec) ? ruleCooldownSec : 900;
    let matchedCount = 0;
    let firedCount = 0;
    let cooldownSkippedCount = 0;
    let missingFieldCount = 0;
    let proxyHitCount = 0;
    let fallbackHitCount = 0;
    const financialRule = ruleUsesFinancialFields(rule);
    const queuedEmailNotifications = [];
    const queuedWebhookNotifications = [];
    const hitSamples = [];
    const missSamples = [];

    const logWebhookDeliverySummary = () => {
      if (!notifyWebhookTarget.url) {
        log(`规则 ${ruleName}：本轮未发送回调，原因=未配置回调地址`);
        return;
      }
      if (notifyWebhookTarget.type !== "feishu") {
        log(`规则 ${ruleName}：本轮回调类型=${notifyWebhookTarget.type}，不走飞书汇总`);
        return;
      }
      if (queuedWebhookNotifications.length > 0) {
        log(`规则 ${ruleName}：飞书汇总队列 ${queuedWebhookNotifications.length} 条，目标=${notifyWebhookTarget.url}`);
        return;
      }
      if (firedCount === 0 && cooldownSkippedCount > 0) {
        log(`规则 ${ruleName}：本轮未发送飞书，原因=命中 ${matchedCount} 支但全部被冷却拦截`);
        return;
      }
      if (matchedCount === 0) {
        log(`规则 ${ruleName}：本轮未发送飞书，原因=无命中`);
        return;
      }
      log(`规则 ${ruleName}：本轮未发送飞书，原因=命中 ${matchedCount} 支但通知队列为空，请检查通知链路`);
    };

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
        const stats = await computeFmpRuleStats({ baseUrl: fmpBaseUrl, apiKey: fmpApiKey, symbol, state }).catch((error) => {
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
        if (financialRule && stats.financialRuleEligible === false) {
          log(`规则 ${ruleName}：已跳过 ${symbol}，原因=${stats.financialRuleSkipReason || "财报规则不适用该标的"}`);
          continue;
        }
        const minPrice = useUniverse ? toNumber(universe.minPrice) : null;
        const minMarketCap = useUniverse ? toNumber(universe.minMarketCap) : null;
        if (minPrice !== null && stats.price !== null && stats.price < minPrice) continue;
        if (minMarketCap !== null && stats.marketCap !== null && stats.marketCap < minMarketCap) continue;

        const ctx = {
          symbol,
          price: stats.price,
          marketCap: stats.marketCap ?? toNumber(row?.marketCap),
          turnoverM: stats.turnoverM,
          amv: stats.amv,
          market0amv: marketAmv,
          market0amvSp500: marketAmvSp500,
          market0amvNasdaq: marketAmvNasdaq,
          activeChips: stats.activeChips,
          recent5dCloseAth: stats.recent5dCloseAth,
          closeAth250d: stats.closeAth250d,
          closeChangePercent1d: stats.closeChangePercent1d,
          earningsWithin1TradingDay: stats.earningsWithin1TradingDay,
          revenueGrowthYoY: stats.revenueGrowthYoY,
          revenueGrowthYoYPrevQuarter: stats.revenueGrowthYoYPrevQuarter,
          revenueGrowthYoYDeltaVsPrevQuarter: stats.revenueGrowthYoYDeltaVsPrevQuarter,
          grossMargin: stats.grossMargin,
          grossMarginYoYDelta: stats.grossMarginYoYDelta,
          grossMarginQoQDelta: stats.grossMarginQoQDelta,
          ebitda: stats.ebitda,
          ebitdaM: stats.ebitdaM,
          ebitdaGrowthYoY: stats.ebitdaGrowthYoY,
          operatingIncome: stats.operatingIncome,
          operatingIncomeGrowthYoY: stats.operatingIncomeGrowthYoY,
          netIncome: stats.netIncome,
          netIncomeGrowthYoY: stats.netIncomeGrowthYoY,
          changePercent: null,
          change: null,
          prevClose: null,
          open: null,
          high: null,
          low: null,
          fieldMeta: stats.fieldMeta || {},
          missingFields: Array.isArray(stats.missingFields) ? stats.missingFields : []
        };

        const fireResult = await fireRuleAlert({
          rule,
          symbol,
          ctx,
          conditionText,
          dryRun,
          ignoreCooldown,
          state,
          ruleKey,
          cooldownSec,
          emitEvent,
          appendEventLine,
          log,
          notify: (payload) => notifyAlert({
            ...payload,
            notifyEmailTo,
            notifyWebhookTarget,
            queuedEmailNotifications,
            queuedWebhookNotifications,
            transport,
            fromUser,
            log
          })
        });
        const adoptedFields = Array.isArray(fireResult?.adoptedFields) ? fireResult.adoptedFields : [];
        if (fireResult?.matched) {
          matchedCount += 1;
          if (adoptedFields.some((item) => item?.kind === "proxy")) proxyHitCount += 1;
          if (adoptedFields.some((item) => item?.kind === "fallback")) fallbackHitCount += 1;
          if (hitSamples.length < 5) hitSamples.push({ symbol, ...summarizeResultForLog(fireResult) });
        }
        if (fireResult && fireResult.matched && !fireResult.canFire) cooldownSkippedCount += 1;
        if (fireResult?.fired) firedCount += 1;
        if (!fireResult?.matched && fireResult?.evaluationSummary?.missingFieldDetails?.length > 0) {
          missingFieldCount += 1;
          if (missSamples.length < 5) missSamples.push({ symbol, ...summarizeResultForLog(fireResult) });
        }
      }
    }

    await flushQueuedRuleEmail({
      rule,
      conditionText,
      entries: queuedEmailNotifications,
      runSummary: {
        scannedCount: fmpRows.length,
        matchedCount,
        firedCount,
        cooldownSkippedCount,
        missingFieldCount,
        proxyHitCount,
        fallbackHitCount
      },
      notifyEmailTo,
      transport,
      fromUser,
      log
    });
    await flushQueuedRuleWebhook({
      rule,
      conditionText,
      entries: queuedWebhookNotifications,
      runSummary: {
        scannedCount: fmpRows.length,
        matchedCount,
        firedCount,
        cooldownSkippedCount,
        missingFieldCount,
        proxyHitCount,
        fallbackHitCount
      },
      webhookTarget: notifyWebhookTarget,
      log
    });
    if (notifyEmailTo && queuedEmailNotifications.length > 0) {
      log(`规则 ${ruleName}：汇总邮件队列 ${queuedEmailNotifications.length} 条，目标=${notifyEmailTo}`);
    }
    logWebhookDeliverySummary();

    log(`规则 ${ruleName}：本轮扫描 ${fmpRows.length} 支，命中 ${matchedCount} 支，实际触发 ${firedCount} 次，冷却跳过 ${cooldownSkippedCount} 次，缺字段 ${missingFieldCount} 支，通知=${describeNotifyTargets({ rule, defaultEmailTo, defaultWebhookType, defaultWebhookUrl })}`);
    if (proxyHitCount > 0 || fallbackHitCount > 0) {
      log(`规则 ${ruleName}：采用口径统计，代理命中 ${proxyHitCount} 支，回退口径命中 ${fallbackHitCount} 支`);
    }
    if (hitSamples.length > 0) {
      for (const sample of hitSamples) {
        log(`规则 ${ruleName}：命中样本 ${sample.symbol}${sample.evidence ? ` | 命中依据: ${sample.evidence}` : ""}${sample.adopted ? ` | 采用口径: ${sample.adopted}` : ""}`);
      }
    } else {
      log(`规则 ${ruleName}：本轮无命中`);
    }
    for (const sample of missSamples) {
      log(`规则 ${ruleName}：缺字段未命中样本 ${sample.symbol}${sample.missing ? ` | 缺字段: ${sample.missing}` : ""}${sample.evidence ? ` | 已满足依据: ${sample.evidence}` : ""}${sample.adopted ? ` | 采用口径: ${sample.adopted}` : ""}`);
    }
    return { scannedCount: fmpRows.length, matchedCount, firedCount };
  }

  async function runFinnhubRule({
    rule,
    universe,
    useUniverse,
    manualSymbols,
    dryRun,
    ignoreCooldown,
    state,
    runtime,
    marketAmv
  }) {
    const { finnhubBaseUrl, finnhubApiKey, transport, fromUser, defaultEmailTo, defaultWebhookType, defaultWebhookUrl } = runtime;
    const ruleName = rule.name || "未命名规则";
    const notifyEmailTo = String(rule.notify?.email || defaultEmailTo || "");
    const notifyWebhookTarget = normalizeWebhookTarget({
      type: rule.notify?.webhookType || defaultWebhookType,
      url: rule.notify?.webhookUrl || defaultWebhookUrl
    });
    const conditionText = summarizeCondition(rule.condition);
    const ruleKey = buildRuleKey(rule);
    const ruleCooldownSec = Number.parseInt(String(rule.cooldownSec || ""), 10);
    const cooldownSec = Number.isFinite(ruleCooldownSec) ? ruleCooldownSec : 900;
    let matchedCount = 0;
    let firedCount = 0;
    let cooldownSkippedCount = 0;
    const queuedEmailNotifications = [];
    const queuedWebhookNotifications = [];

    const logWebhookDeliverySummary = () => {
      if (!notifyWebhookTarget.url) {
        log(`规则 ${ruleName}：本轮未发送回调，原因=未配置回调地址`);
        return;
      }
      if (notifyWebhookTarget.type !== "feishu") {
        log(`规则 ${ruleName}：本轮回调类型=${notifyWebhookTarget.type}，不走飞书汇总`);
        return;
      }
      if (queuedWebhookNotifications.length > 0) {
        log(`规则 ${ruleName}：飞书汇总队列 ${queuedWebhookNotifications.length} 条，目标=${notifyWebhookTarget.url}`);
        return;
      }
      if (firedCount === 0 && cooldownSkippedCount > 0) {
        log(`规则 ${ruleName}：本轮未发送飞书，原因=命中 ${matchedCount} 支但全部被冷却拦截`);
        return;
      }
      if (matchedCount === 0) {
        log(`规则 ${ruleName}：本轮未发送飞书，原因=无命中`);
        return;
      }
      log(`规则 ${ruleName}：本轮未发送飞书，原因=命中 ${matchedCount} 支但通知队列为空，请检查通知链路`);
    };

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
          const ctx = quoteToEvalContext({ symbol, quote, extra: { ...extra, ...indicators, market0amv: marketAmv, market0amvSp500: marketAmvSp500, market0amvNasdaq: marketAmvNasdaq } });
          const fireResult = await fireRuleAlert({
            rule,
            symbol,
            ctx,
            conditionText,
            dryRun,
            ignoreCooldown,
            state,
            ruleKey,
            cooldownSec,
            emitEvent,
            appendEventLine,
            log,
            notify: (payload) => notifyAlert({
              ...payload,
              notifyEmailTo,
              notifyWebhookTarget,
              queuedEmailNotifications,
              queuedWebhookNotifications,
              transport,
              fromUser,
              log
            })
          });
          if (fireResult?.matched) matchedCount += 1;
          if (fireResult && fireResult.matched && !fireResult.canFire) cooldownSkippedCount += 1;
          if (fireResult?.fired) firedCount += 1;
          continue;
        }

        const indicators = await computeIndicators({ baseUrl: finnhubBaseUrl, apiKey: finnhubApiKey, symbol, condition: rule.condition, state });
        const ctx = { ...buildEvalContext({ symbol, quote, indicators }), market0amv: marketAmv, market0amvSp500: marketAmvSp500, market0amvNasdaq: marketAmvNasdaq };
        const fireResult = await fireRuleAlert({
          rule,
          symbol,
          ctx,
          conditionText,
          dryRun,
          ignoreCooldown,
          state,
          ruleKey,
          cooldownSec,
          emitEvent,
          appendEventLine,
          log,
          notify: (payload) => notifyAlert({
            ...payload,
            notifyEmailTo,
            notifyWebhookTarget,
            queuedEmailNotifications,
            queuedWebhookNotifications,
            transport,
            fromUser,
            log
          })
        });
        if (fireResult?.matched) matchedCount += 1;
        if (fireResult && fireResult.matched && !fireResult.canFire) cooldownSkippedCount += 1;
        if (fireResult?.fired) firedCount += 1;
      }
    }

    await flushQueuedRuleEmail({
      rule,
      conditionText,
      entries: queuedEmailNotifications,
      runSummary: {
        scannedCount: symbols.length,
        matchedCount,
        firedCount,
        cooldownSkippedCount,
        missingFieldCount: 0,
        proxyHitCount: 0,
        fallbackHitCount: 0
      },
      notifyEmailTo,
      transport,
      fromUser,
      log
    });
    await flushQueuedRuleWebhook({
      rule,
      conditionText,
      entries: queuedWebhookNotifications,
      runSummary: {
        scannedCount: symbols.length,
        matchedCount,
        firedCount,
        cooldownSkippedCount,
        missingFieldCount: 0,
        proxyHitCount: 0,
        fallbackHitCount: 0
      },
      webhookTarget: notifyWebhookTarget,
      log
    });
    logWebhookDeliverySummary();
    log(`规则 ${ruleName}：本轮扫描 ${symbols.length} 支，命中 ${matchedCount} 支，实际触发 ${firedCount} 次，冷却跳过 ${cooldownSkippedCount} 次，通知=${describeNotifyTargets({ rule, defaultEmailTo, defaultWebhookType, defaultWebhookUrl })}`);
    return { scannedCount: symbols.length, matchedCount, firedCount };
  }

  async function tick({ dryRun, ignoreCooldown = false, trigger = "manual" }) {
    if (busy) {
      const skipReason = {
        code: "busy",
        message: "已有任务在运行"
      };
      log(`${trigger === "scheduler" ? "定时触发" : "本次请求"}已跳过，原因=${skipReason.message}`);
      return {
        skipped: true,
        skipReason
      };
    }
    busy = true;
    const startedAt = new Date().toISOString();
    try {
      log(`开始${dryRun ? "dry-run" : "执行"}...`);
      if (!dryRun && ignoreCooldown) {
        log("本次真实运行已启用调试模式：忽略冷却。");
      }
      if (emitEvent) {
        emitEvent({
          type: "run_status",
          phase: "started",
          trigger,
          dryRun: Boolean(dryRun),
          ignoreCooldown: Boolean(ignoreCooldown),
          startedAt
        });
      }
      const cfg = await loadConfig();
      const rules = (await loadRules()).filter((rule) => rule && rule.enabled);
      const state = await loadState();
      log(`本轮启用规则 ${rules.length} 条，数据源=${String(cfg.dataProvider || "finnhub").toUpperCase()}`);
      if (rules.length === 0) {
        log("没有启用规则：请先在规则页至少保存一条“启用”规则");
      }

      const runtime = {
        dataProvider: String(cfg.dataProvider || "finnhub").toLowerCase(),
        finnhubBaseUrl: normalizeHttpBaseUrl(cfg.finnhubBaseUrl, "https://finnhub.io/api/v1"),
        finnhubApiKey: String(cfg.finnhubApiKey || ""),
        fmpBaseUrl: normalizeHttpBaseUrl(cfg.fmpBaseUrl, "https://financialmodelingprep.com"),
        fmpApiKey: String(cfg.fmpApiKey || ""),
        transport: buildTransport(cfg.email),
        fromUser: String(cfg.email?.user || ""),
        defaultEmailTo: String(cfg.defaultEmailTo || ""),
        defaultWebhookType: String(cfg.defaultWebhookType || "generic"),
        defaultWebhookUrl: String(cfg.defaultWebhookUrl || "")
      };

      let completedRules = 0;
      let failedRules = 0;
      const failedRuleNames = [];

      let marketAmv = null;
      let marketAmvSp500 = null;
      let marketAmvNasdaq = null;
      const primaryIndex = String(cfg.marketAmv?.primaryIndex || "sp500");
      if (runtime.fmpApiKey) {
        const nowMs = Date.now();
        const sampleLimit = cfg.marketAmv?.sampleLimit;
        async function resolveAmv(idx) {
          const cacheKey = idx === "sp500" ? "market0amvSp500" : "market0amvNasdaq";
          const cached = state[cacheKey];
          if (cached && cached.value !== null && cached.timestamp && (nowMs - cached.timestamp) < 24 * 60 * 60 * 1000) {
            log(`[market-amv] ${idx} 使用缓存值: ${cached.value.toLocaleString()} 百万美元`);
            return cached.value;
          }
          try {
            log(`[market-amv] 开始计算 ${idx} 0AMV...`);
            const result = await marketAmvService.computeMarket0amv({ index: idx, limit: sampleLimit });
            state[cacheKey] = { value: result.value, date: result.date, timestamp: nowMs };
            log(`[market-amv] ${idx} 计算完成: ${result.value.toLocaleString()} 百万美元`);
            return result.value;
          } catch (err) {
            log(`[market-amv] ${idx} 计算失败: ${err.message}`);
            try {
              const hist = await loadDesktopMarketAmvHistory(dataPaths, { index: idx });
              if (hist.length > 0) return hist[hist.length - 1].value;
            } catch {}
            return null;
          }
        }
        async function loadFromHistory(idx) {
          try {
            const hist = await loadDesktopMarketAmvHistory(dataPaths, { index: idx });
            return hist.length > 0 ? hist[hist.length - 1].value : null;
          } catch { return null; }
        }
        if (primaryIndex === "nasdaq") {
          marketAmvNasdaq = await resolveAmv("nasdaq");
          marketAmvSp500 = await loadFromHistory("sp500");
          marketAmv = marketAmvNasdaq;
        } else {
          marketAmvSp500 = await resolveAmv("sp500");
          marketAmvNasdaq = await loadFromHistory("nasdaq");
          marketAmv = marketAmvSp500;
        }
      }

      for (const rule of rules) {
        const universe = rule.universe || { type: "manual" };
        const manualSymbols = Array.isArray(rule.symbols) ? rule.symbols.map((symbol) => String(symbol).toUpperCase()).filter(Boolean) : [];
        const useUniverse = String(universe.type || "manual") === "us_all";
        log(`开始检查规则：${rule.name || "未命名规则"}（范围=${useUniverse ? "全量美股" : `${manualSymbols.length} 个手动标的`}）`);
        try {
          if (runtime.dataProvider === "fmp") {
            if (!isFmpDefaultRuleCompatible(rule)) {
              log(`FMP 模式暂只支持默认规则字段，已跳过规则：${rule.name || "未命名规则"}`);
              completedRules += 1;
              log(`规则完成：${rule.name || "未命名规则"}（已跳过）`);
              continue;
            }
            await runFmpRule({ rule, universe, useUniverse, manualSymbols, dryRun, ignoreCooldown, state, runtime, marketAmv });
            completedRules += 1;
            log(`规则完成：${rule.name || "未命名规则"}`);
            continue;
          }

          await runFinnhubRule({ rule, universe, useUniverse, manualSymbols, dryRun, ignoreCooldown, state, runtime, marketAmv });
          completedRules += 1;
          log(`规则完成：${rule.name || "未命名规则"}`);
        } catch (ruleError) {
          failedRules += 1;
          failedRuleNames.push(rule.name || "未命名规则");
          log(`规则失败：${rule.name || "未命名规则"} -> ${ruleError instanceof Error ? ruleError.message : String(ruleError)}`);
        }
      }

      await saveState(state);
      if (rules.length > 0) {
        log(`本轮规则执行汇总：共 ${rules.length} 条，完成 ${completedRules} 条，失败 ${failedRules} 条${failedRuleNames.length > 0 ? `，失败规则=${failedRuleNames.join("、")}` : ""}`);
      }
      const finishedAt = new Date().toISOString();
      if (emitEvent) {
        emitEvent({
          type: "run_status",
          phase: "finished",
          trigger,
          dryRun: Boolean(dryRun),
          ignoreCooldown: Boolean(ignoreCooldown),
          startedAt,
          finishedAt,
          dataProvider: runtime.dataProvider,
          totalRules: rules.length,
          completedRules,
          failedRules,
          failedRuleNames
        });
      }
      log(`${dryRun ? "dry-run" : "执行"}完成`);
      return {
        skipped: false,
        startedAt,
        finishedAt
      };
    } catch (error) {
      if (emitEvent) {
        emitEvent({
          type: "run_status",
          phase: "failed",
          trigger,
          dryRun: Boolean(dryRun),
          ignoreCooldown: Boolean(ignoreCooldown),
          startedAt,
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });
      }
      log(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      busy = false;
    }
  }

  return { tick };
}
