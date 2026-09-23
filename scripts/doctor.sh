#!/bin/sh
set -u

failed=0
for tool in vp docker node pnpm; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'OK   %s: %s\n' "$tool" "$(command -v "$tool")"
  else
    printf 'FAIL %s: command not found\n' "$tool"
    failed=1
  fi
done

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    echo 'OK   Docker Compose is available'
  else
    echo 'FAIL Docker Compose is unavailable; install/update Docker'
    failed=1
  fi
fi

if [ -f .env ]; then
  echo 'OK   .env exists'
else
  echo 'FAIL .env is missing; run cp .env.example .env'
  failed=1
fi

if [ ! -f node_modules/tsx/dist/loader.mjs ]; then
  echo 'FAIL dependencies are missing; run vp install'
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

exec node --import tsx scripts/doctor.ts
