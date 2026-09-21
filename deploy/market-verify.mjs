#!/usr/bin/env node
/* market 子站本地验签服务(nginx auth_request 目标)
 *
 * 生态约定:子站只验签不签发(私钥仅认证中心持有)。本服务读取父域 Cookie
 * `yuren_sso` 中的 RS256 JWT,用认证中心公钥本地验签 + 校验 exp,
 * 200 放行 / 401 拒绝。仅监听 127.0.0.1,由 nginx internal location 反代。
 *
 * 环境变量:
 *   VERIFY_PORT=8108                     监听端口(仅 127.0.0.1)
 *   SSO_COOKIE_NAME=yuren_sso            JWT Cookie 名(与认证中心 config.py 一致)
 *   SSO_PUBLIC_KEY_FILE=<必填>           当前公钥 PEM 路径
 *   SSO_PREVIOUS_PUBLIC_KEY_FILE=<可选>  轮换窗口旧公钥,验签失败时按序重试
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.VERIFY_PORT || 8108);
const COOKIE_NAME = process.env.SSO_COOKIE_NAME || "yuren_sso";

const keyFiles = [process.env.SSO_PUBLIC_KEY_FILE, process.env.SSO_PREVIOUS_PUBLIC_KEY_FILE]
  .filter((file) => file);
if (keyFiles.length === 0) {
  console.error("[market-verify] 缺少 SSO_PUBLIC_KEY_FILE 环境变量");
  process.exit(1);
}
const keys = keyFiles.map((file) => createPublicKey(readFileSync(file, "utf8")));
console.log(`[market-verify] 公钥就绪:${keyFiles.join(", ")}`);

function verifyJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [headB64, payloadB64, sigB64] = parts;
  let header;
  try {
    header = JSON.parse(Buffer.from(headB64, "base64url"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const signed = Buffer.from(`${headB64}.${payloadB64}`);
  const signature = Buffer.from(sigB64, "base64url");
  const signatureOk = keys.some((key) => {
    try {
      return cryptoVerify("RSA-SHA256", signed, key, signature);
    } catch {
      return false;
    }
  });
  if (!signatureOk) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url"));
  } catch {
    return null;
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
  return claims;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (!req.url.startsWith("/verify")) {
    res.writeHead(404).end();
    return;
  }
  const claims = verifyJwt(readCookie(req, COOKIE_NAME));
  if (!claims) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end('{"ok":false}');
    return;
  }
  res.writeHead(200, {
    "content-type": "application/json",
    "x-auth-uid": String(claims.sub || claims.uid || "")
  });
  res.end('{"ok":true}');
});

server.listen(PORT, HOST, () => {
  console.log(`[market-verify] 就绪:http://${HOST}:${PORT}/verify`);
});
