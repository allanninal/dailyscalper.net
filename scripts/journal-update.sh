#!/usr/bin/env bash
#
# Hourly journal sync, run on this machine by launchd (net.dailyscalper.journal).
#
# Reads the live MT5 account from the VPS terminal, rebuilds the site and, only
# when a trade opened, closed or the balance moved, commits and pushes. The push
# is the deploy (legacy GitHub Pages builder). Floating P&L alone never commits.
#
# Install with:  scripts/install-schedule.sh
# Run by hand:   scripts/journal-update.sh
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

LOG_DIR="$REPO/.logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/journal.log"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG"; }

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

# The daily rankings run owns the tree while it works; this hour can wait for the next.
if alive "$LOG_DIR/update.pid"; then
  log "SKIP rankings update is running"
  exit 0
fi
if alive "$LOG_DIR/journal.pid"; then
  log "SKIP previous journal run still going (pid $(cat "$LOG_DIR/journal.pid"))"
  exit 0
fi
echo $$ >"$LOG_DIR/journal.pid"
trap 'rm -f "$LOG_DIR/journal.pid"' EXIT

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Same list as update.sh: build-site.mjs regenerates all of these.
GENERATED=(data index.html 404.html rankings methodology partners tools journal blog sitemap.xml llms.txt)

if ! git diff --quiet -- "${GENERATED[@]}"; then
  log "FAIL uncommitted changes in generated paths — resolve by hand first"
  exit 1
fi

git pull --rebase --quiet origin main 2>>"$LOG" || { log "FAIL git pull"; exit 1; }

if ! node scripts/fetch-journal.mjs >>"$LOG" 2>&1; then
  log "FAIL fetch-journal — VPS terminal unreachable, nothing overwritten"
  exit 1
fi

if ! node scripts/build-site.mjs >/dev/null 2>>"$LOG"; then
  log "FAIL build-site"
  exit 1
fi

# Unit tests check the stats and the generated pages; never publish a build that fails them.
if ! node --test test/unit/ >/dev/null 2>>"$LOG"; then
  log "FAIL unit tests — nothing committed (run: npm test)"
  exit 1
fi

git add "${GENERATED[@]}"

if git diff --staged --quiet; then
  log "OK no change"
  exit 0
fi

git commit --quiet -m "Journal: $(date -u '+%Y-%m-%d %H:%M') UTC"
if git push --quiet origin main 2>>"$LOG"; then
  log "OK pushed — Pages will rebuild"
else
  log "FAIL git push"
  exit 1
fi
