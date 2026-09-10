# Yuren Harness · 桌面分支(Electron)

> **这是分支形态,不是主产品形态。** 主形态是 Web 部署(见 `web/README.md`)。
> 只在"目标机不能/不便跑常驻服务、要单机免安装、或目标机不允许装 Node"时选用本分支。

## 形态对比

| | Web 主形态 | 桌面分支 |
|---|---|---|
| 部署 | 服务器一次部署,浏览器访问 | 每台机器装一次(单文件安装器,零依赖) |
| 升级 | 服务器更新即全员生效 | 逐台重装 |
| 多人 | 一个共享工作区(进程级) | 单机单用户 |
| 目标机要求 | 服务器:Node ≥ 20 | 无(内嵌全部运行时;含 Python MCP 时也不需要装 Python) |

## 构建(Windows 开发机)

在资源管理器双击仓库根的 `构建桌面版.bat`(不要从 Git Bash 跑中文 bat,GBK 编码会错乱)。
它完成:npm install → `tools/make_vendor.py`(app-full/assets/memory;含 Python MCP 的产品加 `--with-python`)→ electron-builder(dir + nsis)。

产物:
- `desktop/electron-app/dist/win-unpacked/` —— 绿色文件夹,整目录拷走即用;
- `desktop/electron-app/dist/YurenHarness-Setup.exe` —— 单文件一键安装器。

## 运行时行为(与主形态同源)

- 数据目录:`%USERPROFILE%\yuren-harness\`(AGENTS.md 副本、workspace、技能、生成的补丁、provision);
  会话与密钥在 `~/.dsh\`。刻意不放"文档"(Windows Defender 受控文件夹访问默认保护 Documents,
  未签名程序写入会被系统性拦截——实测教训)。
- 记忆 MCP 由本 exe 以 Electron-as-Node 直跑;后端以 `--expose-internals` 启动(缺了启动即崩,界面报 Failed to fetch);
- 正常退出零残留进程;后端意外退出自动重启(≤2 次)。
- 密钥预置:`tools/export_provision.py` 的产物放到 `%USERPROFILE%\yuren-harness\provision\profile.yaml`,首启自动导入。
- 烟雾测试:`set YUREN_SMOKE=1` 后运行 exe,自动校验后端 RPC 后退出。

## 已知边界

- SmartScreen"已保护你的电脑"需点"仍要运行"(无代码签名,仅安装时一次);
- 打包必须走 `hooks.js`(afterPack)原样复制 vendor——electron-builder 的 extraResources
  对含 node_modules 的目录会静默剪枝,不可用;
- 本分支构建产物体积:基础约 550MB(安装器约 260MB);`--with-python` 再增约 380MB。
