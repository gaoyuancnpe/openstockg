# 多链路隔离治理 Spec

## Why
当前项目实际上已经以桌面端为主力链路，但仓库入口、脚本组织、说明文档和边界规则仍保留明显的多链路混杂状态。继续这样发展，会让 Web 端和命令行遗留代码持续污染桌面端开发判断，增加误用模块、误跑入口和边界漂移风险。

## What Changes
- 明确桌面端为当前主力链路，Web 端与命令行为保留链路而非主开发目标
- 建立桌面端、Web 端、CLI/脚本三类链路的依赖边界与禁止方向
- 清理仓库入口说明，避免默认把根目录 Web 脚本误当成当前主入口
- 重组或标记脚本用途，区分桌面端有效脚本、共享脚本和遗留脚本
- 为仓库增加边界检查规则，防止 `desktop` 误引用 `app/lib/components/scripts` 等 Web/CLI 代码
- 为 Web/CLI 保留最小维护说明，但不删除现有代码
- **BREAKING** 不删除 Web/CLI 代码，也不改变桌面端现有功能；本轮主要调整治理规则、目录认知和依赖边界

## Impact
- Affected specs:
  - 仓库主入口说明
  - 桌面端主力链路定位
  - Web/CLI 保留链路治理
  - 脚本分层与边界校验
- Affected code:
  - `README.md`
  - `package.json`
  - `desktop/package.json`
  - `scripts/**`
  - `desktop/**`
  - 可能新增或调整的 lint / 边界检查配置

## ADDED Requirements
### Requirement: 仓库主力链路必须明确
系统 SHALL 在仓库入口与开发说明中明确：当前桌面端为主力链路，Web 端和 CLI 为保留链路，仅做最低限度维护。

#### Scenario: 新开发者查看仓库入口
- **WHEN** 开发者打开仓库根说明或查看主要启动方式
- **THEN** 能明确知道桌面端是当前主入口
- **THEN** 不会误把 Web 端默认脚本或历史 CLI 脚本理解为主开发链路

### Requirement: 多链路依赖方向必须受控
系统 SHALL 建立多链路边界规则，禁止桌面端直接依赖 Web 端页面、组件、Web actions 或遗留 CLI 代码。

#### Scenario: 桌面端新增功能
- **WHEN** 开发者为桌面端新增模块或功能
- **THEN** 不得直接 import `app`、`components`、`lib/actions`、Web 专属 `scripts` 等链路代码
- **THEN** 仅允许依赖桌面端自身模块或明确标记为共享的能力

### Requirement: Web 与 CLI 可保留但必须降噪
系统 SHALL 保留 Web 端和 CLI 相关代码，但必须用文档、命名或目录分层明确其当前状态，避免继续对桌面端开发形成认知污染。

#### Scenario: 查看脚本和说明文档
- **WHEN** 开发者查看 `scripts` 或 README
- **THEN** 可以快速区分桌面端可用脚本、共享脚本和遗留脚本
- **THEN** 不会因名称模糊或说明缺失误执行旧链路

### Requirement: 边界检查必须自动化
系统 SHALL 提供可执行的边界检查方式，防止未来再次出现桌面端引用 Web/CLI 代码、或遗留链路反向污染桌面端的情况。

#### Scenario: 提交或校验代码
- **WHEN** 开发者运行约定的检查命令
- **THEN** 若桌面端跨越边界引用 Web/CLI 代码，应被明确报错
- **THEN** 若只是保留未使用的旧链路代码，不应误报

### Requirement: 主入口与辅助入口必须分层呈现
系统 SHALL 在开发入口、打包入口、测试入口中区分主力链路与保留链路，确保日常开发默认指向桌面端。

#### Scenario: 开发者寻找启动命令
- **WHEN** 开发者查看启动、测试和打包命令
- **THEN** 桌面端入口应位于最显眼位置
- **THEN** Web/CLI 入口应保留但附带链路状态说明

## MODIFIED Requirements
### Requirement: 项目链路组织方式
项目当前的链路组织方式 SHALL 从“桌面端、Web、CLI 并列暴露且优先级不明”修改为“桌面端主力、其他链路保留但隔离”。

#### Scenario: 后续扩展功能
- **WHEN** 后续继续开发本项目
- **THEN** 新能力默认优先落在桌面端链路
- **THEN** 只有在明确需要时才触达 Web 或 CLI 保留链路

## REMOVED Requirements
### Requirement: 多链路默认等权
**Reason**: 当前实际研发重心已经转移到桌面端，继续维持多链路默认等权会持续制造误导与边界污染。
**Migration**: 保留 Web/CLI 代码，但通过入口声明、脚本分层和自动边界检查将其降为保留链路。
