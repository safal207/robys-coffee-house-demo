#!/usr/bin/env bash
set -euo pipefail

OUT="android-native/build/visual-evidence"
APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.robys.coffeehouse.debug"
ACTIVITY="com.robys.coffeehouse.MainActivity"
DEVICE_VIDEO="/sdcard/robys-launch.mp4"

mkdir -p "$OUT"
rm -f "$OUT"/*

adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
adb logcat -c
adb shell am force-stop "$PACKAGE"
adb shell rm -f "$DEVICE_VIDEO"

# Record the real device surface in one persistent shell. Frame extraction is done
# after artifact download so CI does not depend on host ffmpeg availability.
adb shell screenrecord --time-limit 12 --bit-rate 6000000 "$DEVICE_VIDEO" >"$OUT/screenrecord.log" 2>&1 &
RECORDER_PID=$!
sleep 0.35
adb shell am start -n "$PACKAGE/$ACTIVITY"

sleep 12.2
wait "$RECORDER_PID" || true
adb pull "$DEVICE_VIDEO" "$OUT/robys-launch.mp4"
adb shell dumpsys window windows > "$OUT/window-state.txt"
adb logcat -d > "$OUT/logcat.txt"

VIDEO_BYTES="$(wc -c < "$OUT/robys-launch.mp4")"
test "$VIDEO_BYTES" -gt 50000

printf 'video_bytes=%s\n' "$VIDEO_BYTES" > "$OUT/evidence-summary.txt"
printf 'package=%s\nactivity=%s\n' "$PACKAGE" "$ACTIVITY" >> "$OUT/evidence-summary.txt"
