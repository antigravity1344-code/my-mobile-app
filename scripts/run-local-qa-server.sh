#!/usr/bin/env bash
# Start an isolated fake-SMS Paksho API for phone QA.
# Requires Node 24 (node:sqlite). Never reuse this key on an old database.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "Need Node 24+ with node:sqlite. Current: $(node --version 2>/dev/null || echo missing)" >&2
  exit 1
fi

QA_DIR="${PAKSHO_QA_DIR:-$PWD/.local-qa}"
mkdir -p "$QA_DIR/worker-docs"

export NODE_ENV="${NODE_ENV:-development}"
export PAKSHO_SMS_MODE="${PAKSHO_SMS_MODE:-fake}"
export PORT="${PORT:-3000}"
export PAKSHO_SQLITE_PATH="${PAKSHO_SQLITE_PATH:-$QA_DIR/paksho.sqlite}"
export PAKSHO_WORKER_DOC_DIR="${PAKSHO_WORKER_DOC_DIR:-$QA_DIR/worker-docs}"
export KAVENEGAR_API_KEY="${KAVENEGAR_API_KEY:-}"
export KAVENEGAR_OTP_TEMPLATE="${KAVENEGAR_OTP_TEMPLATE:-}"

if [[ -z "${PAKSHO_DATA_ENCRYPTION_KEY:-}" ]]; then
  PAKSHO_DATA_ENCRYPTION_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
  export PAKSHO_DATA_ENCRYPTION_KEY
  echo "Generated a disposable encryption key for $PAKSHO_SQLITE_PATH"
  echo "Keep this process env; do not commit it. A new key will not open an old DB."
fi

if [[ -z "${PAKSHO_ADMIN_PASSWORD:-}" ]]; then
  echo "Set PAKSHO_ADMIN_PASSWORD for admin login. Admin remains disabled without it." >&2
fi

if [[ "$NODE_ENV" == "production" ]]; then
  echo "Refuse to start this QA helper in production." >&2
  exit 1
fi

echo "Paksho QA API on 0.0.0.0:${PORT}"
echo "SQLite: $PAKSHO_SQLITE_PATH"
echo "SMS: $PAKSHO_SMS_MODE (OTP is not printed and not returned by the API)"
exec node server/index.js
