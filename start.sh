#!/usr/bin/env bash
# Linux launcher; also used by start.command on macOS.
set -u

cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Не найден Node.js. Установите Node.js 24+ вместе с npm и повторите запуск.' >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  printf '%s\n' 'Для запуска нужен Node.js 24 или новее.' >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'Не найден npm. Установите npm вместе с Node.js и повторите запуск.' >&2
  exit 1
fi

# npm start owns dependency installation, the server and graceful shutdown.
exec npm start
