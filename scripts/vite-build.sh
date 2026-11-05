#!/usr/bin/env bash
set -euo pipefail

# Raise open-file limit on Linux CI (Cloudflare Workers Builds, GitHub Actions).
if command -v ulimit >/dev/null 2>&1; then
  ulimit -n 65536 2>/dev/null || ulimit -n 8192 2>/dev/null || true
fi

exec vite build "$@"
