#!/usr/bin/env bash
# Yuren Harness 多实例管理器
# 每个实例独立: 数据目录(~/.yuren-instances/<name>) + 会话/密钥仓(<数据目录>/dsh-home)
#              + 端口 + MCP 子进程,实例之间零共享、互不污染。
#
# 用法:
#   instance.sh start <name> [port]   启动实例(默认端口 3080;端口被占会拒绝启动)
#   instance.sh stop <name>           停止实例(连带其 dsh 与 MCP 子进程)
#   instance.sh list                  列出全部实例与运行状态
#   instance.sh log <name>            查看实例日志
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
INSTANCES_ROOT="${YUREN_INSTANCES_ROOT:-$HOME/.yuren-instances}"

cmd="${1:-}"
name="${2:-}"

instance_dir() { printf '%s/%s' "$INSTANCES_ROOT" "$1"; }

is_running() {
  local dir pid
  dir=$(instance_dir "$1")
  [ -f "$dir/instance.pid" ] || return 1
  pid=$(cat "$dir/instance.pid")
  kill -0 "$pid" 2>/dev/null
}

case "$cmd" in
  start)
    if [ -z "$name" ]; then echo "用法: instance.sh start <name> [port]" >&2; exit 1; fi
    port="${3:-3080}"
    dir=$(instance_dir "$name")
    if is_running "$name"; then
      echo "实例 $name 已在运行 (pid $(cat "$dir/instance.pid"), 端口 $(cat "$dir/instance.port" 2>/dev/null || echo '?'))"
      exit 0
    fi
    mkdir -p "$dir"
    if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE ":$port$"; then
      echo "拒绝启动: 端口 $port 已被占用" >&2
      exit 1
    fi
    cd "$HERE"
    YUREN_INSTANCE="$name" YUREN_PORT="$port" \
      setsid nohup node serve.js > "$dir/serve.log" 2>&1 < /dev/null &
    pid=$!
    echo "$pid" > "$dir/instance.pid"
    echo "$port" > "$dir/instance.port"
    sleep 1
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "启动失败,日志尾部:" >&2
      tail -10 "$dir/serve.log" >&2 || true
      rm -f "$dir/instance.pid" "$dir/instance.port"
      exit 1
    fi
    echo "实例 $name 启动中: pid $pid, 端口 $port, 数据 $dir"
    echo "日志: tail -f $dir/serve.log"
    ;;
  stop)
    if [ -z "$name" ]; then echo "用法: instance.sh stop <name>" >&2; exit 1; fi
    dir=$(instance_dir "$name")
    if ! is_running "$name"; then
      echo "实例 $name 未在运行"
      rm -f "$dir/instance.pid" "$dir/instance.port"
      exit 0
    fi
    pid=$(cat "$dir/instance.pid")
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$dir/instance.pid" "$dir/instance.port"
    echo "实例 $name 已停止"
    ;;
  list)
    if [ ! -d "$INSTANCES_ROOT" ]; then
      echo "还没有实例($INSTANCES_ROOT 不存在)"
      exit 0
    fi
    printf '%-16s %-8s %-8s %s\n' "实例" "状态" "端口" "数据目录"
    for d in "$INSTANCES_ROOT"/*/; do
      [ -d "$d" ] || continue
      n=$(basename "$d")
      if is_running "$n"; then st="运行中"; else st="已停止"; fi
      printf '%-16s %-8s %-8s %s\n' "$n" "$st" "$(cat "$d/instance.port" 2>/dev/null || echo '-')" "$d"
    done
    ;;
  log)
    if [ -z "$name" ]; then echo "用法: instance.sh log <name>" >&2; exit 1; fi
    dir=$(instance_dir "$name")
    [ -f "$dir/serve.log" ] || { echo "实例 $name 还没有日志" >&2; exit 1; }
    tail -f "$dir/serve.log"
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
