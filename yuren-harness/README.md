# Yuren Harness

可定制的智能体工作台基础(基于 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) 运行时)。
**主形态是 Web 部署**:前后端一进程、浏览器访问、可 nginx 分离托管;Electron 桌面是可选分支。

```
harness/    与形态无关的核心资产
  brand/            品牌插件(标题/图标/侧栏/首启引导;改文案即换皮)
  cordis.template.yml        Web 形态补丁模板(记忆MCP/品牌/人设占位)
  cordis.desktop.template.yml 桌面分支补丁模板
  skills/           技能(启动器自动同步;含编写示例)
  mcp-servers/      领域 MCP 编写骨架(FastMCP+PEP723)
web/        ★主形态:node serve.js 一条命令起服务(含部署指南 README)
desktop/    ◐分支形态:Electron 自包含(单文件安装器,目标机零依赖)
tools/      export_provision(密钥预置导出) / make_vendor(桌面构建)
docs/       移植指南(用本底座做领域产品) / 踩坑与运维手册
AGENTS.md   工作守则模板 —— 智能体行为的源头,领域产品整体改写
```

## 快速开始(Web 主形态)

```bash
cd web
npm install --registry=https://registry.npmmirror.com   # 首次
node serve.js                                           # http://127.0.0.1:3080/
```

首次打开网页按引导配置任一模型 API(DeepSeek/GLM/Kimi/Z.ai/OpenAI/Anthropic 及任意
OpenAI/Anthropic 兼容接口,双协议可切);局域网/服务器部署见 `web/README.md`
(pm2/systemd/nginx+HTTPS/多实例/备份)。

## 用它做你的领域产品(15 分钟起一个壳)

见 `docs/移植指南.md`——改品牌文案与配色、改写 AGENTS.md 与人设、加领域 MCP 行、
写技能;web 与 desktop 两种交付随选。参考实作:盈宝选矿助手(选矿领域完整产品)。

## 设计原则

- **不魔改运行时**:对 dsh 零源码改动,一切定制走补丁模板 + 本地品牌插件 + 外围启动器,
  升级 dsh = 改一行版本号 + 全量回归;
- **零依赖交付**:桌面分支内嵌全部运行时(含可选 Python);Web 形态服务器只需 Node;
- **数据可迁移**:`~/.yuren-harness/`(项目数据)+ `~/.dsh/`(会话密钥),拷走即备份;
- **小白友好**:首启引导带各平台获取 Key 直达链接、报错人话化、密钥可由管理员预置。

dsh 版本锁定 `0.1.1-rc.2`(升级流程与全部已知坑见 `docs/踩坑与运维手册.md`)。
