#!/usr/bin/env bash
# Khởi tạo git repo và remote lần đầu
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GIT_NAME="${GIT_COMMITTER_NAME:-CHD Developer}"
GIT_EMAIL="${GIT_COMMITTER_EMAIL:-developer@local}"

git_local() {
  git -c "user.name=$GIT_NAME" -c "user.email=$GIT_EMAIL" "$@"
}

load_env() {
  for f in "$ROOT/.env" "$ROOT/.env.local"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
    fi
  done
}

load_env || true

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

echo "[init] Xong. Tiếp theo:"
echo "  1. Tạo repo private trên GitHub (nếu chưa có)"
echo "  2. Điền GITHUB_TOKEN + GITHUB_REPO vào .env"
echo "  3. npm run sync:github        # đồng bộ một lần"
echo "  4. npm run sync:github:watch  # tự động mỗi 5 phút"
