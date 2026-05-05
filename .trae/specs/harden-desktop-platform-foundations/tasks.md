# Tasks
- [x] Task 1: 补齐 Storage 版本化与迁移能力
  - [x] SubTask 1.1: 盘点 `config`、`rules`、`state` 当前的存储格式、默认值来源和兼容路径
  - [x] SubTask 1.2: 为本地存储引入 schema version 与迁移入口，避免结构变化只靠 normalize 兜底
  - [x] SubTask 1.3: 为损坏 JSON、非法结构和缺失字段补充修复/回退策略
  - [x] SubTask 1.4: 保持现有用户数据文件兼容，不要求用户手动清空配置

- [x] Task 2: 标准化 IPC 边界
  - [x] SubTask 2.1: 盘点现有 IPC handler 的输入、输出和直接透传点
  - [x] SubTask 2.2: 为关键 IPC 入口增加参数校验与统一错误转换
  - [x] SubTask 2.3: 统一响应口径，避免渲染层继续依赖 raw result 形态
  - [x] SubTask 2.4: 保持现有 IPC 名称和前端调用兼容

- [x] Task 3: 继续收敛 Renderer 入口
  - [x] SubTask 3.1: 盘点 `renderer.mjs` 仍承担的 DOM 绑定、状态协调和控制器装配职责
  - [x] SubTask 3.2: 继续下沉页面细节逻辑与绑定代码，让主入口更接近页面编排器
  - [x] SubTask 3.3: 保持现有规则、筛选、财报和 AI 工作区入口行为兼容

- [x] Task 4: 下沉 AI 模块目录
  - [x] SubTask 4.1: 盘点当前平铺在 `desktop/` 根目录的 AI 模块及其依赖关系
  - [x] SubTask 4.2: 将 AI 模块迁移到专用目录，如 `desktop/ai/`，并更新引用路径
  - [x] SubTask 4.3: 保持聊天模式、builder 模式和现有 AI 工作区调用链兼容

- [x] Task 5: 完成平台基础整改校验
  - [x] SubTask 5.1: 对 Storage 迁移、损坏修复、IPC 校验、Renderer 编排和 AI 目录迁移进行静态校验
  - [x] SubTask 5.2: 对最近改动文件运行 diagnostics 并修复明显问题
  - [x] SubTask 5.3: 回归验证配置读写、规则保存、筛选/财报运行、AI 工作区和桌面端启动入口
  - [x] SubTask 5.4: 整理本轮整改后仍保留的热点与后续建议

# Task Dependencies
- Task 2 can run in parallel with Task 1 after Task 1.1 completes
- Task 3 depends on Task 2
- Task 4 depends on Task 2
- Task 5 depends on Task 1, Task 2, Task 3, and Task 4
