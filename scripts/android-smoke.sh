#!/usr/bin/env bash
# Installs the counter's APK on a running emulator, waits for its first
# frame, taps Increment where the host logged it and waits for the count.
#
#   scripts/android-smoke.sh counter.apk [OUT_DIR]
set -euo pipefail

APK=$1
OUT=${2:-android-smoke}
PKG=${PKG:-com.example.counter}
mkdir -p "$OUT"
ADB_BIN=$(command -v adb)
adb() { timeout 90 "$ADB_BIN" "$@"; }

timeout 300 "$ADB_BIN" wait-for-device
adb shell settings put global hide_error_dialogs 1 || true
adb install -r -g "$APK"
adb shell am wait-for-broadcast-idle || sleep 5
adb logcat -c
"$ADB_BIN" logcat >"$OUT/logcat.txt" 2>&1 &
logcat=$!
trap 'adb exec-out screencap -p >"$OUT/final.png" || true; kill "$logcat" 2>/dev/null || true' EXIT
adb shell am start -n "$PKG/.MainActivity"

wait_for() {
  local deadline=$((SECONDS + $2))
  while ((SECONDS < deadline)); do
    grep -Eq "$1" "$OUT/logcat.txt" && return 0
    sleep 1
  done
  echo "FAIL: no logcat line matching /$1/ within $2 s"
  exit 1
}

wait_for 'levain: app at' 120
wait_for 'levain: first frame' 120
wait_for 'counter: count=0' 60
wait_for 'levain: bounds Increment [0-9]+ [0-9]+' 60
at=$(grep -Eo 'levain: bounds Increment [0-9]+ [0-9]+' "$OUT/logcat.txt" | tail -1 | cut -d' ' -f4-)
echo "tap Increment at $at"
# shellcheck disable=SC2086
adb shell input tap $at
wait_for 'counter: count=1' 30
adb exec-out screencap -p >"$OUT/tapped.png"
echo "PASS: the counter renders and counts on Android"
