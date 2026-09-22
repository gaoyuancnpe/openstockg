# market 服务器部署手册(暗门直连版:裸 IP + 端口 + 令牌,无域名/无证书/无 SSO)

```
自己人 ── http://<服务器IP>:<MARKET_PORT>/<MARKET_TOKEN>
             │ nginx:令牌校验 → 302 种 HttpOnly Cookie → 后续凭 Cookie 放行
             │ 令牌外一切访问 → 404(端口扫描只见 404)
             ▼
       127.0.0.1:3080  yuren-market.service(node serve.js)
             ├─ dsh web(补丁:权限锁死 + openstock MCP + memory MCP)
             └─ 数据 /srv/yuren/market-data(实例完全隔离)
```

为什么不用域名:省掉 DNS、证书签发与续期、SSO 父域 Cookie 三件事。
代价:HTTP 明文(令牌/会话凭据理论上可被链路嗅探,自用权衡;后续要加密可补
自签 TLS 或切回域名模式,git 历史里保留了域名版 nginx conf 可回溯)。

令牌纪律:真实令牌只允许出现在两处——服务器上的 nginx conf(root/deploy 可读)
和私有仓库 yurenweb 的门户暗门常量;本仓库公开,只有占位符。

## 0. 前置

- 服务器:Node ≥ 20、nginx(主仓 server-init.sh 已初始化过即可)
- 安全组/防火墙:放行 <MARKET_PORT>(建议仅限自己人出口 IP,能加则加)

## 1. 代码就位

```bash
sudo -u yuren git clone https://github.com/gaoyuancnpe/openstockg /srv/yuren/market
cd /srv/yuren/market/yuren-harness/web && sudo -u yuren npm install --registry=https://registry.npmmirror.com
cd /srv/yuren/market/desktop           && sudo -u yuren npm install --omit=dev --registry=https://registry.npmmirror.com
```

## 2. 渲染真实值并起服务

```bash
MARKET_TOKEN=<门户暗门里正在用的令牌,或 openssl rand -hex 16 新生成>
SERVER_IP=$(curl -s ifconfig.me)        # 或直接写公网 IP
MARKET_PORT=39876

sudo sed -i "s/<MARKET_TOKEN>/$MARKET_TOKEN/g; s/<SERVER_IP>/$SERVER_IP/g; s/<MARKET_PORT>/$MARKET_PORT/g" \
  /srv/yuren/market/deploy/nginx-market-ip.conf \
  /srv/yuren/market/deploy/systemd/yuren-market.service

sudo cp /srv/yuren/market/deploy/systemd/yuren-market.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now yuren-market
curl -s http://127.0.0.1:3080/ -o /dev/null -w "market 实例 %{http_code}\n"   # 期望 200
```

## 3. nginx

```bash
sudo cp /srv/yuren/market/deploy/nginx-market-ip.conf /etc/nginx/sites-available/yuren-market.conf
sudo ln -sf /etc/nginx/sites-available/yuren-market.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 验证:无令牌 404;带令牌 302 种 Cookie 后进入
curl -s -o /dev/null -w "无令牌 %{http_code}\n" http://$SERVER_IP:$MARKET_PORT/
curl -s -o /dev/null -w "带令牌 %{http_code}(期望 302)\n" http://$SERVER_IP:$MARKET_PORT/$MARKET_TOKEN
```

## 4. 密钥(可选,免首启网页配置)

```bash
sudo -u yuren mkdir -p /srv/yuren/market-data/provision
sudo -u yuren tee /srv/yuren/market-data/provision/profile.yaml << 'EOF'
--- settings ---
--- credentials ---
FMP_API_KEY: <fmp key>
GLM_CODING_API_KEY: <glm key>
EOF
chmod 600 ~/.yuren-instances/market/provision/profile.yaml
sudo systemctl restart yuren-market
```

FMP Key 也可部署后在资产区「设置」页签直接填。

## 5. 门户暗门指向(私有仓库 yurenweb)

暗门常量在 `apps/portal/plugins/market-door.client.ts` 的 TARGET_B64:

```bash
echo -n "http://<服务器IP>:<MARKET_PORT>/<MARKET_TOKEN>" | base64 -w0
# 替换常量后提交推送,CI 自动重新部署门户
```

## 6. 运维备忘

- 日志:`journalctl -u yuren-market -f`(systemd 模式下 stdout 全进 journal;`serve.log` 仅本地 instance.sh 模式产生)
- 备份:整目录 `/srv/yuren/market-data`(配置/规则/会话/密钥全在里面)
- **令牌轮换**:`openssl rand -hex 16` → 同步改服务器 conf(nginx -s reload)与门户常量(重新部署门户)→ 浏览器清 Cookie 或重新走令牌 URL
- 调度:资产区「运行」页签启停,随 systemd 常驻
- 多实例:新 systemd 单元(YUREN_INSTANCE=<name> + 新端口 + 新 vhost)
