#!/usr/bin/env bash
#
# Daily rankings rebuild, run on this machine rather than in CI.
#
# GitHub Actions is unavailable while the account carries a billing lock, and
# publishing instead relies on the legacy GitHub Pages builder, which fires on
# every push to main. So this script's `git push` IS the deploy.
#
# Install with:  scripts/install-schedule.sh
# Run by hand:   scripts/update.sh
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

LOG_DIR="$REPO/.logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/update.log"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG"; }

# Only one run at a time. A slow broker fetch must not overlap the next tick.
exec 9>"$LOG_DIR/update.lock"
if ! flock -n 9 2>/dev/null; then
  # macOS ships no flock(1); fall back to a pid file.
  if [ -f "$LOG_DIR/update.pid" ] && kill -0 "$(cat "$LOG_DIR/update.pid")" 2>/dev/null; then
    log "SKIP another run is still going (pid $(cat "$LOG_DIR/update.pid"))"
    exit 0
  fi
fi
echo $$ >"$LOG_DIR/update.pid"
trap 'rm -f "$LOG_DIR/update.pid"' EXIT

# launchd starts with a minimal PATH that usually lacks node and git.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if ! command -v node >/dev/null; then
  log "FAIL node not on PATH"
  exit 1
fi

log "START $(node --version)"

# Refuse to build on top of unrelated local edits: this script commits whatever
# it finds in the paths below, and should only ever commit its own output.
if ! git diff --quiet -- data index.html 404.html rankings methodology partners sitemap.xml llms.txt; then
  log "FAIL uncommitted changes in generated paths — resolve by hand first"
  exit 1
fi

git pull --rebase --quiet origin main 2>>"$LOG" || { log "FAIL git pull"; exit 1; }

if ! node scripts/fetch-rankings.mjs >>"$LOG" 2>&1; then
  log "FAIL fetch-rankings — both broker sources unavailable, nothing overwritten"
  exit 1
fi

if ! node scripts/build-site.mjs >>"$LOG" 2>&1; then
  log "FAIL build-site"
  exit 1
fi

git add data index.html 404.html rankings methodology partners sitemap.xml llms.txt

if git diff --staged --quiet; then
  log "OK no changes this run"
  exit 0
fi

git commit --quiet -m "Rankings: $(date -u +%Y-%m-%d)"
if git push --quiet origin main 2>>"$LOG"; then
  log "OK pushed — Pages will rebuild"
else
  log "FAIL git push (check SSH key access from a non-interactive shell)"
  exit 1
fi
