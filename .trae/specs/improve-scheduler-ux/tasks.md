# Tasks
- [x] Task 1: 梳理定时状态模型与持久化字段，统一“常驻状态/下一次执行时间/最近一次跳过原因”的数据口径。
  - [x] SubTask 1.1: 盘点现有调度器、诊断文件和前端状态入口，确认缺失字段
  - [x] SubTask 1.2: 设计并补充最小状态结构，避免引入系统级守护复杂度
  - [x] SubTask 1.3: 明确日志、事件和诊断文件中的字段命名与更新时间机

- [x] Task 2: 修正 `daily` 模式触发语义，使其按下一次设定时间触发而不是启动即执行。
  - [x] SubTask 2.1: 调整 `daily` 模式的首次调度逻辑
  - [x] SubTask 2.2: 保持 `interval` 模式“启动即跑一轮”的现有体验不回退
  - [x] SubTask 2.3: 覆盖工作日限定与非法时间回退场景

- [x] Task 3: 补齐定时页和运行区的状态展示，提升用户可感知性。
  - [x] SubTask 3.1: 在界面展示当前是否常驻、当前模式、下一次执行时间
  - [x] SubTask 3.2: 在最近一次运行摘要中补充最近一次执行时间和最近一次跳过原因
  - [x] SubTask 3.3: 优化启动/停止后的即时提示文案，避免用户需要靠日志确认

- [x] Task 4: 明确定时跳过与停止场景的可解释反馈。
  - [x] SubTask 4.1: 为“已有任务在运行”补统一跳过日志与状态记录
  - [x] SubTask 4.2: 为“用户主动停止”补状态清理与前端展示
  - [x] SubTask 4.3: 为“未启动常驻”明确非调度状态文案

- [x] Task 5: 做面向用户体验的回归验证与文档化勾选。
  - [x] SubTask 5.1: 验证 `interval` 与 `daily` 两种模式的核心交互
  - [x] SubTask 5.2: 验证长任务导致跳过时的状态和日志是否可解释
  - [x] SubTask 5.3: 核对 checklist 并补充必要的缺口任务

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 2]
- [Task 5] depends on [Task 3]
- [Task 5] depends on [Task 4]
