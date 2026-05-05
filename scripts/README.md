# Scripts Inventory

根目录 `scripts/` 不再作为“随手放脚本”的平铺目录使用，而是按链路归属划分：

- `desktop/`: 桌面端治理与边界检查脚本，只服务 `desktop/` 主力链路
- `shared/`: 供桌面端与保留链路共同参考的校验/验证脚本
- `legacy-cli/`: 保留中的命令行提醒链路脚本，继续可用，但不是默认开发入口
- `legacy-web/`: 历史 Web / Inngest / Kit / 调试脚本，仅保留排障、迁移或兼容用途

当前归属如下：

| 分类 | 目录 | 当前脚本 |
| --- | --- | --- |
| 桌面端 | `scripts/desktop/` | `check-desktop-boundaries.mjs` |
| 共享 | `scripts/shared/` | `test-db.mjs`, `fmp-default-rule-test.mjs`, `fmp-financial-screener-test.mjs` |
| 遗留 CLI | `scripts/legacy-cli/` | `alerts-seed.mjs`, `alerts-worker.mjs` |
| 遗留 Web | `scripts/legacy-web/` | `check-env.mjs`, `fetch-to-csv.ts`, `manual-trigger.ts`, `seed-inactive-user.mjs`, `test-db.ts`, `test-email.ts`, `test-yahoo.ts`, `verify-watchlist.mjs` |
| 遗留 Web 调试 | `scripts/legacy-web/debug/` | `check_db_name.js`, `debug-finnhub-metric.ts`, `debug-finnhub.ts`, `debug-volume.ts`, `inspect-user.mjs`, `resolve_srv.js` |
| 遗留 Web / Kit | `scripts/legacy-web/kit/` | `create-kit-tag.mjs`, `list-kit-forms.mjs`, `migrate-users-to-kit.mjs`, `test-kit.mjs` |

维护模式约定：

- `scripts/desktop/` 是桌面端主力链路脚本目录；新增桌面治理、验证、打包辅助脚本默认放这里
- `scripts/shared/` 只放明确可复用、且不会把桌面端重新耦回旧 Web/CLI 的共享校验能力
- 所有 `legacy-*` 目录都按保留/维护模式理解，只处理旧链路兼容、迁移、排障或历史任务
- 如果新增脚本不是在维护旧 Web/CLI，请不要继续放进 `scripts/legacy-cli/` 或 `scripts/legacy-web/`

默认使用原则：

- 日常开发、打包、验证优先走 `desktop/`
- 根目录 `npm` 脚本只保留少量共享校验和保留链路入口
- 看到 `legacy-*` 目录时，应默认理解为历史链路，不作为新功能落点
- 遗留脚本保留源码，但除非明确在维护旧 Web/CLI 链路，否则不要新增依赖

常用入口：

```bash
# 桌面端边界检查
npm run desktop:check-boundaries
npm run lint:desktop-boundaries

# 共享校验
npm run test:db
npm run fmp:test
npm run fmp:financial:test

# 保留 CLI 链路
npm run alerts:seed -- --rule '<json>'
npm run alerts:worker:dry
npm run alerts:worker
```
