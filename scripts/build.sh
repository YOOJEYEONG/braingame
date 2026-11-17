#!/usr/bin/env bash
# Reproducible static build: provisions Expo Exact at a pinned commit, Bun 1.4.2 and Rust,
# then runs Exact's own web export into brain-warmup/dist. Used locally and by Vercel.
set -euo pipefail

EXACT_COMMIT=de212e671a69f4fea18bed67d5b73b259ddf3061
BUN_VERSION=1.4.2
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$ROOT/exact/.git" ]; then
  git init -q "$ROOT/exact"
  git -C "$ROOT/exact" remote add origin https://github.com/expo/exact.git
fi
if [ "$(git -C "$ROOT/exact" rev-parse HEAD 2>/dev/null || true)" != "$EXACT_COMMIT" ]; then
  git -C "$ROOT/exact" fetch -q --depth 1 origin "$EXACT_COMMIT"
  git -C "$ROOT/exact" checkout -q --detach "$EXACT_COMMIT"
fi

if [ "$(bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  if [ ! -x "$HOME/.bun-$BUN_VERSION/bin/bun" ]; then
    curl -fsSL https://bun.sh/install | BUN_INSTALL="$HOME/.bun-$BUN_VERSION" bash -s "bun-v$BUN_VERSION" >/dev/null
  fi
  export PATH="$HOME/.bun-$BUN_VERSION/bin:$PATH"
fi

if ! command -v cargo >/dev/null 2>&1; then
  [ -f "$HOME/.cargo/env" ] || curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none >/dev/null
  . "$HOME/.cargo/env"
fi

(cd "$ROOT/exact" && bun install --frozen-lockfile)
cd "$ROOT/brain-warmup"
bun exact.mjs web-build --out dist
cp dist/shell.html dist/404.html
