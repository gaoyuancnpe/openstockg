# Tasks
- [x] Task 1: 扩展 FMP 规则统计字段，补齐三条规则所需的价格、财报与事件窗口数据
  - [x] SubTask 1.1: 盘点当前 `fmp-domain` 已有字段与三条规则所需字段的差距
  - [x] SubTask 1.2: 实现 `closeAth250d`、`closeChangePercent1d` 与财报事件窗口字段
  - [x] SubTask 1.3: 实现收入、利润、EBITDA、毛利率的同比/环比字段
  - [x] SubTask 1.4: 为字段缺失场景保留显式缺省值与可追踪元信息，避免静默误判

- [x] Task 2: 扩展规则引擎字段与回退策略，使 FMP 数据可直接驱动三条规则
  - [x] SubTask 2.1: 在 `rule-domain` 中注册新增字段及其比较逻辑
  - [x] SubTask 2.2: 实现利润增速回退链：`GAAP净利润同比 -> 营业利润同比 -> EBITDA同比`
  - [x] SubTask 2.3: 实现经营展望改善代理信号组合判断
  - [x] SubTask 2.4: 让规则执行结果返回实际使用口径，供日志与通知复用

- [x] Task 3: 新增三条规则模板并更新规则编辑器展示
  - [x] SubTask 3.1: 在规则模板定义中新增“创新高”“财报日大涨”“财报异动提醒”
  - [x] SubTask 3.2: 更新规则编辑器字段选项、默认条件与说明文案
  - [x] SubTask 3.3: 明确对回退口径和代理信号的 UI 提示，避免误导用户

- [x] Task 4: 完善执行日志与汇总通知，让规则结果可解释
  - [x] SubTask 4.1: 在执行日志中输出命中数量、命中依据与实际采用字段口径
  - [x] SubTask 4.2: 在汇总邮件中展示规则名、命中列表、关键数值与代理/回退说明
  - [x] SubTask 4.3: 校验无命中、字段缺失、代理命中三类场景的日志表现

- [x] Task 5: 完成定向验证并修正文档勾选项
  - [x] SubTask 5.1: 运行针对规则相关模块的静态检查与 diagnostics
  - [x] SubTask 5.2: 以三条规则模板做最小样本联调，验证命中判断与解释输出
  - [x] SubTask 5.3: 更新 `tasks.md` 与 `checklist.md` 的完成状态

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2 and can run in parallel with Task 3 after Task 2.4 completes
- Task 5 depends on Task 3 and Task 4
