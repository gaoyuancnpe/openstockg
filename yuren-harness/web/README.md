# Yuren Harness · Web 形态部署指南(主形态)

> 一次部署、浏览器访问、团队共用。三种玩法按需选择:裸跑 → 进程托管 → nginx 前后端分离。

## 0. 前置

- Node.js ≥ 20、Python 3.10+(仅领域 MCP 需要;基础功能不需要 Python);
- 首次准备:`cd web && npm install`(国内可加 `--registry=https://registry.npmmirror.com`);
- 配置模型 API:首次打开网页按引导填写(支持 DeepSeek/GLM/Kimi/Z.ai/OpenAI/Anthropic 及任意兼容接口);
  或管理员预置——在已配好的机器跑 `python3 tools/export_provision.py`,把生成的
  `harness/provision/profile.yaml` 放到服务器 `~/.yuren-harness/provision/` 再启动。

## 1. 裸跑(最快)

```bash
cd web
node serve.js                       # 本机访问 http://127.0.0.1:3080/
YUREN_HOST=0.0.0.0 node serve.js    # 局域网访问 http://<服务器IP>:3080/
```

## 2. 进程托管(常驻)

**pm2**:

```bash
npm i -g pm2
cd web
YUREN_HOST=0.0.0.0 pm2 start serve.js --name yuren
pm2 save && pm2 startup
```

**systemd**(Linux):示例单元 `/etc/systemd/system/yuren.service`

```ini
[Unit]
Description=Yuren Harness
After=network.target
[Service]
User=deploy
WorkingDirectory=/opt/yuren-harness/web
Environment=YUREN_HOST=0.0.0.0
Environment=YUREN_PORT=3080
ExecStart=/usr/bin/node serve.js
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

**Windows 服务器**:用 nssm 把 `node serve.js` 注册为服务,或直接用桌面分支形态(见 desktop/README.md)。

## 3. nginx 前后端分离 + HTTPS(推荐公网/正式环境)

前端静态文件从 dsh 包里抽出,由 nginx 托管;/api 与事件流反代到 serve.js:

```nginx
server {
    listen 443 ssl;
    server_name  yuren.example.com;
    ssl_certificate     /etc/ssl/yuren.pem;
    ssl_certificate_key /etc/ssl/yuren.key;

    # 前端:抽出的静态文件(部署时执行一次抽取,见下方命令)
    root /opt/yuren-harness/web/frontend-dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }

    # 后端 API 与 SSE/WebSocket 事件流
    location /api/ {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket(/api/events.*)
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;                    # 长回答流式不中断
        proxy_buffering off;                         # SSE 实时性
    }
    location = /favicon.svg { proxy_pass http://127.0.0.1:3080; }
    location = /manifest.webmanifest { proxy_pass http://127.0.0.1:3080; }
    location /branding/ { proxy_pass http://127.0.0.1:3080; }   # 品牌插件脚本
}
```

前端抽取(一次,或每次升级 dsh 后重跑):

```bash
cd web
node -e "const fs=require('fs');fs.cpSync('node_modules/@deepseek-ai/dsh-web-frontend/dist','frontend-dist',{recursive:true})"
```

serve.js 侧配置(前端走 nginx、API 反代同域时):

```bash
YUREN_HOST=127.0.0.1 YUREN_PORT=3080 \
YUREN_TRUSTED_HOSTS=yuren.example.com \
pm2 start serve.js --name yuren
```

> `--trusted-host` 是 dsh 的 /api 浏览器信任域机制:前端与 API 同域(上面的方案)一般无需额外配置;
> 若前端真的部署在**另一个域名**下直连 API,必须把 API 的 host:port 加进 YUREN_TRUSTED_HOSTS。

## 4. 数据与备份

| 位置 | 内容 |
|---|---|
| `~/.yuren-harness/` | 项目数据(AGENTS.md、workspace 产出、技能副本、生成的补丁、provision) |
| `~/.dsh/` | 会话历史与密钥(DSH_HOME 可改) |

备份=拷这两个目录;换机恢复=原样放回。

## 5. 多用户边界(如实说明)

dsh 的会话/密钥按 DSH_HOME 全局共享:**一次部署 = 一个共享工作区**(适合同小组内网共用),
没有每用户账号隔离。要给不同小组独立实例,各起一个进程并配不同
`DSH_HOME` 与 `YUREN_DATA_DIR`(端口错开)。

## 6. 常见问题

| 现象 | 处理 |
|---|---|
| 网页能开但请求全部 Failed to fetch | 检查 YUREN_TRUSTED_HOSTS 是否漏了访问域名;看 serve 控制台报错 |
| 记忆 MCP 不可用 | web/ 下没装 @modelcontextprotocol/server-memory → npm install |
| 领域 MCP 起不来 | 服务器缺 python3/uv;或改用桌面分支(内嵌 Python 零依赖) |
| 改了 harness/brand 不生效 | 品牌脚本带内容指纹,刷新页面即可;补丁改动需重启 serve |
