#!/usr/bin/env bash
# Runs Fae&Fable in dev mode on macOS/Linux: starts the NestJS API (port 4000)
# and the Next.js website (port 3000) together. Ctrl+C stops both.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "== Fae&Fable — starting dev (api + web) =="
echo

# --- Node.js / npm (node:sqlite needs Node 22.13+) ---
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (v22.13+) and wasn't found on PATH." >&2
  echo "Install it from https://nodejs.org/ and re-run this script." >&2
  exit 1
fi
if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "Node $(node --version) is too old: the API needs node:sqlite (Node 22.13+)." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required and normally ships with Node.js, but wasn't found on PATH." >&2
  exit 1
fi
echo "✓ Node $(node --version), npm $(npm --version)"

# --- pnpm (the API uses it; npm 11.2 crashes installing the Nest deps) ---
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm wasn't found — installing it..."
  npm install -g pnpm
fi
echo "✓ pnpm $(pnpm --version)"

# --- env files (first run only) ---
if [ ! -f api/.env ]; then
  sed "s/^JWT_SECRET=.*/JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")/" \
    api/.env.example > api/.env
  echo "Created api/.env — admin login is admin@example.com / change-me (edit api/.env to change)."
fi
[ -f web/.env.local ] || cp web/.env.example web/.env.local

# --- dependencies (first run only) ---
if [ ! -d api/node_modules ]; then
  echo
  echo "Installing api dependencies (first run only)..."
  (cd api && pnpm install)
fi
if [ ! -d web/node_modules ]; then
  echo
  echo "Installing web dependencies (first run only)..."
  (cd web && npm install)
fi

# Kill a process and all its descendants (nest/next spawn child servers that outlive their parent).
kill_tree() {
  local child
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping api and web..."
  kill_tree "${API_PID:-}" 2>/dev/null || true
  kill_tree "${WEB_PID:-}" 2>/dev/null || true
  exit 0
}
# Stop both servers when this script exits (Ctrl+C or either one crashing).
trap cleanup INT TERM EXIT

echo
echo "Launching — website: http://localhost:3000   admin: http://localhost:3000/admin   api: http://localhost:4000"
echo "Press Ctrl+C to stop everything."
echo

(cd api && pnpm start:dev 2>&1 | sed 's/^/[api] /') &
API_PID=$!
(cd web && npm run dev 2>&1 | sed 's/^/[web] /') &
WEB_PID=$!

# bash 3.2 (macOS default) has no "wait -n", so poll until either server exits
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 1; done
echo "A server stopped — shutting down the other." >&2
