#!/usr/bin/env bash
# Một lần cấu hình: lưu CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID vào GitHub Secrets
# Chạy trên máy có `gh` đã login: bash scripts/setup-cloudflare-secrets.sh

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Cần cài GitHub CLI (gh) và đăng nhập: gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Chưa đăng nhập GitHub CLI. Chạy: gh auth login"
  exit 1
fi

echo "=== Cấu hình deploy Cloudflare (chỉ cần làm 1 lần) ==="
echo ""
echo "Lấy token: Cloudflare Dashboard → My Profile → API Tokens → Edit Cloudflare Workers"
echo "Lấy Account ID: Workers & Pages → cột phải (Account ID)"
echo ""

read -rsp "Cloudflare API Token: " CF_TOKEN
echo ""
read -rp "Cloudflare Account ID: " CF_ACCOUNT
echo ""

if [[ -z "$CF_TOKEN" || -z "$CF_ACCOUNT" ]]; then
  echo "Token và Account ID không được để trống."
  exit 1
fi

gh secret set CLOUDFLARE_API_TOKEN --body "$CF_TOKEN"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CF_ACCOUNT"

echo ""
echo "Đã lưu secrets. Push lên main sẽ tự deploy."
echo "Chạy thử ngay: gh workflow run cloudflare-deploy.yml"
