#!/usr/bin/env sh
set -eu

cd /app

if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null || true)" ]; then
  echo "Installing web dependencies into mounted node_modules volume..."
  corepack enable
  pnpm install --frozen-lockfile
fi

exec "$@"
