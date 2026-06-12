#!/usr/bin/env bash
# Đồng bộ một lần: add → commit (nếu có thay đổi) → push lên GitHub
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
  return 1
}

GIT_NAME="${GIT_COMMITTER_NAME:-CHD Sync Bot}"
GIT_EMAIL="${GIT_COMMITTER_EMAIL:-chd-sync@local}"

git_local() {
  git -c "user.name=$GIT_NAME" -c "user.email=$GIT_EMAIL" "$@"
}

ensure_repo() {
  if [[ ! -d .git ]]; then
    echo "Chưa có git repo. Chạy: npm run sync:github:init"
    exit 1
  fi
}

ensure_remote() {
  if git_local remote get-url origin &>/dev/null; then
    return 0
  fi
  if [[ -z "${GITHUB_REPO:-}" ]]; then
    echo "Chưa có remote origin. Đặt GITHUB_REPO trong .env hoặc chạy:"
    echo "  git remote add origin https://github.com/USER/chd-management-webapp-5.git"
    exit 1
  fi
  git_local remote add origin "$GITHUB_REPO"
}

push_with_token() {
  local branch="${GITHUB_BRANCH:-main}"
  local url
  url="$(git_local remote get-url origin)"

  if [[ -n "${GITHUB_TOKEN:-}" && "$url" == https://github.com/* ]]; then
    local authed="${url/https:\/\/github.com\//https://${GITHUB_TOKEN}@github.com/}"
    git_local push "$authed" "HEAD:${branch}"
  else
    git_local push -u origin "$branch"
  fi
}

load_env || true
ensure_repo
ensure_remote

BRANCH="${GITHUB_BRANCH:-main}"
git_local checkout -B "$BRANCH" 2>/dev/null || git_local checkout "$BRANCH"

git_local add -A

if git_local diff --cached --quiet; then
  echo "[github-sync] Không có thay đổi — bỏ qua commit."
else
  MSG="chore: auto-sync $(date '+%Y-%m-%d %H:%M:%S %z')"
  git_local commit -m "$MSG"
  echo "[github-sync] Đã commit: $MSG"
fi

push_with_token
echo "[github-sync] Đã push lên GitHub ($BRANCH)."
