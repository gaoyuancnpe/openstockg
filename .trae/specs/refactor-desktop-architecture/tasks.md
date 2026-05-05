# Tasks
- [x] Task 1: 完成渲染层第一阶段减耦
  - [x] SubTask 1.1: 盘点 `renderer.mjs` 现存职责并确认模块边界，区分编排层、控制器层、服务层和纯工具层
  - [x] SubTask 1.2: 将配置表单、AI 面板、结果表渲染等独立职责从主脚本中移出
  - [x] SubTask 1.3: 将筛选/财报运行控制逻辑从主脚本中抽成独立控制器
  - [x] SubTask 1.4: 评估并拆分提醒池操作与页面显隐/估算逻辑，减少主脚本直接持有的细节职责
  - [x] SubTask 1.5: 对重构后的渲染层执行语法检查与诊断检查

- [x] Task 2: 完成规则编辑器专项重构
  - [x] SubTask 2.1: 将条件类型定义、condition 与 UI 结构互转逻辑抽离为独立模块
  - [x] SubTask 2.2: 将 modal 打开、条件列表渲染、表单校验和规则保存逻辑抽离为规则编辑控制器
  - [x] SubTask 2.3: 保持规则列表展示、AI 解读入口和现有规则存储格式兼容
  - [x] SubTask 2.4: 验证新增/编辑/复制/删除/启停规则链路未回归

- [x] Task 3: 收敛主进程与预加载层边界
  - [x] SubTask 3.1: 盘点 `main.mjs` 中窗口初始化、菜单、配置读写、规则读写、引擎调用和系统外链能力
  - [x] SubTask 3.2: 抽离与窗口/菜单无关的本地存储访问或 IPC 装配逻辑
  - [x] SubTask 3.3: 校准 `preload.mjs` 暴露接口分组，保证命名与职责一致
  - [x] SubTask 3.4: 保持现有 IPC 名称与渲染层调用兼容，避免用户已有流程断裂

- [x] Task 4: 建立 AI 服务抽象层，为未来智能体集群打基础
  - [x] SubTask 4.1: 盘点当前 AI 解读链路中的任务入口、提示词构建、模型调用、结果回传和 UI 状态更新职责
  - [x] SubTask 4.2: 将 AI 任务入口、执行器、结果归一化与未来编排层拆分为独立模块边界
  - [x] SubTask 4.3: 设计兼容当前单模型调用、但可扩展到多角色/多模型/多步骤 agent 集群的接口形态
  - [x] SubTask 4.4: 将 AI 配置结构收敛到统一入口，避免后续 agent 化时再次多处补字段
  - [x] SubTask 4.5: 设计 AI 结构化输出 schema，覆盖规则、筛选、财报模板等可自动填充场景
  - [x] SubTask 4.6: 设计统一映射层，将 AI 结构化结果转换为页面表单状态并进行字段校验、降级和默认值处理
  - [x] SubTask 4.7: 保持现有 AI 解读入口、配置页和 UI 输出行为兼容

- [x] Task 5: 拆分引擎层领域模块
  - [x] SubTask 5.1: 将 FMP universe 缓存加载、默认规则统计、财报统计、指标计算拆为独立领域模块
  - [x] SubTask 5.2: 将规则执行、事件写入、通知发送与调度循环拆开，降低 `engine.mjs` 的职责密度
  - [x] SubTask 5.3: 统一引擎层共享依赖入口，避免继续复制请求包装、错误处理与格式化逻辑
  - [x] SubTask 5.4: 保持 `createAlertsEngine()` 对外契约稳定，避免波及现有主进程接入

- [x] Task 6: 建立重构后的回归校验
  - [x] SubTask 6.1: 对渲染层、主进程层、AI 服务层、引擎层全部关键文件运行 `node --check`
  - [x] SubTask 6.2: 对最近改动文件执行 diagnostics 检查并清理明显问题
  - [x] SubTask 6.3: 回归验证配置读写、规则加载、筛选运行、财报运行、AI 解读和调度入口
  - [x] SubTask 6.4: 验证 AI 服务分层后，单模型调用仍可工作，且未来 agent 集群接入点清晰
  - [x] SubTask 6.5: 验证规则、筛选和财报模板具备接收 AI 结构化结果并自动填充的技术基础
  - [x] SubTask 6.6: 整理剩余未拆热点与后续建议，明确哪些问题已解决、哪些仍待下一轮处理

- [x] Task 7: 修复 Task 6 回归校验发现的阻塞项
  - [x] SubTask 7.1: 修复 `renderer.mjs` 中“筛选结果创建规则”分支对 `conditionFromUI()` 的缺失导入或错误依赖，消除运行时 `ReferenceError`
  - [x] SubTask 7.2: 补一轮针对筛选结果转规则入口的定向回归检查，避免仅靠 `node --check` 漏过未定义符号问题
  - [x] SubTask 7.3: 修复后重新执行 Task 6，并在通过后再勾选 checklist.md 与 Task 6

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 can run in parallel with Task 2 after Task 1.1 completes
- Task 4 depends on Task 1 and can run in parallel with Task 3
- Task 5 depends on Task 3 and Task 4
- Task 6 depends on Task 2, Task 3, Task 4, and Task 5
- Task 7 depends on Task 6
