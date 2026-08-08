#!/usr/bin/env bash
set -euo pipefail

OUT="android-native/build/visual-evidence"
APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.robys.coffeehouse.debug"
ACTIVITY="com.robys.coffeehouse.MainActivity"
DEVICE_VIDEO="/sdcard/robys-atomic-handoff.mp4"
HANDOFF_WAIT_SECONDS=30

mkdir -p "$OUT"
rm -f "$OUT"/*

adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1

# A clean API 36 emulator may spend several seconds settling package/WebView
# services after install. Keep the same cold-start preparation used by the
# previous visual contract.
sleep 20
adb shell input keyevent HOME
sleep 1
adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell rm -f "$DEVICE_VIDEO"

# The first WebView provider load is deliberately cold and can vary widely on
# hosted runners. Record enough headroom for the real handoff state machine;
# assertions below are state-driven rather than tied to a fixed launch second.
adb shell screenrecord --time-limit 40 --bit-rate 6000000 "$DEVICE_VIDEO" >"$OUT/screenrecord.log" 2>&1 &
RECORDER_PID=$!
sleep 0.35
adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"

sleep 0.45
adb exec-out screencap -p > "$OUT/native-brand-surface.png"

handoff_complete=0
for ((second = 0; second < HANDOFF_WAIT_SECONDS; second += 1)); do
  if adb logcat -d -s RobysHandoff:D '*:S' 2>/dev/null | grep -q "HANDOFF_COMPLETE"; then
    handoff_complete=1
    break
  fi
  sleep 1
done

# Capture the visual state at the contract boundary. On timeout this screenshot
# still becomes useful failure evidence instead of silently sampling an arbitrary
# fixed second before a cold WebView has committed.
adb exec-out screencap -p > "$OUT/post-handoff.png"

wait "$RECORDER_PID" || true
adb pull "$DEVICE_VIDEO" "$OUT/robys-atomic-handoff.mp4"
adb shell dumpsys window windows > "$OUT/window-state.txt"
adb logcat -d > "$OUT/logcat.txt"
grep "RobysHandoff" "$OUT/logcat.txt" > "$OUT/handoff-states.txt" || true

VIDEO_BYTES="$(wc -c < "$OUT/robys-atomic-handoff.mp4")"
test "$VIDEO_BYTES" -gt 50000

if [[ "$handoff_complete" -ne 1 ]]; then
  echo "ANDROID-HANDOFF-002: HANDOFF_COMPLETE was not observed within ${HANDOFF_WAIT_SECONDS}s after activity start." >&2
  echo "Observed RobysHandoff states:" >&2
  cat "$OUT/handoff-states.txt" >&2
  grep -E "FATAL EXCEPTION|AndroidRuntime|MAIN_FRAME_ERROR|SSL_ERROR|LOAD_COMMIT" "$OUT/logcat.txt" | tail -n 80 >&2 || true
  exit 1
fi

grep -q "NATIVE_SURFACE" "$OUT/handoff-states.txt"
grep -q "WEB_COMMITTED" "$OUT/handoff-states.txt"
grep -Eq "WEB_READY|WEB_READY_TIMEOUT" "$OUT/handoff-states.txt"
grep -q "VISUAL_STATE_CONFIRMED" "$OUT/handoff-states.txt"
grep -q "HANDOFF_COMPLETE" "$OUT/handoff-states.txt"

printf 'video_bytes=%s\n' "$VIDEO_BYTES" > "$OUT/evidence-summary.txt"
printf 'package=%s\nactivity=%s\n' "$PACKAGE" "$ACTIVITY" >> "$OUT/evidence-summary.txt"
printf 'handoff_wait_seconds=%s\n' "$HANDOFF_WAIT_SECONDS" >> "$OUT/evidence-summary.txt"
printf 'contract=SYSTEM_SPLASH->NATIVE_SURFACE->WEB_COMMITTED->WEB_READY_OR_FALLBACK->VISUAL_STATE_CONFIRMED->HANDOFF_COMPLETE\n' >> "$OUT/evidence-summary.txt"
