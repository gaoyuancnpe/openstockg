---
name: "rule-engineering"
description: "盯盘规则的完整生命周期:变量与阈值设计、冲突自检、回测验证、上线与真实通知。设计或修改规则、用户说'帮我盯 XX'时读。"
---

# 规则工程

## 第 1 步 需求 → 变量与阈值

先问清楚用户想盯什么信号，再映射到引擎变量。常用变量（单位与口径）：

| 变量 | 含义 | 常用写法 |
|---|---|---|
| `price` | 价格 | `{"var":"price"} >= 50` |
| `marketCap` | 收盘市值（美元） | `>= 3000000000`（30 亿美元） |
| `turnoverM` | 成交额（百万美元） | `>= 500`（5 亿） |
| `closeChangePercent1d` | 日涨跌幅（FMP 口径） | `>= 5` |
| `recent5dCloseAth` | 5 日收盘新高 | `== true` |
| `closeAth250d` | 250 日收盘新高 | `== true` |
| `earningsWithin1TradingDay` | 1 个交易日内发财报 | `== true` |
| `revenueGrowthYoY` / `grossMargin` / `ebitdaGrowthYoY` 等 | 财报类变量 | 增速/利润率门槛 |
| `market0amv` / `market0amvSp500` / `market0amvNasdaq` | 大盘 0AMV 联动条件 | 谨慎使用，先看当前量级 |

不确定变量是否支持时直接试：`add_rule` 的 conflictWarnings 会明确列出引擎不支持的变量（这时换成等价变量，如日涨跌幅用 `closeChangePercent1d` 而不是 `changePercent`）。

## 第 2 步 边界与冲突自检

- 全市场池按市值降序取前 maxScan（默认 2000），实际覆盖的最小市值约 22-23 亿美元。市值门槛设得离这个边界太近或想覆盖更小标的时，`add_rule` 会返回边界类 conflictWarnings——**必须原文转述给用户**（铁律），用户知情后仍要保存则照办；也可建议提高 maxScan（更慢）或改手动标的。
- 多条件用 `{"op":"and","args":[...]}`；`or`/`not` 同理。

## 第 3 步 回测先行

`backtest_rule`（规则名或条件树 + 1-10 个代表性代码，1-5 年）：

- 触发次数 < 10：条件太严，实战大概率空转；
- 触发后 1/5/20 日前向收益的胜率与均值原样报给用户，由用户判断值不值得上；
- 回测与实盘同一套求值器，财报变量按财报生效日 point-in-time 对齐，无未来函数。

## 第 4 步 上线与冷却

`add_rule` 单条追加（铁律：不走 save_rules 全量替换，除非先 list_rules 并展示差异）。冷却 cooldownSec 设计：新高/突破类 86400（一天最多提一次），事件类（财报临近）43200。

## 第 5 步 首轮验证两步走

1. `run_rules_once` dry_run=true（默认）：展示命中清单，不发通知；
2. 用户看过确认后，再显式 dry_run=false 真发邮件/webhook。**真实发送必须经用户确认**（铁律）。

通知目标默认用配置里的收件邮箱/webhook，也可在规则里覆盖。
