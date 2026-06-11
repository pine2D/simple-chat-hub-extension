#!/usr/bin/env bash
# 双仓适配器同步：本仓(simple-chat-hub-extension, __SCH) <-> 姊妹仓(ai-model-switcher, __AMS)
# 用法: scripts/sync-adapters.sh {check|pull|push}
#   check  normalize 后 diff，报告漂移与建议方向（一致退出 0，漂移退出 1）
#   pull   姊妹仓 -> 本仓（覆盖前先展示差异）
#   push   本仓 -> 姊妹仓（覆盖前先展示差异）
set -euo pipefail

SCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AMS_DIR="${AMS_DIR:-${HOME}/projects/ai-model-switcher}"
FILES=(adapters-intl.js adapters-cn.js)

[ -d "${AMS_DIR}/content" ] || { echo "找不到姊妹仓: ${AMS_DIR} (可用 AMS_DIR 环境变量覆盖)"; exit 2; }

# 统一注册表前缀与路径注释，使两仓副本可直接 diff
norm() {
  perl -pe 's/window\.__AMS/window.__NS/g; s/window\.__SCH/window.__NS/g;
            s/content\/adapters/X\/adapters/g; s/custom\/adapters/X\/adapters/g' "$1"
}

# 修复 1：对未提交文件 git log 输出空串时改用 echo "${ts:-0}" 兜底
last_commit_ts() {
  local ts
  ts=$(git -C "$1" log -1 --format=%ct -- "$2" 2>/dev/null) || ts=0
  echo "${ts:-0}"
}

check() {
  local drift=0 f
  for f in "${FILES[@]}"; do
    local a="${SCH_DIR}/src/extension/custom/${f}"
    local b="${AMS_DIR}/content/${f}"
    # 修复 3：文件缺失直接报错退出，不计入漂移
    if [ ! -f "${a}" ]; then
      echo "缺失文件: ${a}"
      exit 2
    fi
    if [ ! -f "${b}" ]; then
      echo "缺失文件: ${b}"
      exit 2
    fi
    if ! diff -q <(norm "${a}") <(norm "${b}") >/dev/null 2>&1; then
      drift=1
      echo "== 漂移: ${f} =="
      diff -u <(norm "${b}") <(norm "${a}") | head -40 || true
      local ta tb
      ta=$(last_commit_ts "${SCH_DIR}" "src/extension/custom/${f}")
      tb=$(last_commit_ts "${AMS_DIR}" "content/${f}")
      if [ "${ta}" -gt "${tb}" ]; then
        echo "  -> 本仓提交较新，建议: $0 push"
      else
        echo "  -> 姊妹仓提交较新，建议: $0 pull"
      fi
    fi
  done
  if [ "${drift}" -eq 0 ]; then echo "两仓适配器一致"; fi
  return "${drift}"
}

# 修复 2：pull 前检查本仓目标文件脏工作区
pull() {
  local f sch_files=()
  for f in "${FILES[@]}"; do
    sch_files+=("src/extension/custom/${f}")
  done
  local dirty
  dirty=$(git -C "${SCH_DIR}" status --porcelain -- "${sch_files[@]}")
  if [ -n "${dirty}" ]; then
    echo "警告: 本仓以下文件有未提交改动，拒绝覆盖，请先提交或手动处理:"
    echo "${dirty}"
    exit 3
  fi
  check || true
  # 修复 5：复用 FILES 数组逐文件操作，消除硬编码花括号展开
  for f in "${FILES[@]}"; do
    cp "${AMS_DIR}/content/${f}" "${SCH_DIR}/src/extension/custom/${f}"
    perl -i -pe 's/window\.__AMS/window.__SCH/g; s/content\/adapters/custom\/adapters/g' \
      "${SCH_DIR}/src/extension/custom/${f}"
  done
  echo "已同步: 姊妹仓 -> 本仓"
}

# 修复 2：push 前检查姊妹仓目标文件脏工作区
push() {
  local f ams_files=()
  for f in "${FILES[@]}"; do
    ams_files+=("content/${f}")
  done
  local dirty
  dirty=$(git -C "${AMS_DIR}" status --porcelain -- "${ams_files[@]}")
  if [ -n "${dirty}" ]; then
    echo "警告: 姊妹仓以下文件有未提交改动，拒绝覆盖，请先提交或手动处理:"
    echo "${dirty}"
    exit 3
  fi
  check || true
  # 修复 5：复用 FILES 数组逐文件操作，消除硬编码花括号展开
  for f in "${FILES[@]}"; do
    cp "${SCH_DIR}/src/extension/custom/${f}" "${AMS_DIR}/content/${f}"
    perl -i -pe 's/window\.__SCH/window.__AMS/g; s/custom\/adapters/content\/adapters/g' \
      "${AMS_DIR}/content/${f}"
  done
  echo "已同步: 本仓 -> 姊妹仓"
}

case "${1:-check}" in
  check) check ;;
  pull)  pull ;;
  push)  push ;;
  *) echo "用法: $0 {check|pull|push}"; exit 2 ;;
esac
