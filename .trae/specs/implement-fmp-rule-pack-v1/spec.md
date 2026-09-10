# FMP规则一期与三条新规则 Spec

## Why
当前桌面端规则能力只覆盖少量价格与技术面字段，无法直接承接“创新高”“财报日大涨”“财报异动提醒”三条规则。用户已确认一期以现有 FMP 套餐为唯一前置数据源，缺失口径允许使用可解释的替代指标，以尽快形成可运行、可解释的规则闭环。

## What Changes
- 扩展 FMP 规则统计字段，补齐价格、财报、同比/环比与财报事件窗口所需指标
- 为规则引擎增加字段缺失时的替代与回退口径，而不是直接判定规则不可用
- 新增三条规则模板：`创新高`、`财报日大涨`、`财报异动提醒`
- 在规则执行日志与通知内容中明确展示命中依据、替代口径与命中摘要
- 调整规则编辑器可配置项与展示文案，避免将代理指标伪装成严格原始口径

## Impact
- Affected specs: 桌面端规则编辑、规则执行、FMP 数据统计、通知汇总
- Affected code: `desktop/engine/fmp-domain.mjs`, `desktop/engine/rule-domain.mjs`, `desktop/engine/alerts-runner.mjs`, `desktop/engine/notification-domain.mjs`, `desktop/renderer/index.html`, `desktop/renderer/rule-editor-controller.mjs`

## ADDED Requirements
### Requirement: FMP 规则统计字段扩展
系统 SHALL 基于现有 FMP 数据源，为规则执行产出价格、财报、同比/环比和财报事件窗口字段。

#### Scenario: 生成规则执行所需统计
- **WHEN** 系统对单个 symbol 执行 FMP 规则统计
- **THEN** 系统返回至少包含 `closeAth250d`、`closeChangePercent1d`、`earningsWithin1TradingDay`、`revenueGrowthYoY`、`ebitda`、`ebitdaGrowthYoY`、`netIncomeGrowthYoY`、`operatingIncomeGrowthYoY`、`grossMargin`、`grossMarginYoYDelta`、`grossMarginQoQDelta`、`revenueGrowthYoYPrevQuarter`、`revenueGrowthYoYDeltaVsPrevQuarter`

### Requirement: 缺失字段回退策略
系统 SHALL 在理想字段缺失时使用预定义替代口径继续判断规则，并在日志与通知中标记回退来源。

#### Scenario: 利润口径缺失时继续判断
- **WHEN** 规则需要利润增速条件且 FMP 无法提供目标口径
- **THEN** 系统按 `GAAP净利润同比 -> 营业利润同比 -> EBITDA同比` 的顺序回退
- **AND** 系统在执行日志与邮件摘要中记录本次实际采用的口径

#### Scenario: 指引信号无法结构化获取时继续判断
- **WHEN** 规则需要经营展望改善信号但不存在结构化“管理层上调指引”字段
- **THEN** 系统使用 `收入增速显著回升`、`毛利率改善`、`EBITDA改善` 的代理组合判断
- **AND** 系统明确标记该结果为代理信号而非原始管理层指引

### Requirement: 创新高规则模板
系统 SHALL 提供基于 FMP 的“创新高”规则模板。

#### Scenario: 创新高规则命中
- **WHEN** 某 symbol 满足 `250个交易日收盘新高`、`成交额 >= 1亿`、`收盘市值 >= 20亿`、`当季收入增速 >= 15%`、`当季EBITDA > 2000万`、`利润增速 >= 15%`
- **THEN** 系统将其判定为“创新高”规则命中
- **AND** 若利润增速使用了替代口径，系统展示实际口径

### Requirement: 财报日大涨规则模板
系统 SHALL 提供基于 FMP 的“财报日大涨”规则模板。

#### Scenario: 财报日大涨规则命中
- **WHEN** 某 symbol 满足 `财报时间为当日或上一个交易日`、`收盘涨幅 >= 8%`、`成交额 >= 1亿`、`收盘市值 >= 20亿`、`当季收入增速 >= 10%`、`当季EBITDA > 0`
- **THEN** 系统将其判定为“财报日大涨”规则命中

### Requirement: 财报异动提醒规则模板
系统 SHALL 提供基于 FMP 的“财报异动提醒”规则模板。

#### Scenario: 财报异动提醒规则命中
- **WHEN** 某 symbol 满足 `毛利率改善 >= 1pct`、`收入增速回升：由低于10%提升至15%或以上`、`收入增速加速：较上季度提升5pct或以上`、`收盘市值 >= 20亿`、`成交额 >= 1亿`
- **THEN** 系统将其判定为“财报异动提醒”规则命中
- **AND** 若系统采用经营展望代理信号，也应在结果中展示代理说明

### Requirement: 规则执行解释与汇总通知
系统 SHALL 在规则执行结束后输出可读的命中解释，并按每条规则每轮执行汇总发送通知。

#### Scenario: 执行结束后输出命中摘要
- **WHEN** 某条规则完成一轮扫描并存在命中结果
- **THEN** 系统记录本轮扫描数量、命中数量、实际使用的关键字段口径
- **AND** 系统发送一封汇总通知，包含命中列表与关键命中依据

## MODIFIED Requirements
### Requirement: 规则编辑与展示
系统 SHALL 在规则编辑器中展示与当前真实数据口径一致的字段名称与说明，不得将代理指标展示成严格原始口径。

#### Scenario: 编辑规则模板
- **WHEN** 用户在规则页面新建或编辑“创新高”“财报日大涨”“财报异动提醒”
- **THEN** 系统展示模板默认条件、字段阈值与必要说明
- **AND** 对使用回退或代理的字段提供明确提示

## REMOVED Requirements
