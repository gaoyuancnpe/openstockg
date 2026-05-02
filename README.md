# OpenStock

## 版权与许可证

- 本仓库保留根目录中的 [LICENSE](file:///home/gaoyuan/openstock-g/OpenStock/LICENSE)，当前按 `AGPL-3.0-or-later` 分发
- 上游与修改说明见 [NOTICE.md](file:///home/gaoyuan/openstock-g/OpenStock/NOTICE.md)
- 如果你继续修改并分发，建议显著标注“你修改过哪些内容、修改时间是什么”
- 如果你将 Web 版本对外提供网络服务，还需要按 `AGPL` 的要求向用户提供对应源码获取方式
- 本项目与输出结果不提供任何担保，也不构成投资建议

`OpenStock` 目前同时包含三条能力线：

- `Web 站点`：原始的 Next.js 股票网站代码，含登录、详情页、Watchlist、Inngest 等。
- `命令行提醒脚本`：基于 MongoDB + Finnhub 的后端提醒 worker，适合服务器或本地定时跑。
- `桌面端提醒工具`：基于 Electron 的 Windows 桌面应用，适合直接图形化配置规则、数据源和通知。

如果你只是想快速用起来，当前推荐优先走 `桌面端`。

## 当前推荐路线

### 1. 只想直接使用提醒功能

用 `desktop/` 下的 Electron 桌面端。

优点：
- 不需要前端开发环境
- 不需要登录网站
- 可视化配置数据源、规则、定时和通知
- 可直接打包成 Windows 可执行文件

### 2. 想在服务器或命令行里自动跑

用根目录下的 `scripts/alerts-worker.mjs` 和 `scripts/alerts-seed.mjs`。

适合：
- 云服务器
- 定时任务
- 本地脚本自动执行

### 3. 想继续维护原网站

用根目录的 Next.js 工程。

注意：
- 这部分仍然保留，但当前提醒业务的主路径已经更偏向脚本和桌面端
- 部分历史功能还依赖 Better Auth、MongoDB、Inngest、Finnhub 等原有配置

## 环境要求

- Node.js `20+`
- npm `10+`
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
├── scripts/                # 命令行提醒脚本与调试脚本
├── desktop/                # Electron 桌面端
│   ├── renderer/           # 桌面端界面
│   ├── main.mjs            # Electron 主进程
│   ├── engine.mjs          # 桌面端提醒引擎
│   └── USER_GUIDE.md       # 桌面端用户手册
└── README.md
```

## 安装依赖

### 根目录依赖

```bash
npm install
```

### 桌面端依赖

```bash
cd desktop
npm install
```

如果你在国内网络环境下安装 Electron 依赖较慢，建议先切镜像后再装。

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

## Web 站点

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
```

## 命令行提醒脚本

这部分适合“不需要前端界面，只要自动运行提醒”的场景。

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
node scripts/alerts-worker.mjs --once
node scripts/alerts-worker.mjs --once --dry-run
```

### 5. 脚本依赖的环境变量

`scripts/alerts-worker.mjs` 主要依赖：

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

## 桌面端

当前推荐优先使用桌面端进行配置和验证。

### 1. 启动桌面端开发版

```bash
cd desktop
npm install
npm run dev
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
- `5` 个交易日内收盘价创历史新高

### 4. 打包 Windows 安装包

在 `desktop/` 目录执行：

```bash
npm run dist:win
```

注意：

- 在 Linux / WSL 下直接打 `nsis` 包通常需要 `wine`
- 如果你只是要一个可解压运行的 Windows 包，更推荐用 zip 方案

### 5. 打包 Windows Zip

```bash
npm run dist:win:zip
```

产物默认在：

- `desktop/dist/`

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

## 常用命令速查

### 根目录

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

### 桌面端目录

```bash
cd desktop
npm install
npm run dev
npm run dist:win
npm run dist:win:zip
npm run dist:win:zip:toF
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

如果报 `wine is required`，说明当前不能直接打 `nsis`。  
此时优先改用：

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
- 做提醒逻辑改动时，优先验证 `desktop/engine.mjs` 与 `scripts/alerts-worker.mjs`
- 推送 GitHub 前，避免把 `desktop/node_modules`、`desktop/dist` 一并提交

## 许可证

本项目使用 `AGPL-3.0` 许可证。

如果你修改、重新分发或将其部署为服务，请遵守 `LICENSE` 中的条款，并保留原始许可证与署名要求。
