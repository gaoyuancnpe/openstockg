#!/usr/bin/env python3
"""构建桌面分支(Electron 自包含)所需 vendor(在 Windows 开发机上跑)。

产物(electron-app\\vendor\\):
  app-full/    完整 node_modules(剔除 electron 本体)——绕过 electron-builder
               按清单剪枝缺包的问题(afterPack 原样复制)
  assets/      只读运行资产: 品牌插件(harness/brand)/技能(harness/skills)/
               AGENTS.md/桌面补丁模板(harness/cordis.desktop.template.yml)/
               MCP 骨架(harness/mcp-servers)
  memory/      npm --prefix 安装的 @modelcontextprotocol/server-memory
               (运行时用应用自带 Electron-as-Node 拉起,目标机零依赖)
  python/      [可选 --with-python] 可迁移 CPython + fastmcp==3.4.7,
               领域有 Python 类 MCP 才需要;不构建则安装包体积小得多

用法:  python tools/make_vendor.py [--with-python]
"""
import argparse
import os
import pathlib
import platform
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EA = os.path.join(BASE, "desktop", "electron-app")
V = os.path.join(EA, "vendor")

PY_ROOT = os.environ.get("VENDOR_PYTHON_SOURCE") or (
    r"C:\Python314" if platform.system() == "Windows" else None)
PY_TRIM_DIRS = {"test", "tkinter", "idlelib", "ensurepip", "turtledemo", "pydoc_data"}


def sh(cmd, **kw):
    print("+", " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, check=True, **kw)


def build_app_full():
    dest = os.path.join(V, "app-full", "node_modules")
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)
    src = os.path.join(EA, "node_modules")
    total = 0
    for name in os.listdir(src):
        if name in ("electron", ".bin", ".package-lock.json"):
            continue
        shutil.copytree(os.path.join(src, name), os.path.join(dest, name),
                        ignore=shutil.ignore_patterns("__pycache__"))
        total += 1
    print(f"app-full: {total} 个顶层包")


def build_assets():
    dest = os.path.join(V, "assets")
    if os.path.exists(dest):
        shutil.rmtree(dest)
    brand_out = os.path.join(dest, "dsh", "brand")
    os.makedirs(os.path.join(brand_out, "lib"))
    for s, d in [("lib/index.js", "lib/index.js"), ("lib/client.js", "lib/client.js"),
                 ("favicon.svg", "favicon.svg"),
                 ("manifest.webmanifest", "manifest.webmanifest"),
                 ("package.json", "package.json")]:
        shutil.copy2(os.path.join(BASE, "harness", "brand", s.replace("/", os.sep)),
                     os.path.join(brand_out, d.replace("/", os.sep)))
    shutil.copytree(os.path.join(BASE, "harness", "skills"),
                    os.path.join(dest, "skills"), dirs_exist_ok=True)
    if os.path.isdir(os.path.join(BASE, "harness", "mcp-servers")):
        shutil.copytree(os.path.join(BASE, "harness", "mcp-servers"),
                        os.path.join(dest, "mcp-servers"), dirs_exist_ok=True)
    shutil.copy2(os.path.join(BASE, "AGENTS.md"), os.path.join(dest, "AGENTS.md"))
    tpl = os.path.join(BASE, "harness", "cordis.desktop.template.yml")
    if not os.path.exists(tpl):
        print("缺少 harness/cordis.desktop.template.yml")
        return False
    os.makedirs(os.path.join(dest, "dsh"), exist_ok=True)
    shutil.copy2(tpl, os.path.join(dest, "dsh", "cordis.desktop.template.yml"))
    print("assets: 完成")
    return True


def build_memory():
    dest = os.path.join(V, "memory")
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        print("未找到 npm,无法构建记忆 MCP vendor。")
        return False
    cmd = ["cmd", "/c", npm] if platform.system() == "Windows" else [npm]
    sh(cmd + ["install", "--prefix", dest,
              "--registry=https://registry.npmmirror.com",
              "@modelcontextprotocol/server-memory@2026.8.31"])
    entry = os.path.join(dest, "node_modules", "@modelcontextprotocol",
                         "server-memory", "dist", "index.js")
    ok = os.path.exists(entry)
    print("memory:", "入口就绪" if ok else "构建失败")
    return ok


def build_python():
    if not PY_ROOT or not os.path.exists(os.path.join(PY_ROOT, "python.exe")):
        print(f"找不到源 Python({PY_ROOT}),可用环境变量 VENDOR_PYTHON_SOURCE 指定。")
        return False
    dest = os.path.join(V, "python")
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)

    def skip_py(directory, contents):
        if os.path.basename(directory) == "Lib" and directory == os.path.join(PY_ROOT, "Lib"):
            return PY_TRIM_DIRS
        return []

    for item in ("python.exe", "DLLs", "Lib"):
        s = os.path.join(PY_ROOT, item)
        if os.path.exists(s):
            if os.path.isdir(s):
                shutil.copytree(s, os.path.join(dest, item), ignore=skip_py)
            else:
                shutil.copy2(s, os.path.join(dest, item))
    for f in os.listdir(PY_ROOT):
        if f.startswith("python3") and f.endswith(".dll"):
            shutil.copy2(os.path.join(PY_ROOT, f), os.path.join(dest, f))
        if f.lower().startswith("vcruntime"):
            shutil.copy2(os.path.join(PY_ROOT, f), os.path.join(dest, f))
    site = os.path.join(dest, "Lib", "site-packages")
    os.makedirs(site, exist_ok=True)
    sh([os.path.join(PY_ROOT, "python.exe"), "-m", "pip", "install", "--target", site,
        "-q", "--no-warn-script-location", "fastmcp==3.4.7"])
    for root, dirs, files in os.walk(dest):
        for d in list(dirs):
            if d == "__pycache__":
                shutil.rmtree(os.path.join(root, d), ignore_errors=True)
                dirs.remove(d)
    # 自检: 用 vendored python 直跑示例 MCP —— 判据认 gofastmcp.com 横幅且无
    # ImportError(错误文本里也含 "FastMCP" 字样,grep 它会假阳性,踩坑实录)
    example = os.path.join(BASE, "harness", "mcp-servers", "example_server.py")
    r = subprocess.run([os.path.join(dest, "python.exe"), example],
                       capture_output=True, text=True, timeout=90)
    out = r.stdout + r.stderr
    ok = "gofastmcp.com" in out and "ImportError" not in out
    print("python: 自检", "通过" if ok else f"失败 {out[:300]}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-python", action="store_true",
                    help="构建内嵌 Python(领域含 Python MCP 时才需要)")
    args = ap.parse_args()
    os.makedirs(V, exist_ok=True)
    build_app_full()
    if not build_assets():
        return 1
    oks = [build_memory()]
    if args.with_python:
        oks.append(build_python())
    for name, sub in [("app-full", "app-full"), ("assets", "assets"), ("memory", "memory")]:
        p = os.path.join(V, sub)
        if os.path.exists(p):
            size = sum(f.stat().st_size for f in pathlib.Path(p).rglob("*") if f.is_file())
            print(f"  {name}: {size/1e6:.0f} MB")
    return 0 if all(bool(x) for x in oks) else 1


if __name__ == "__main__":
    sys.exit(main())
