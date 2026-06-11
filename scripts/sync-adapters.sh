#!/usr/bin/env bash
# 双仓适配器同步：本仓(simple-chat-hub-extension, __SCH) <-> 姊妹仓(ai-model-switcher, __AMS)
# 用法: scripts/sync-adapters.sh {check|pull|push}
#   check  normalize 后 diff，报告漂移与建议方向（一致退出 0，漂移退出 1）
#   pull   姊妹仓 -> 本仓（覆盖前先展示差异）
#   push   本仓 -> 姊妹仓（覆盖前先展示差异）
set -euo pipefail

SCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AMS_DIR="${AMS_DIR:-$HOME/projects/ai-model-switcher}"
FILES=(adapters-intl.js adapters-cn.js)

[ -d "$AMS_DIR/content" ] || { echo "找不到姊妹仓: $AMS_DIR (可用 AMS_DIR 环境变量覆盖)"; exit 2; }

# 统一注册表前缀与路径注释，使两仓副本可直接 diff
norm() {
  perl -pe 's/window\.__AMS/window.__NS/g; s/window\.__SCH/window.__NS/g;
            s/content\/adapters/X\/adapters/g; s/custom\/adapters/X\/adapters/g' "$1"
}

last_commit_ts() { git -C "$1" log -1 --format=%ct -- "$2" 2>/dev/null || echo 0; }

check() {
  local drift=0 f
  for f in "${FILES[@]}"; do
    local a="$SCH_DIR/src/extension/custom/$f" b="$AMS_DIR/content/$f"
    if ! diff -q <(norm "$a") <(norm "$b") >/dev/null 2>&1; then
      drift=1
      echo "== 漂移: $f =="
      diff -u <(norm "$b") <(norm "$a") | head -40 || true
      local ta tb
      ta=$(last_commit_ts "$SCH_DIR" "src/extension/custom/$f")
      tb=$(last_commit_ts "$AMS_DIR" "content/$f")
      if [ "$ta" -gt "$tb" ]; then
        echo "  -> 本仓提交较新，建议: $0 push"
      else
        echo "  -> 姊妹仓提交较新，建议: $0 pull"
      fi
    fi
  done
  if [ "$drift" -eq 0 ]; then echo "两仓适配器一致"; fi
  return "$drift"
}

pull() {
  check || true
  cp "$AMS_DIR"/content/adapters-{intl,cn}.js "$SCH_DIR/src/extension/custom/"
  perl -i -pe 's/window\.__AMS/window.__SCH/g; s/content\/adapters/custom\/adapters/g' \
    "$SCH_DIR"/src/extension/custom/adapters-{intl,cn}.js
  echo "已同步: 姊妹仓 -> 本仓"
}

push() {
  check || true
  cp "$SCH_DIR"/src/extension/custom/adapters-{intl,cn}.js "$AMS_DIR/content/"
  perl -i -pe 's/window\.__SCH/window.__AMS/g; s/custom\/adapters/content\/adapters/g' \
    "$AMS_DIR"/content/adapters-{intl,cn}.js
  echo "已同步: 本仓 -> 姊妹仓"
}

case "${1:-check}" in
  check) check ;;
  pull)  pull ;;
  push)  push ;;
  *) echo "用法: $0 {check|pull|push}"; exit 2 ;;
esac
