#!/usr/bin/env bash
# Shared: load .env và resolve git author cho GitHub sync
set -euo pipefail

github_env_root() {
  cd "$(dirname "${BASH_SOURCE[1]}")/.." && pwd
}

github_load_env() {
  local root="$1"
  for f in "$root/.env" "$root/.env.local"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
      return 0
    fi
  done
  return 1
}

github_resolve_identity() {
  GIT_NAME="${GIT_COMMITTER_NAME:-}"
  GIT_EMAIL="${GIT_COMMITTER_EMAIL:-}"

  if [[ -z "$GIT_NAME" || -z "$GIT_EMAIL" ]]; then
    echo "[github-sync] Cảnh báo: thiếu GIT_COMMITTER_NAME hoặc GIT_COMMITTER_EMAIL trong .env" >&2
    echo "  → Vercel/GitHub có thể từ chối deploy nếu dùng email @local" >&2
    GIT_NAME="${GIT_NAME:-CHD Sync Bot}"
    GIT_EMAIL="${GIT_EMAIL:-chd-sync@local}"
  elif [[ "$GIT_EMAIL" == *@local ]]; then
    echo "[github-sync] Cảnh báo: GIT_COMMITTER_EMAIL không nên dùng @local — dùng email tài khoản GitHub" >&2
  fi

  export GIT_NAME GIT_EMAIL
}

github_git_local() {
  git -c "user.name=$GIT_NAME" -c "user.email=$GIT_EMAIL" "$@"
}
