#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -lt 20 ]; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
    nvm use 22 >/dev/null
  else
    echo '请先安装 Node.js 22，然后重新运行。' >&2
    exit 1
  fi
fi

if [ ! -d node_modules ]; then
  npm ci
fi
npm run dev -- --host 127.0.0.1
