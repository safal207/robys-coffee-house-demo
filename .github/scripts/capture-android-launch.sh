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

# Keep this recording process and its PID in one shell. The previous inline Action
# executed each script line separately, producing a truncated recording.
adb shell screenrecord --time-limit 8 --bit-rate 6000000 "$DEVICE_VIDEO" >"$OUT/screenrecord.log" 2>&1 &
RECORDER_PID=$!
sleep 0.35
adb shell am start -n "$PACKAGE/$ACTIVITY"

# Give the recording its full capture window, then collect deterministic evidence.
sleep 8.2
wait "$RECORDER_PID" || true
adb pull "$DEVICE_VIDEO" "$OUT/robys-launch.mp4"
adb shell dumpsys window windows > "$OUT/window-state.txt"
adb logcat -d > "$OUT/logcat.txt"

command -v ffmpeg >/dev/null
# screenrecord begins ~350ms before activity launch; these timestamps intentionally
# sample the system handoff, custom animation stages, final brand state and loaded app.
ffmpeg -hide_banner -loglevel error -y -ss 0.70 -i "$OUT/robys-launch.mp4" -frames:v 1 "$OUT/01-handoff.png"
ffmpeg -hide_banner -loglevel error -y -ss 1.05 -i "$OUT/robys-launch.mp4" -frames:v 1 "$OUT/02-bean-cup.png"
ffmpeg -hide_banner -loglevel error -y -ss 1.45 -i "$OUT/robys-launch.mp4" -frames:v 1 "$OUT/03-cup-steam.png"
ffmpeg -hide_banner -loglevel error -y -ss 1.95 -i "$OUT/robys-launch.mp4" -frames:v 1 "$OUT/04-brand.png"
ffmpeg -hide_banner -loglevel error -y -ss 4.50 -i "$OUT/robys-launch.mp4" -frames:v 1 "$OUT/05-app.png"

for file in \
  "$OUT/robys-launch.mp4" \
  "$OUT/01-handoff.png" \
  "$OUT/02-bean-cup.png" \
  "$OUT/03-cup-steam.png" \
  "$OUT/04-brand.png" \
  "$OUT/05-app.png"; do
  test -s "$file"
done

printf 'video_bytes=%s\n' "$(wc -c < "$OUT/robys-launch.mp4")" > "$OUT/evidence-summary.txt"
printf 'package=%s\nactivity=%s\n' "$PACKAGE" "$ACTIVITY" >> "$OUT/evidence-summary.txt"
