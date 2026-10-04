#!/usr/bin/env bash
# NMRPeakQuery 离线版启动脚本（macOS / Linux）
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] 未检测到 Node.js，请先安装 Node.js 18+：https://nodejs.org" >&2
  exit 1
fi

exec node serve.mjs "$@"