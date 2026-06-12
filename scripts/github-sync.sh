#!/usr/bin/env bash
# Đồng bộ một lần: add → commit (nếu có thay đổi) → push lên GitHub
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=github-env.sh
source "$ROOT/scripts/github-env.sh"
github_load_env "$ROOT" || true
github_resolve_identity

git_local() {
  github_git_local "$@"
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
    local authed="${url/https:\/\/github.com\//https://x-access-token:${GITHUB_TOKEN}@github.com/}"
    if ! git_local push "$authed" "HEAD:${branch}" 2>&1; then
      echo "[github-sync] LỖI push — thường do token thiếu quyền ghi repo." >&2
      echo "  → GitHub → Settings → Developer settings → Fine-grained token" >&2
      echo "  → Repository access: chọn CHD-management-webapp-5" >&2
      echo "  → Permissions: Contents = Read and write" >&2
      echo "  → Sửa GITHUB_TOKEN trong .env (nano .env) rồi chạy lại." >&2
      exit 1
    fi
  else
    git_local push -u origin "$branch"
  fi
}

ensure_repo
ensure_remote

BRANCH="${GITHUB_BRANCH:-main}"
git_local checkout -B "$BRANCH" 2>/dev/null || git_local checkout "$BRANCH"

echo "[github-sync] Commit author: $GIT_NAME <$GIT_EMAIL>"

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
