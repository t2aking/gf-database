#!/bin/sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  vite_plus_env="${XDG_CONFIG_HOME:-${HOME}/.config}/vite-plus/env"
  if [ ! -f "$vite_plus_env" ]; then
    echo "Node.js was not found. Install Vite+ or add Node.js to PATH." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$vite_plus_env"
fi

exec node --import tsx src/mcp/index.ts
