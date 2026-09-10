# /// script
# requires-python = ">=3.10"
# dependencies = ["fastmcp==3.4.7"]
# ///
"""领域 MCP Server 编写骨架(Yuren Harness)
启动方式(补丁模板中的 mcp-mydomain 行):
    python3 -m uv run /abs/path/example_server.py
依赖经 PEP 723 内联声明,uv 自动备环境;也可用系统 python 直接跑(需 pip install fastmcp==3.4.7)。
注意: 3.5+ 的 fastmcp 拆掉了 server 支持,锁定 3.4.7。
做领域产品时:复制本文件,替换 DB 与工具语义;经验数据务必用实际数据校准。
"""
from fastmcp import FastMCP

mcp = FastMCP("mydomain")

# 经验/参数库:按"对象 × 路径"组织;keys=触发关键词(比子串匹配宽容)。
DB = [
    {
        "otype": "示例对象A",
        "path": "示例路径",
        "keys": ["对象A", "A类"],
        "condition": "适用条件写清楚,别让模型猜",
        "params": "推荐参数/流程",
        "expected": "预期结果与波动因素",
        "tests": ["必要检验项1", "必要检验项2"],
    },
]


def _match(entry: dict, query: str) -> bool:
    return any(k in query for k in entry.get("keys", [])) or entry["otype"] in query or query in entry["otype"]


@mcp.tool
def recommend(otype: str, path: str) -> dict:
    """按对象与路径查询推荐参数。命中返回参数与检验项;未命中返回 found=False,
    此时必须向用户追问更多信息,不得自行编造。"""
    hits = [r for r in DB if _match(r, otype) and r["path"] == path]
    if not hits:
        hits = [r for r in DB if _match(r, otype)]
    if not hits:
        return {"found": False, "note": "经验库无匹配条目。请补充信息并检索外部资料,标注置信度。"}
    return {"found": True, "matches": hits,
            "disclaimer": "示例骨架数据,投产前须以实际数据校准"}


@mcp.tool
def list_supported() -> dict:
    """列出经验库当前覆盖的对象与路径组合,供路由判断。"""
    return {"entries": [{"otype": r["otype"], "path": r["path"]} for r in DB], "count": len(DB)}


if __name__ == "__main__":
    mcp.run()
