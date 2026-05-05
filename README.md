# OpenStock

## 版权与许可证

- 本仓库保留根目录中的 [LICENSE](file:///home/gaoyuan/openstock-g/OpenStock/LICENSE)，当前按 `AGPL-3.0-or-later` 分发
- 上游与修改说明见 [NOTICE.md](file:///home/gaoyuan/openstock-g/OpenStock/NOTICE.md)
- 如果你继续修改并分发，建议显著标注“你修改过哪些内容、修改时间是什么”
- 如果你将 Web 版本对外提供网络服务，还需要按 `AGPL` 的要求向用户提供对应源码获取方式
- 本项目与输出结果不提供任何担保，也不构成投资建议

`OpenStock` 当前以 `desktop/` 下的 Electron 桌面端为主力产品形态。  
根目录中的 `Web` 与 `CLI` 链路继续保留，但默认按兼容/维护用途理解，不再作为日常开发与交付的第一入口。

当前仓库包含三条能力线：

- `桌面端提醒工具`：主力链路，基于 Electron 的 Windows 桌面应用，适合直接图形化配置规则、数据源和通知。
- `Web 站点`：保留链路，原始的 Next.js 股票网站代码，含登录、详情页、Watchlist、Inngest 等。
- `命令行提醒脚本`：保留链路，基于 MongoDB + Finnhub 的后端提醒 worker，适合服务器或本地定时跑。

如果你只是想快速用起来，直接进入 `desktop/`。

## 维护模式约定

- `desktop/` 是当前唯一默认主力链路；日常开发、联调、验证、打包与新增功能默认都落在这里
- 根目录 `Web` 工程与 `scripts/legacy-cli/`、`scripts/legacy-web/` 目录属于保留链路，按 `legacy / 保留 / 维护模式` 理解
- 除非需求明确写的是“维护旧 Web/CLI 链路”或“兼容历史部署”，否则不要把新页面、新脚本、新提醒能力继续放到保留链路
- 在仓库根目录看到 `npm run dev`、`npm run build`、`npm start` 时，应默认理解为旧 Web 链路的维护入口，不是当前产品主入口

## 默认入口

日常开发、验证和打包默认优先走桌面端：

```bash
cd desktop
npm install
npm run dev
```

常用打包入口：

```bash
npm run dist:win:check-env
npm run dist:win
npm run dist:win:zip:check-env
npm run dist:win:zip
```

如果你希望从仓库根目录直接进入桌面端，也可以执行：

```bash
npm run desktop:dev
npm run desktop:dist:win:check-env
npm run desktop:dist:win
npm run desktop:dist:win:zip:check-env
npm run desktop:dist:win:zip
```

## 当前推荐路线

### 1. 只想直接使用提醒功能

用 `desktop/` 下的 Electron 桌面端。

优点：
- 不需要前端开发环境
- 不需要登录网站
- 可视化配置数据源、规则、定时和通知
- 可直接打包成 Windows 可执行文件

### 2. 想在服务器或命令行里自动跑（保留链路）

用根目录下的 `scripts/legacy-cli/alerts-worker.mjs` 和 `scripts/legacy-cli/alerts-seed.mjs`。

适合：
- 云服务器
- 定时任务
- 本地脚本自动执行

维护约定：
- 这条链路继续可用，但当前按维护模式保留
- 新增提醒产品能力时，默认先评估桌面端是否已经有承载位置
- 只有明确要兼容历史自动化脚本时，才继续修改这里

### 3. 想继续维护原网站（保留链路）

用根目录的 Next.js 工程。

注意：
- 这部分仍然保留，但当前提醒业务的主路径已经切到桌面端
- 部分历史功能还依赖 Better Auth、MongoDB、Inngest、Finnhub 等原有配置
- 新需求若不是明确要求维护旧站点，请不要默认继续落到 `app/`、`components/`、`lib/` 这条链路

## 环境要求

- Node.js `20+`
- npm `10+`
- 如果你要在 Linux / WSL 下打 Windows `nsis` 安装包，还需要 `wine` / `wine64`
- MongoDB
- 至少一种行情数据源 Key
  - `FMP`：桌面端默认推荐
  - `Finnhub`：命令行脚本当前主要依赖
- 如需邮件通知，还需要：
  - `Gmail` 邮箱
  - `Gmail App Password`

## 目录说明

```text
OpenStock/
├── app/                    # Next.js Web 应用
├── components/             # Web UI 组件
├── database/               # MongoDB / Mongoose
├── lib/                    # Web 侧业务逻辑、Inngest、邮件等
├── scripts/                # 桌面治理脚本、共享校验脚本与保留链路 legacy 脚本
├── desktop/                # Electron 桌面端
│   ├── renderer/           # 桌面端界面
│   ├── main.mjs            # Electron 主进程
│   ├── engine.mjs          # 桌面端提醒引擎
│   └── USER_GUIDE.md       # 桌面端用户手册
└── README.md
```

## 安装依赖

### 桌面端依赖（默认）

```bash
cd desktop
npm install
```

### 根目录依赖（Web/CLI 保留链路）

```bash
npm install
```

如果你在国内网络环境下安装 Electron 依赖较慢，建议先切镜像后再装。

## Scripts 归属

为降低历史脚本误用概率，根目录 `scripts/` 已按归属拆分：

- `scripts/desktop/`：桌面端治理脚本，例如 `check-desktop-boundaries.mjs`
- `scripts/shared/`：共享校验脚本，例如 `test-db.mjs`、`fmp-default-rule-test.mjs`
- `scripts/legacy-cli/`：保留中的命令行提醒脚本
- `scripts/legacy-web/`：历史 Web、Kit、调试与迁移脚本

完整清单见 [scripts/README.md](file:///home/gaoyuan/openstock-g/OpenStock/scripts/README.md)。

## 环境变量

根目录建议创建 `.env`。

最常用的一组如下：

```env
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/openstock
MONGODB_DB=openstock

BETTER_AUTH_SECRET=replace_me
BETTER_AUTH_URL=http://localhost:3000

NEXT_PUBLIC_FINNHUB_API_KEY=replace_me
FINNHUB_API_KEY=replace_me
FINNHUB_BASE_URL=https://finnhub.io/api/v1

FMP_API_KEY=replace_me
FMP_BASE_URL=https://financialmodelingprep.com

NODEMAILER_EMAIL=your@gmail.com
NODEMAILER_PASSWORD=your_gmail_app_password

ALERTS_DEFAULT_EMAIL_TO=you@example.com
ALERTS_POLL_INTERVAL_SEC=60
ALERTS_DEFAULT_COOLDOWN_SEC=900
ALERTS_MAX_SYMBOLS_PER_BATCH=25
```

说明：

- `MONGODB_URI`：命令行提醒脚本和 Web 站点都会用到
- `NEXT_PUBLIC_FINNHUB_API_KEY`：原 Web 站点里部分接口仍在使用
- `FINNHUB_API_KEY`：命令行提醒脚本推荐使用
- `FMP_API_KEY`：纯后端 FMP 默认规则测试脚本使用
- `NODEMAILER_EMAIL` / `NODEMAILER_PASSWORD`：邮件通知使用
- `ALERTS_DEFAULT_EMAIL_TO`：未在单条规则内指定邮箱时的默认收件人

桌面端默认把配置保存到本地文件，不强依赖根目录 `.env`。  
桌面端主要在界面中填写：

- 数据源
- FMP / Finnhub Key
- 默认收件人
- Gmail 账号和应用专用密码
- 默认回调地址

## 常见操作

## 桌面端（主力链路）

当前推荐优先使用桌面端进行配置、验证和打包。

### 1. 启动桌面端开发版

```bash
cd desktop
npm install
npm run dev
```

如果你更习惯在仓库根目录操作，也可以执行：

```bash
npm run desktop:dev
```

### 2. 桌面端首次使用建议顺序

启动后建议按这个顺序操作：

1. 进入 `配置`
2. 选择数据源
3. 填写 `FMP API Key` 或 `Finnhub API Key`
4. 填写默认收件人和 Gmail 配置
5. 保存配置
6. 进入 `规则`
7. 点击 `添加规则`
8. 先用默认规则验证
9. 进入 `运行`
10. 先点 `模拟运行一次`

### 3. 默认规则

当前桌面端默认重点支持这条规则：

- 最近一个成交日收盘市值超过 `100 亿美元`
- 最近一个成交日成交额超过 `5 亿美元`
- `5` 个交易日内股价创历史新高

### 3.1 财报筛选（Premium）

桌面端新增了 `财报` 页，专门对应 FMP `Premium` 套餐可拿到的完整 fundamentals。

当前支持：

- 最近季度营收同比下限
- 最近季度毛利率下限
- 最近季度 EBITDA 利润率下限
- 最近季度 EBITDA 同比下限
- 最近季度经营利润率下限
- 经营现金流必须为正
- 自由现金流必须为正
- 负债权益比上限

推荐使用顺序：

1. 在 `配置` 页填好 `FMP API Key`
2. 进入 `财报` 页，先点 `套用成长财报模板`
3. 先把扫描数量控制在 `50-100`
4. 点击 `运行财报筛选`
5. 如果命中结果合理，再点 `将结果加入提醒池`

提示：

- 财报筛选当前只走 `FMP`，不依赖 `Finnhub`
- 结果表会同时展示最近季度 `EBITDA`、`EBITDA 同比` 和 `EBITDA 利润率`
- 首次冷启动常见会比价格筛选慢，因为每支股票需要拉 `profile + 三张财报表`
- 财报更新频率比行情低，所以重复扫描通常会更快
- 全量美股候选池会按市值从高到低固定排序后写入本地缓存；后续默认直接复用缓存，只有手动刷新/重建缓存时才会重排

### 3.2 统一 AI 解读区（DeepSeek v4）

桌面端右侧现已提供统一 `AI 解读` 区，不再只绑定财报页。

配置入口在桌面端 `配置` 页，可设置：

- `DeepSeek API Key`
- `DeepSeek Base URL`，默认 `https://api.deepseek.com`
- 模型：`deepseek-v4-flash` / `deepseek-v4-pro`
- 是否开启思考模式
- 思考强度：`high` / `max`

当前已支持从这几个入口触发：

- 财报结果
- 筛选结果
- 规则卡片

当前调用方式使用 DeepSeek 的 OpenAI 兼容 `chat/completions`，AI 只负责解释结构化结果与规则配置，不直接替代筛选是否通过。

### 4. 打包 Windows 安装包

支持环境：

- 原生 Windows：`dist:win` 与 `dist:win:zip` 都是默认支持入口
- Linux / WSL：`dist:win` 需要先安装 `wine`，可先跑 `npm run dist:win:check-env`
- Linux / WSL：`dist:win:zip` 当前不作为支持环境，请改在 Windows PowerShell / CMD 中执行

在 `desktop/` 目录执行：

```bash
npm run dist:win:check-env
npm run dist:win
```

或在仓库根目录执行：

```bash
npm run desktop:dist:win:check-env
npm run desktop:dist:win
```

注意：

- 在 Linux / WSL 下直接打 `nsis` 包需要 `wine`
- 如果预检提示缺少 `wine`，请先补依赖，或切回 Windows 原生环境执行
- 新入口会先输出环境原因和下一步建议，再决定是否继续调用 `electron-builder`

### 5. 打包 Windows Zip

```bash
npm run dist:win:zip:check-env
npm run dist:win:zip
```

或在仓库根目录执行：

```bash
npm run desktop:dist:win:zip:check-env
npm run desktop:dist:win:zip
```

产物默认在：

- `desktop/dist/`

说明：

- `dist:win:zip` 当前只验证原生 Windows 环境
- 如果你在 Linux / WSL 下执行，这个入口会直接失败并提示改到 Windows PowerShell / CMD 中运行，避免继续进入误导性的 `electron-builder` 报错

### 6. 直接复制到 F 盘

如果你在 WSL 中开发，且 Windows 已挂载到 `/mnt/f`，可以直接执行：

```bash
npm run dist:win:zip:toF
```

该命令会：

1. 先构建 Windows zip 包
2. 再复制到 `F:\OpenStockAlerts\dist\`

### 7. 桌面端本地数据文件

桌面端会把本地数据保存到用户目录下，主要包括：

- `config.json`
- `rules.json`
- `state.json`
- `events.jsonl`
- `universe_us_symbols.json`

应用内“运行”区域会显示这些路径。

如需强制使用自定义数据目录，可设置：

```bash
OPENSTOCK_USER_DATA_DIR=/your/path npm run dev
```

## Web 站点（保留链路 / 维护模式）

这部分仅用于维护旧网站、兼容历史部署或排查旧链路问题。  
如果你是在做日常开发或新增提醒功能，请优先回到 `desktop/`。

### 本地启动开发环境

```bash
npm run dev
```

启动后访问：

- [http://localhost:3000](http://localhost:3000)

### 构建生产版本

```bash
npm run build
npm start
```

### 检查数据库连接

```bash
npm run test:db
```

### 代码检查

```bash
npm run lint
npm run lint:desktop-boundaries
```

`desktop` 当前只允许引用 `desktop/` 内部模块，或后续显式沉淀到 `shared/`、`packages/shared/` 的共享能力。
检查脚本会直接拦截 `desktop` 对根级 `app/`、`components/`、`lib/actions/`、`scripts/` 的 import，并把其他未声明共享边界的跨目录引用也视为失败。

## 命令行提醒脚本（保留链路 / 维护模式）

这部分适合“不需要前端界面，只要自动运行提醒”的场景。
如果你是在做新的提醒交互、配置流或默认能力设计，默认应先在桌面端实现，而不是继续把能力放进旧 worker。

### 1. 先写入一条规则

```bash
npm run alerts:seed -- --rule '{"enabled":true,"name":"AAPL 上穿 SMA20","symbols":["AAPL"],"cooldownSec":3600,"notify":{"email":"you@example.com"},"condition":{"op":"crossesAbove","left":{"var":"price"},"right":{"var":"sma20"}}}'
```

这条命令会把规则写入 MongoDB 的 `alert_rules` 集合。

### 2. 模拟运行一次

```bash
npm run alerts:worker:dry
```

用途：

- 验证规则是否能正常加载
- 验证 Finnhub 数据能否拉到
- 验证日志输出是否正常
- 不发送真实通知

### 3. 真实运行一次

```bash
npm run alerts:worker
```

### 4. 直接用原始命令

```bash
node scripts/legacy-cli/alerts-worker.mjs --once
node scripts/legacy-cli/alerts-worker.mjs --once --dry-run
```

### 5. 脚本依赖的环境变量

`scripts/legacy-cli/alerts-worker.mjs` 主要依赖：

- `MONGODB_URI`
- `MONGODB_DB`
- `FINNHUB_API_KEY` 或 `NEXT_PUBLIC_FINNHUB_API_KEY`
- `FINNHUB_BASE_URL`
- `NODEMAILER_EMAIL`
- `NODEMAILER_PASSWORD`
- `ALERTS_DEFAULT_EMAIL_TO`
- `ALERTS_POLL_INTERVAL_SEC`
- `ALERTS_DEFAULT_COOLDOWN_SEC`
- `ALERTS_MAX_SYMBOLS_PER_BATCH`

### 6. 纯后端测试 FMP 默认规则

先在根目录 `.env.local` 里填写：

```env
FMP_API_KEY=你的_fmp_key
FMP_BASE_URL=https://financialmodelingprep.com
```

然后执行：

```bash
npm run fmp:test
```

常用变体：

```bash
npm run fmp:test -- --limit=100
npm run fmp:test -- --limit=300 --concurrency=6
```

这条命令默认验证的就是当前主规则：

- 最近一个成交日收盘市值超过 `100 亿美元`
- 最近一个成交日成交额超过 `5 亿美元`
- `5` 个交易日内股价创历史新高

输出会直接告诉你：

- FMP Key 是否可用
- 候选池是否能拉到
- 小样本是否能跑通
- 哪些股票命中
- 大致耗时和失败样本

建议先从 `50` 或 `100` 支样本开始，不要一上来就全量扫描。这样更适合先判断“接口能不能用、默认规则能不能跑”，再决定是否付费升级套餐。

### 7. 纯后端测试 FMP Premium 财报筛选

这条命令用于验证 `Premium` 套餐下的财报筛选能力，当前指标包括：

- 最近季度营收同比
- 最近季度毛利率
- 最近季度 EBITDA
- 最近季度 EBITDA 同比
- 最近季度 EBITDA 利润率
- 最近季度经营利润率
- 最近季度经营现金流是否为正
- 最近季度自由现金流是否为正
- 最近季度负债权益比

执行：

```bash
npm run fmp:financial:test
```

常用变体：

```bash
npm run fmp:financial:test -- --limit=30
npm run fmp:financial:test -- --limit=60 --concurrency=2
npm run fmp:financial:test -- --min-revenue-growth-yoy=20 --min-gross-margin=45
```

说明：

- 这条测试脚本直接走 FMP `stable` 财报接口
- 更适合先在终端里验证财报筛选逻辑，再决定是否放大到桌面端批量扫描
- 若你只想验证当前默认价格规则，请继续使用 `npm run fmp:test`

## 常用命令速查

### 桌面端目录（主力链路）

```bash
cd desktop
npm install
npm run dist:win:check-env
npm run dev
npm run dist:win
npm run dist:win:zip:check-env
npm run dist:win:zip
npm run dist:win:zip:toF
```

### 仓库根目录（桌面端快捷入口）

```bash
npm run desktop:dev
npm run desktop:dist:win:check-env
npm run desktop:dist:win
npm run desktop:dist:win:zip:check-env
npm run desktop:dist:win:zip
npm run desktop:check-boundaries
```

### 根目录（Web/CLI 保留链路，仅维护）

```bash
npm install
npm run dev
npm run build
npm start
npm run lint
npm run test:db
npm run alerts:seed -- --rule '<json>'
npm run alerts:worker:dry
npm run alerts:worker
```

## 常见问题

### 1. 桌面端一打开就弹出规则窗口，不能取消

优先确认你是不是打开了旧打包文件。  
建议总是：

- 删除旧解压目录
- 重新解压最新 zip
- 从新目录里的 `exe` 启动

### 2. 点了“添加规则”看不到默认模板

先确认：

- 当前运行的是最新包
- 已删除旧版本解压目录
- 不是误点了旧的散装 `exe`

### 3. Electron 安装失败

常见原因：

- npm 源太慢
- Electron 二进制下载超时

建议：

- 切国内镜像
- 清理失败依赖后重装

### 4. Linux / WSL 打 Windows 包失败

先执行预检：

```bash
npm run dist:win:check-env
npm run dist:win:zip:check-env
```

常见情况：

- `dist:win` 提示缺少 `wine`：安装 `wine` / `wine64` 后再试，或改到 Windows 原生环境
- `dist:win:zip` 提示当前环境不支持：请直接切到 Windows PowerShell / CMD 执行

如果你已经补齐 `wine`，再执行：

```bash
npm run dist:win
```

如果你要打 zip 包，请改在 Windows 环境执行：

```bash
npm run dist:win:zip
```

### 5. 邮件发不出去

优先检查：

- `NODEMAILER_EMAIL` 或桌面端 Gmail 账号是否正确
- `NODEMAILER_PASSWORD` 或 Gmail 应用专用密码是否正确
- 是否误用了普通登录密码而不是 App Password

### 6. 命令行提醒脚本没有命中

优先检查：

- MongoDB 里是否真的有 `enabled: true` 的规则
- `FINNHUB_API_KEY` 是否可用
- rule 的 `symbols` 是否填写正确
- 先用 `npm run alerts:worker:dry` 看日志

## 开发建议

- 做桌面端改动时，优先验证 `desktop/renderer/index.html`、`desktop/renderer/renderer.mjs`、`desktop/renderer/styles.css`
- 做提醒逻辑改动时，优先验证 `desktop/engine.mjs` 与 `scripts/legacy-cli/alerts-worker.mjs`
- 推送 GitHub 前，避免把 `desktop/node_modules`、`desktop/dist` 一并提交

## 许可证

本项目使用 `AGPL-3.0` 许可证。

如果你修改、重新分发或将其部署为服务，请遵守 `LICENSE` 中的条款，并保留原始许可证与署名要求。
