# 桌面端定时体验整理 Spec

## Why
当前桌面端定时功能已经具备基础执行能力，但用户体验存在明显缺口：`daily` 模式启动后会立即跑一轮、界面缺少“当前是否常驻/下次何时执行”的状态反馈、长任务被跳过时缺少可解释信息。这会让用户无法放心依赖定时能力，也容易把“未到执行时间”“已被跳过”“应用未常驻”误判成 bug。

## What Changes
- 将 `daily` 模式调整为真正按“下一次设定时间”触发，而不是启动后立即执行
- 在定时页和运行状态区补充可见状态：当前常驻状态、当前调度模式、下次预计执行时间、最近一次执行时间、最近一次结果
- 将“跳过触发”的原因显式化，至少区分：已有任务在运行、应用未启动常驻、手动停止后不再调度
- 优化启动/停止常驻的交互反馈，避免用户无法判断“是否已生效”
- 为后续是否支持“应用启动恢复常驻”和“错过执行补跑”预留数据结构与文案口径，但本次不实现系统级守护

## Impact
- Affected specs:
  - 桌面端调度与运行状态反馈
  - 桌面端定时配置交互
  - 日志与诊断可解释性
- Affected code:
  - `desktop/engine/scheduler.mjs`
  - `desktop/engine/alerts-runner.mjs`
  - `desktop/main/ipc.mjs`
  - `desktop/preload.mjs`
  - `desktop/renderer/index.html`
  - `desktop/renderer/run-controller.mjs`
  - `desktop/renderer/renderer.mjs`
  - `desktop/renderer/workspace-bindings-controller.mjs`
  - `desktop/renderer/config-controller.mjs`
  - `desktop/main/data-store.mjs`

## ADDED Requirements
### Requirement: 定时状态可见
系统 SHALL 在桌面端界面中明确展示定时运行的当前状态，避免用户依赖日志猜测调度是否生效。

#### Scenario: 常驻已启动
- **WHEN** 用户点击 `启动常驻`
- **THEN** 界面显示当前处于常驻状态
- **AND** 界面显示当前调度模式
- **AND** 界面显示下一次预计执行时间

#### Scenario: 常驻已停止
- **WHEN** 用户点击 `停止`
- **THEN** 界面显示当前未常驻
- **AND** 下一次预计执行时间被清空或标记为未调度

#### Scenario: 最近一次运行结果可见
- **WHEN** 一轮定时执行结束
- **THEN** 界面显示最近一次执行时间
- **AND** 显示最近一次结果摘要（完成/失败、总规则数、失败规则数）

### Requirement: Daily 模式符合直觉
系统 SHALL 让 `daily` 模式在启动常驻后等待到下一次设定时间触发，而不是立即执行一次。

#### Scenario: 启动时间晚于设定时间
- **WHEN** 用户将 `dailyTime` 配置为 `09:30`，并在当日 `22:00` 启动常驻
- **THEN** 系统不立即执行
- **AND** 下一次执行时间显示为下一个有效的 `09:30`

#### Scenario: 工作日限定
- **WHEN** 用户启用 `weekdaysOnly=true`
- **THEN** 若下一次设定时间落在周末
- **THEN** 系统自动跳到下一个工作日同一时间

### Requirement: 跳过执行原因可解释
系统 SHALL 在调度触发但未实际执行时记录明确原因，并在界面或日志中可追踪。

#### Scenario: 上一轮仍在运行
- **WHEN** 定时器触发时上一轮任务尚未完成
- **THEN** 系统记录“本次触发已跳过，原因=已有任务在运行”
- **AND** 不重复启动新的规则执行

#### Scenario: 用户主动停止
- **WHEN** 用户点击 `停止`
- **THEN** 后续不再继续调度
- **AND** 状态区更新为未常驻

### Requirement: 定时配置保存后可验证
系统 SHALL 让用户在保存定时配置后能立即验证当前配置已被实际采用。

#### Scenario: 保存 interval 配置
- **WHEN** 用户保存 `interval` 模式和新的间隔秒数
- **THEN** 界面能回显当前配置值
- **AND** 启动常驻后显示基于该配置计算出的下一次执行时间

#### Scenario: 保存 daily 配置
- **WHEN** 用户保存 `daily` 模式、时间和工作日限制
- **THEN** 界面能回显当前配置值
- **AND** 启动常驻后显示基于该配置计算出的下一次执行时间

## MODIFIED Requirements
### Requirement: 桌面端常驻调度
系统 SHALL 在桌面端应用保持运行且用户显式启动常驻后，根据当前保存的调度配置执行规则任务；`interval` 模式允许启动后立即执行一轮，而 `daily` 模式必须等待到下一次有效的设定时间。

#### Scenario: Interval 模式启动
- **WHEN** 用户在 `interval` 模式下点击 `启动常驻`
- **THEN** 系统立即执行一轮规则任务
- **AND** 按设定间隔继续调度后续任务

#### Scenario: Daily 模式启动
- **WHEN** 用户在 `daily` 模式下点击 `启动常驻`
- **THEN** 系统仅计算并展示下一次执行时间
- **AND** 不在启动瞬间先执行一轮任务

### Requirement: 运行状态诊断
系统 SHALL 将调度状态诊断扩展为包含“当前是否常驻、当前调度模式、下一次执行时间、最近一次跳过原因”等信息，方便用户和开发者定位问题。

## REMOVED Requirements
### Requirement: Daily 模式启动即执行一轮
**Reason**: 该行为与普通用户对“每日定时”的直觉相反，会让用户误以为系统提前触发或配置失效。
**Migration**: `daily` 模式改为只计算下一次触发时间；若用户需要“启动后先跑一次”，应显式点击 `真实跑一次`。
