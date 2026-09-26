---
name: "fmp-data-notes"
description: "FMP 数据口径与已知坑:端点映射、缓存与新鲜度、point-in-time、报错语义。数据结果看起来奇怪、或做财报/估值研究前读。"
---

# FMP 数据口径备忘

## 工具 → 数据端点

| 工具 | FMP 端点族 | 备注 |
|---|---|---|
| get_quote | /stable/quote + profile | 套餐不支持实时时回退最近收盘 |
| get_financials | income/cash-flow/balance-sheet + key-metrics + ratios + analyst-estimates + dividends | 分析师预期仅 annual 可用 |
| get_price_history | historical-price-eod-full | 日线；SMA 本地算 |
| get_earnings_calendar | /stable/earnings-calendar | 端点是复数；字段 epsEstimated；已按代码后缀过滤境外 |
| run_screener / 候选池 | company-screener | isEtf=false&isFund=false&isActivelyTrading=true，保留公司与 ADR |
| run_financial_screener | 财报字段筛选 | Premium 字段，慢，maxScan 30-100 |

## 新鲜度与缓存

- 行情统计缓存 20h、财务统计 48h、候选池 7 天：同一天反复查同一标的，数字不会变，答复时带数据时间。
- 行情过期闸门：数据日早于"最近交易日 −7 天"的标的在规则扫描里直接跳过（退市/僵尸代码保护）。研究单个标的时如果发现"最新收盘"很旧，先怀疑代码已退市/被收购，可以问 get_quote 的公司摘要确认。

## Point-in-time 原则

- 回测里财报变量按**财报生效日**对齐：某季度数据只用在其公布之后的日期，无未来函数。
- 研究历史估值（PE 序列等）时，市值匹配取 ≤60 天内最近的 key-metrics 市值，跨期比较要留意口径。

## 报错语义（直接转告用户，不要重试轰炸）

- 缺 Key：明确报"缺少 FMP API Key"，指引用户去面板「设置」填。
- 403：套餐不含该字段/端点，把 FMP 原文转告。
- 限流：全市场批量并发仅 2，首轮慢是正常；先小样本验证。
- 错误信息里的 API Key 已自动替换成 `***`，可以原样展示。
