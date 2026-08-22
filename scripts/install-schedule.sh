#!/usr/bin/env bash
#
# Installs the daily rankings rebuild as a launchd agent on this Mac.
# Idempotent: re-running replaces the existing schedule.
#
#   scripts/install-schedule.sh          # install / reinstall
#   scripts/install-schedule.sh remove   # uninstall
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="net.dailyscalper.rankings"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

if [ "${1:-}" = "remove" ]; then
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed $LABEL"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$REPO/.logs"

cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/update.sh</string>
  </array>

  <key>WorkingDirectory</key><string>$REPO</string>

  <!-- 06:15 local, daily. The snapshot the daily board diffs against is written
       on each run, so skipping days simply widens the comparison window. -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>6</integer>
    <key>Minute</key><integer>15</integer>
  </dict>

  <!-- Laptop is often asleep at 06:15; run as soon as it wakes instead of
       silently skipping the day. -->
  <key>RunAtLoad</key><false/>

  <key>StandardOutPath</key><string>$REPO/.logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$REPO/.logs/launchd.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable "gui/$UID_NUM/$LABEL"

echo "Installed $LABEL — runs daily at 06:15."
echo "  Status:  launchctl print gui/$UID_NUM/$LABEL | head -20"
echo "  Run now: launchctl kickstart -p gui/$UID_NUM/$LABEL"
echo "  Logs:    tail -f $REPO/.logs/update.log"
echo "  Remove:  scripts/install-schedule.sh remove"
