#!/usr/bin/env bash
# Vòng lặp đồng bộ tự động theo GITHUB_SYNC_INTERVAL (mặc định 300 giây)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

load_env() {
  for f in "$ROOT/.env" "$ROOT/.env.local"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
      return 0
    fi
  done
}

load_env || true
INTERVAL="${GITHUB_SYNC_INTERVAL:-300}"

echo "[github-auto-sync] Bắt đầu — mỗi ${INTERVAL}s (Ctrl+C để dừng)"
while true; do
  if bash "$ROOT/scripts/github-sync.sh"; then
    echo "[github-auto-sync] OK — chờ ${INTERVAL}s..."
  else
    echo "[github-auto-sync] Lỗi — thử lại sau ${INTERVAL}s..." >&2
  fi
  sleep "$INTERVAL"
done
