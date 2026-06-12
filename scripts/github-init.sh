#!/usr/bin/env bash
# Khởi tạo git repo và remote lần đầu
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

if [[ ! -d .git ]]; then
  git_local init -b "${GITHUB_BRANCH:-main}"
  echo "[init] Đã tạo git repository."
fi

if ! git_local remote get-url origin &>/dev/null; then
  if [[ -n "${GITHUB_REPO:-}" ]]; then
    git_local remote add origin "$GITHUB_REPO"
    echo "[init] Đã thêm remote: $GITHUB_REPO"
  else
    echo "[init] Chưa có GITHUB_REPO trong .env."
    echo "       Tạo repo trên GitHub rồi thêm vào .env:"
    echo '       GITHUB_REPO="https://github.com/USER/chd-management-webapp-5.git"'
  fi
fi

echo "[init] Git author: $GIT_NAME <$GIT_EMAIL>"
echo "[init] Xong. Tiếp theo:"
echo "  1. Tạo repo private trên GitHub (nếu chưa có)"
echo "  2. Điền GITHUB_TOKEN + GITHUB_REPO + GIT_COMMITTER_* vào .env"
echo "  3. npm run sync:github        # đồng bộ một lần"
echo "  4. npm run sync:github:watch  # tự động mỗi 5 phút"
