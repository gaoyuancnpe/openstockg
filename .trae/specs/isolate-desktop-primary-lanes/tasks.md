# Tasks
- [x] Task 1: 明确仓库主力链路与保留链路
  - [x] SubTask 1.1: 盘点当前根 README、根 `package.json`、`desktop/package.json` 中的入口暴露方式
  - [x] SubTask 1.2: 调整文档与入口说明，明确桌面端为主力链路，Web/CLI 为保留链路
  - [x] SubTask 1.3: 确保桌面端开发、测试、打包入口在说明中优先呈现

- [x] Task 2: 治理脚本层的多链路混杂
  - [x] SubTask 2.1: 盘点 `scripts` 目录中的桌面端脚本、共享脚本和遗留 Web/CLI 脚本
  - [x] SubTask 2.2: 通过命名、目录、注释或文档说明区分脚本归属，避免误用
  - [x] SubTask 2.3: 保留遗留脚本但降低其默认暴露度，不影响已有功能

- [x] Task 3: 建立多链路边界规则
  - [x] SubTask 3.1: 盘点桌面端是否存在对 `app`、`components`、`lib/actions`、遗留脚本等链路的直接依赖
  - [x] SubTask 3.2: 设计并落地桌面端禁止跨链路引用的自动检查方案
  - [x] SubTask 3.3: 允许共享能力存在，但必须有明确共享边界，避免“看起来共享、实际混用”

- [x] Task 4: 降低 Web/CLI 对桌面端开发心智的污染
  - [x] SubTask 4.1: 对 Web/CLI 保留链路增加状态说明，例如 legacy、保留、维护模式等
  - [x] SubTask 4.2: 确保日常开发时默认看到的是桌面端链路，而非根目录 Web 入口
  - [x] SubTask 4.3: 避免新功能开发继续误落到保留链路中

- [x] Task 5: 完成隔离治理校验
  - [x] SubTask 5.1: 校验桌面端与 Web/CLI 之间不存在新的直接依赖
  - [x] SubTask 5.2: 校验主入口说明、脚本说明和边界检查规则已落地
  - [x] SubTask 5.3: 校验桌面端现有运行、打包和测试入口未被破坏
  - [x] SubTask 5.4: 整理本轮隔离治理后仍保留的风险与后续建议

- [x] Task 6: 修复桌面端 Windows 打包入口兼容性问题
  - [x] SubTask 6.1: 复现并定位 `desktop:dist:win` 与 `desktop:dist:win:zip` 在当前 Linux/WSL 环境下的失败原因
  - [x] SubTask 6.2: 明确 Windows 打包的支持环境、前置依赖与脚本约束，避免在不支持环境下产生误导性入口
  - [x] SubTask 6.3: 修复或补充兼容方案后，重新验证根目录代理入口与 `desktop/` 目录内入口都能稳定产出构建结果

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 can run in parallel with Task 2 after Task 1.1 completes
- Task 4 depends on Task 1 and Task 2
- Task 5 depends on Task 2, Task 3, and Task 4
- Task 6 depends on Task 5 validation findings
