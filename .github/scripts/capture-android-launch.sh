#!/usr/bin/env bash
set -euo pipefail

OUT="android-native/build/visual-evidence"
APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.robys.coffeehouse.debug"
ACTIVITY="com.robys.coffeehouse.MainActivity"
DEVICE_VIDEO="/sdcard/robys-atomic-handoff.mp4"

mkdir -p "$OUT"
rm -f "$OUT"/*

adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1

sleep 20
adb shell input keyevent HOME
sleep 1
adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell rm -f "$DEVICE_VIDEO"

adb shell screenrecord --time-limit 18 --bit-rate 6000000 "$DEVICE_VIDEO" >"$OUT/screenrecord.log" 2>&1 &
RECORDER_PID=$!
sleep 0.35
adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"

sleep 0.45
adb exec-out screencap -p > "$OUT/native-brand-surface.png"
sleep 5
adb exec-out screencap -p > "$OUT/post-handoff.png"
sleep 12.8
wait "$RECORDER_PID" || true

adb pull "$DEVICE_VIDEO" "$OUT/robys-atomic-handoff.mp4"
adb shell dumpsys window windows > "$OUT/window-state.txt"
adb logcat -d > "$OUT/logcat.txt"
grep "RobysHandoff" "$OUT/logcat.txt" > "$OUT/handoff-states.txt" || true

VIDEO_BYTES="$(wc -c < "$OUT/robys-atomic-handoff.mp4")"
test "$VIDEO_BYTES" -gt 50000

grep -q "NATIVE_SURFACE" "$OUT/handoff-states.txt"
grep -q "WEB_COMMITTED" "$OUT/handoff-states.txt"
grep -Eq "WEB_READY|WEB_READY_TIMEOUT" "$OUT/handoff-states.txt"
grep -q "VISUAL_STATE_CONFIRMED" "$OUT/handoff-states.txt"
grep -q "HANDOFF_COMPLETE" "$OUT/handoff-states.txt"

printf 'video_bytes=%s\n' "$VIDEO_BYTES" > "$OUT/evidence-summary.txt"
printf 'package=%s\nactivity=%s\n' "$PACKAGE" "$ACTIVITY" >> "$OUT/evidence-summary.txt"
printf 'contract=SYSTEM_SPLASH->NATIVE_SURFACE->WEB_COMMITTED->WEB_READY_OR_FALLBACK->VISUAL_STATE_CONFIRMED->HANDOFF_COMPLETE\n' >> "$OUT/evidence-summary.txt"
