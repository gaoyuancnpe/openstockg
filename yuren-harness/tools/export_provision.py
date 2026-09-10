#!/usr/bin/env python3
"""把本机已配好的模型提供方导出为预置文件,供整包部署。

管理员(已配好 Key 的机器)运行:
    python3 tools/export_provision.py
产物 harness/provision/profile.yaml 含已配置的提供方、默认模型与密钥明文。
部署时把它放到目标机/服务器的 <数据目录>/provision/profile.yaml
(默认 ~/.yuren-harness/provision/),serve.js 首次启动自动导入:
使用者不再看到"配置模型 API"弹窗,开箱即用。

规则与边界:
  - 只在目标侧没有任何 llm-pi-ai 提供方时导入;用户自己配过则不动。
  - 导入只补缺失的凭证项,不覆盖已有值。
  - 安全:该文件是密钥明文!仅经可信渠道分发;导入完成后可删除。

文本级解析 ~/.dsh 的 settings.yaml / .credentials.yaml,不依赖 PyYAML。
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "harness", "provision", "profile.yaml")

SETTINGS_BLOCK_KEYS = ("llm-pi-ai", "agent-default-model")
TOP_KEY = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):")


def top_level_blocks(text):
    blocks, cur, name = {}, None, None
    for line in text.splitlines():
        m = TOP_KEY.match(line)
        if m:
            name, cur = m.group(1), [line]
            blocks[name] = cur
        elif cur is not None:
            cur.append(line)
    return blocks


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def main():
    home = os.environ.get("DSH_HOME") or os.path.join(os.path.expanduser("~"), ".dsh")
    settings_text = read(os.path.join(home, "settings.yaml"))
    creds_text = read(os.path.join(home, ".credentials.yaml"))
    blocks = top_level_blocks(settings_text)

    if "llm-pi-ai" not in blocks:
        print(f"本机 {home}/settings.yaml 没有 llm-pi-ai 提供方配置,请先在界面里配好再导出。")
        return 1

    prov_text = "\n".join(blocks["llm-pi-ai"])
    refs = re.findall(r"apiKeyEnv:\s*[\"']?([A-Za-z0-9_]+)[\"']?", prov_text)
    if "agent-default-model" in blocks and re.search(r"provider:\s*[\"']?deepseek-official",
                                                      "\n".join(blocks["agent-default-model"])):
        refs.append("DEEPSEEK_API_KEY")

    cred_lines = {}
    for m in re.finditer(r"^\s{2,}([A-Za-z0-9_]+):\s*(\S+)\s*$", creds_text, re.M):
        cred_lines[m.group(1)] = m.group(2)
    picked, absent = {}, []
    for r in dict.fromkeys(refs):
        if r in cred_lines:
            picked[r] = cred_lines[r]
        else:
            absent.append(r)
    if not picked:
        print("没有找到已存储的凭证,无法导出。")
        return 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    parts = [
        "# Yuren Harness 预置配置(由 export_provision.py 生成,请勿手工编辑)",
        "# 目标机首启自动导入;含密钥明文,仅经可信渠道分发。",
        "--- settings ---",
    ]
    for k in SETTINGS_BLOCK_KEYS:
        if k in blocks:
            parts.extend(blocks[k])
    parts.append("--- credentials ---")
    for k, v in picked.items():
        if not re.fullmatch(r"[A-Za-z0-9._-]+", v):
            print(f"凭证 {k} 含特殊字符,请人工检查后写入 {OUT}")
            return 1
        parts.append(f"{k}: {v}")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(parts).rstrip("\n") + "\n")

    provs = re.findall(r"^\s{4}([a-z0-9-]+):\s*$", prov_text, re.M)
    print(f"已生成: {OUT}")
    print(f"提供方: {', '.join(provs) or '(未解析出)'};凭证: {', '.join(picked)}")
    if absent:
        print(f"注意: 这些被引用的凭证未存储,导入后仍不可用: {', '.join(absent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
