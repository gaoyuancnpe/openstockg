# market 服务器部署手册

目标形态:`https://market.<主域名>` —— Yuren Harness 行情智能体实例,
SSO 父域 Cookie 本地验签后反代,与门户/认证中心同机或同域族部署。

```
浏览器 ── https://market.<主域名>
              │ nginx(443,auth_request → 本地验签 127.0.0.1:8108)
              │         未登录 302 → auth.<主域名>/login?next=…
              ▼
        127.0.0.1:3080  yuren-market.service(node serve.js)
              ├─ dsh web(补丁:权限锁死 + openstock MCP + memory MCP)
              └─ 数据 ~/.yuren-instances/market(实例完全隔离)
```

## 0. 前置

- 服务器:Node ≥ 20,nginx,已按主仓 `deploy/scripts/server-init.sh` 初始化(yuren 用户 / /srv/yuren)
- 主仓(yurenweb)的认证中心已在 `auth.<主域名>` 运行,父域 Cookie `.主域名` 生效
- DNS:`market.<主域名>` A 记录指向服务器

## 1. 代码就位

```bash
# 方式 A:仓库推送后直接克隆(推荐;本地 11 个提交先推上去)
sudo -u yuren git clone <仓库地址> /srv/yuren/market

# 方式 B:从 WSL rsync(符号链接需解引用 -L)
rsync -aL --exclude .git --exclude desktop/node_modules --exclude yuren-harness/web/node_modules \
  /home/gaoyuan/projects/yuren-markets/ yuren@<服务器>:/srv/yuren/market/
```

安装依赖(两处:harness 运行时 + desktop 引擎的 nodemailer 通知依赖):

```bash
cd /srv/yuren/market/yuren-harness/web && sudo -u yuren npm install --registry=https://registry.npmmirror.com
cd /srv/yuren/market/desktop           && sudo -u yuren npm install --omit=dev --registry=https://registry.npmmirror.com
```

注意:本地开发用 `web/node_modules` 符号链接共享依赖,服务器上必须真实安装。

## 2. 公钥提取(验签服务)

```bash
# 从主仓 sso-client 提取当前公钥(单行转回 PEM)
node -e '
  const src = require("fs").readFileSync("/srv/yuren/yurenweb/packages/sso-client/src/keys.ts","utf8");
  const m = src.match(/SSO_PUBLIC_KEY_PEM[^=]*=\s*`([\s\S]*?)`/);
  require("fs").writeFileSync("/srv/yuren/market/sso-public.pem", m[1].replace(/\\n/g,"\n"));
'
sudo chown yuren:yuren /srv/yuren/market/sso-public.pem
```

公钥轮换时:重新提取覆盖该文件,`systemctl restart yuren-market-verify`。

## 3. 密钥预置(可选,免首启网页配置)

```bash
sudo -u yuren mkdir -p ~/.yuren-instances/market/provision
sudo -u yuren tee ~/.yuren-instances/market/provision/profile.yaml << 'EOF'
--- settings ---
--- credentials ---
FMP_API_KEY: <fmp key>
GLM_CODING_API_KEY: <glm key>
EOF
chmod 600 ~/.yuren-instances/market/provision/profile.yaml
```

serve.js 启动时幂等导入到实例 dsh-home(只补不覆盖)。未预置则首次打开页面走引导配置。
注意 FMP Key 也可后续在资产区「设置」页签填。

## 4. systemd 服务

```bash
# 渲染占位域名(同主仓 render-nginx.sh 的约定)
sed -i "s/PLACEHOLDER_DOMAIN/<主域名>/g" \
  /srv/yuren/market/deploy/systemd/yuren-market*.service \
  /srv/yuren/market/deploy/nginx-market.conf

sudo cp /srv/yuren/market/deploy/systemd/yuren-market*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yuren-market-verify yuren-market
curl -s http://127.0.0.1:8108/verify -o /dev/null -w "验签服务 %{http_code}\n"   # 期望 401(无 Cookie)
curl -s http://127.0.0.1:3080/ -o /dev/null -w "market 实例 %{http_code}\n"       # 期望 200
```

## 5. nginx + 证书

```bash
sudo cp /srv/yuren/market/deploy/nginx-market.conf /etc/nginx/sites-available/yuren-market.conf
# 证书未签发前:先删掉 #YR_SSL_BEGIN..#YR_SSL_END 段,只留 80 + ACME
sudo ln -s /etc/nginx/sites-available/yuren-market.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d market.<主域名>          # 签发后补回 SSL 段再 reload
```

验证:浏览器无登录态访问 `https://market.<主域名>` → 302 到认证中心登录页;
登录后(父域 Cookie 自动携带)进入 market。

## 6. 门户暗门指向

portal 侧环境变量(部署或 nuxt.config 运行时注入):

```
NUXT_PUBLIC_MARKET_URL=https://market.<主域名>
```

暗门触发方式不变(#market 锚点 / 键盘序列)。

## 7. 运维备忘

- 日志:`journalctl -u yuren-market -f`;实例运行日志 `~/.yuren-instances/market/serve.log`
- 数据备份:整目录 `~/.yuren-instances/market`(配置/规则/会话)+ `/srv/yuren/market/sso-public.pem`
- 调度:资产区「运行」页签启停,随 systemd 服务常驻
- 安全基线:两个服务均只监听 127.0.0.1;对外唯一入口是带验权的 nginx;
  会话权限已锁死为工作区读写(danger-full-access 已从预设表移除,环境变量旁路无效)
- 多实例:再起一个智能体 = 新 systemd 单元(YUREN_INSTANCE=<name> + 新端口 + 新 vhost)
