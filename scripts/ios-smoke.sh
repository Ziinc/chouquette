#!/usr/bin/env bash
# Installs the counter's simulator build, waits for its first frame, taps
# Increment where the host logged it (with idb) and waits for the count.
#
#   scripts/ios-smoke.sh <path/to/app> <bundle id> [OUT_DIR]
set -euo pipefail

app=${1:?usage: ios-smoke.sh <path/to/app> <bundle id> [out]}
bundle=${2:?usage: ios-smoke.sh <path/to/app> <bundle id> [out]}
out=$(mkdir -p "${3:-ios-smoke}" && cd "${3:-ios-smoke}" && pwd)
log=$out/app.log
exe=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")

device=$(xcrun simctl list devices available -j |
  jq -r '[.devices | to_entries[] | select(.key | test("iOS")) | .value[]
          | select(.name | startswith("iPhone"))][0].udid // empty')
[ -n "$device" ] || { echo "FAIL: no iPhone simulator is available"; exit 1; }
xcrun simctl boot "$device" 2>/dev/null || true
xcrun simctl bootstatus "$device" -b >/dev/null
xcrun simctl install "$device" "$app"
since=$(date '+%Y-%m-%d %H:%M:%S')
sleep 1
xcrun simctl launch --terminate-running-process "$device" "$bundle"

sync_log() {
  xcrun simctl spawn "$device" log show --style compact --info --debug --start "$since" \
    --predicate "process == \"$exe\"" >"$log" 2>&1 || true
}
fail() {
  sync_log
  echo "FAIL: $*"
  xcrun simctl io "$device" screenshot "$out/failure.png" >/dev/null 2>&1 || true
  grep -E 'levain|chouquette|counter' "$log" | tail -60 || true
  exit 1
}
wait_for() {
  local deadline=$((SECONDS + $2))
  while ((SECONDS < deadline)); do
    sync_log
    grep -Eq "$1" "$log" && return 0
    sleep 1
  done
  fail "no line matching /$1/ within $2 s"
}

wait_for 'levain: first frame' 120
wait_for 'counter: count=0' 60
wait_for 'levain: bounds Increment [0-9]+ [0-9]+' 60
at=$(grep -Eo 'levain: bounds Increment [0-9]+ [0-9]+' "$log" | tail -1 | cut -d' ' -f4-)
echo "tap Increment at $at"
# shellcheck disable=SC2086
idb ui tap --udid "$device" $at
wait_for 'counter: count=1' 30
xcrun simctl io "$device" screenshot "$out/tapped.png" >/dev/null
echo "PASS: the counter renders and counts on iOS"
