# 桌面端平台基础加固 Spec

## Why
上一轮重构已经把桌面端从单文件巨石拉回到分层结构，但底盘还不够硬。当前仍残留四类明显问题：Storage 缺少版本化与迁移机制、IPC 边界还不够标准化、`renderer.mjs` 仍未完全收敛为页面编排器、AI 模块逻辑虽清晰但物理位置仍平铺在 `desktop/` 根目录。

## What Changes
- 为桌面端本地存储引入 schema version、迁移器和损坏修复策略
- 将 `data-store.mjs` 从纯读写工具提升为受版本治理的存储入口
- 为 IPC 层增加统一的参数校验、错误转换和响应口径
- 将 `renderer.mjs` 继续收敛为页面状态编排入口，继续下沉 DOM 绑定与控制器装配细节
- 将 AI 相关模块从 `desktop/` 根目录下沉到专门的 AI 目录，形成明确的物理边界
- 在不破坏现有桌面端功能、配置文件和 IPC 名称兼容性的前提下完成本轮整改
- **BREAKING** 不删除现有功能入口，但内部模块位置、存储实现和 IPC 包装方式可能调整；外部用户数据格式与现有前端调用需保持兼容

## Impact
- Affected specs:
  - 桌面端本地存储兼容性
  - 桌面端 IPC 契约
  - 桌面端渲染层编排结构
  - 桌面端 AI 模块组织
- Affected code:
  - `desktop/main/data-store.mjs`
  - `desktop/main/ipc.mjs`
  - `desktop/preload.mjs`
  - `desktop/renderer/renderer.mjs`
  - `desktop/renderer/*.mjs`
  - `desktop/ai-*.mjs`
  - 未来新增的 `desktop/ai/**`
  - `desktop/shared-config.mjs`

## ADDED Requirements
### Requirement: Storage 必须支持版本化与迁移
系统 SHALL 为桌面端配置、规则、状态等本地存储建立明确的版本化策略，并提供可执行迁移入口，而不是仅靠运行时 normalize 逻辑兜底。

#### Scenario: 旧版本配置被读取
- **WHEN** 用户使用旧版本生成的数据文件启动桌面端
- **THEN** 系统能够识别当前数据版本
- **THEN** 如有必要，应执行迁移并产出兼容当前版本的数据结构

### Requirement: Storage 必须具备损坏修复策略
系统 SHALL 在读取损坏或不合法的本地 JSON 文件时，提供明确的修复、回退或安全降级策略，避免把坏数据直接传给上层模块。

#### Scenario: 配置文件损坏
- **WHEN** 本地配置文件内容不是合法 JSON，或结构严重缺失
- **THEN** 系统应返回明确错误或回退到安全默认值
- **THEN** 不得让上层仅靠业务层 normalize 隐式吞掉所有问题

### Requirement: IPC 必须标准化
系统 SHALL 为桌面端 IPC 建立统一的参数校验、错误转换和响应格式，避免 handler 继续直接透传原始 payload 或原始异常。

#### Scenario: 渲染层传入非法参数
- **WHEN** 渲染层通过 `window.api` 调用 IPC 且参数不合法
- **THEN** 主进程应在 IPC 边界明确拒绝该请求
- **THEN** 返回统一的错误描述，而不是把异常延迟到更深层抛出

### Requirement: Renderer 入口必须收敛为编排层
系统 SHALL 继续把 `renderer.mjs` 收敛为页面状态编排入口，不再长期承载过多 DOM 绑定、跨控制器协调和页面细节逻辑。

#### Scenario: 新增前端行为
- **WHEN** 后续继续新增桌面端前端能力
- **THEN** 应优先落在对应控制器、视图模块或状态模块中
- **THEN** `renderer.mjs` 主要负责装配、状态编排和跨模块调用

### Requirement: AI 模块必须有独立物理边界
系统 SHALL 将桌面端 AI 相关模块收敛到独立目录中，避免 AI 能力继续在 `desktop/` 根目录平铺扩散。

#### Scenario: 扩展 AI 能力
- **WHEN** 后续继续新增 AI 聊天、结构化生成、工具调用或多智能体编排能力
- **THEN** 相关代码应主要落在 AI 专用目录中
- **THEN** 桌面端根目录不应继续堆放大量 AI 细分模块

### Requirement: 本轮整改必须保持兼容
系统 SHALL 在完成 Storage、IPC、Renderer 和 AI 目录整改后，保持现有配置字段、用户数据、前端调用和桌面端功能入口兼容。

#### Scenario: 升级后继续使用桌面端
- **WHEN** 用户升级到本轮整改后的版本
- **THEN** 原有配置、规则、筛选、财报、AI 工作区和调度能力仍能继续使用
- **THEN** 用户不需要手动重建已有本地数据

## MODIFIED Requirements
### Requirement: 桌面端平台基础结构
桌面端平台基础结构 SHALL 从“功能已拆分但底层治理仍偏弱”修改为“具备存储演进能力、IPC 标准边界、页面编排入口和 AI 物理边界”的状态。

#### Scenario: 后续继续扩功能
- **WHEN** 后续继续扩展桌面端功能
- **THEN** 配置结构变更应通过存储版本化与迁移处理
- **THEN** IPC 新入口应复用统一校验与错误包装
- **THEN** AI 模块扩展应进入专用目录，而不是继续平铺在根目录

## REMOVED Requirements
### Requirement: 依赖 normalize 和人工约定兜底平台演进
**Reason**: 仅靠 `normalizeDesktopConfig()`、薄 IPC 和目录约定无法支撑后续持续演进，会逐步把兼容性、错误处理和模块定位成本重新推高。
**Migration**: 通过版本化存储、标准化 IPC、进一步瘦身 renderer 入口和 AI 目录下沉来替代当前的隐式兜底方式。
