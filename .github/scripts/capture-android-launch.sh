#!/usr/bin/env bash
set -euo pipefail

OUT="android-native/build/visual-evidence"
APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.robys.coffeehouse.debug"
ACTIVITY="com.robys.coffeehouse.MainActivity"
DEVICE_VIDEO="/sdcard/robys-atomic-handoff.mp4"
HANDOFF_WAIT_SECONDS=30
WEB_PORT=4173
WEB_SERVER_PID=""

mkdir -p "$OUT"
rm -f "$OUT"/*

# Evidence binds the native APK and WebView bytes to the same exact checkout.
WEB_SOURCE_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$WEB_SOURCE_SHA" > "$OUT/native-source.sha"
sha256sum "$APK" > "$OUT/apk-sha256.txt"
printf 'web_source=exact-head-checkout\nweb_url=http://127.0.0.1:4173/?entry=android-handoff\nweb_bytes_pinned_to_pr=true\nweb_source_sha=%s\n' "$WEB_SOURCE_SHA" > "$OUT/source-boundary.txt"
date -u '+captured_at=%Y-%m-%dT%H:%M:%SZ' >> "$OUT/source-boundary.txt"

# Keep useful diagnostics on failure/cancellation, without turning either into
# a successful handoff. Bounded cleanup must not block runner cancellation.
collect_diagnostics() {
  local result=$?
  trap - EXIT
  set +e
  timeout 6s adb logcat -d > "$OUT/logcat.txt"
  grep "RobysHandoff" "$OUT/logcat.txt" > "$OUT/handoff-states.txt"
  timeout 6s adb shell dumpsys window windows > "$OUT/window-state.txt"
  timeout 6s adb shell dumpsys webviewupdate > "$OUT/webview-provider.txt"
  adb reverse --remove "tcp:$WEB_PORT" >/dev/null 2>&1 || true
  if [[ -n "$WEB_SERVER_PID" ]]; then
    kill "$WEB_SERVER_PID" >/dev/null 2>&1 || true
    wait "$WEB_SERVER_PID" 2>/dev/null || true
  fi
  printf 'exit_code=%s\n' "$result" > "$OUT/capture-exit.txt"
  exit "$result"
}
trap collect_diagnostics EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 >"$OUT/web-server.log" 2>&1 &
WEB_SERVER_PID=$!
web_ready=0
for attempt in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
    web_ready=1
    break
  fi
  /bin/sleep 0.05
done
if [[ "$web_ready" -ne 1 ]]; then
  echo "ANDROID-HANDOFF-002: exact-head web server did not become ready." >&2
  exit 1
fi
adb reverse "tcp:$WEB_PORT" "tcp:$WEB_PORT"

adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
adb shell wm size > "$OUT/display-size.txt"

# API 36 can still dispatch first-boot package receivers after boot_completed.
# Wait for that unrelated work before the single cold launch; never warm the app
# or provider, and fail closed if the device cannot settle. Product deadlines and
# HANDOFF_WAIT_SECONDS below are unchanged.
timeout 60s adb shell am wait-for-broadcast-idle --flush-broadcast-loopers > "$OUT/device-ready.txt"
adb shell input keyevent HOME
sleep 1
adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell rm -f "$DEVICE_VIDEO"

# A half-resolution recording reduces encoder contention on software-rendered
# CI. Screenshots remain full resolution; animations, deadlines and all state
# assertions are unchanged. This is handoff evidence, not a device FPS claim.
adb shell screenrecord --size 540x1200 --time-limit 40 --bit-rate 6000000 "$DEVICE_VIDEO" >"$OUT/screenrecord.log" 2>&1 &
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

adb exec-out screencap -p > "$OUT/post-handoff.png"

# A recorder can fail after writing a large partial file. Preserve its status
# while retrieving available evidence; file size alone must not turn it green.
recorder_exit=0
wait "$RECORDER_PID" || recorder_exit=$?
printf 'exit_code=%s\n' "$recorder_exit" > "$OUT/recorder-exit.txt"
pull_exit=0
adb pull "$DEVICE_VIDEO" "$OUT/robys-atomic-handoff.mp4" || pull_exit=$?
if [[ "$recorder_exit" -ne 0 ]]; then
  echo "ANDROID-HANDOFF-002: screen recording failed (exit ${recorder_exit}); partial evidence retained." >&2
  exit "$recorder_exit"
fi
if [[ "$pull_exit" -ne 0 ]]; then
  echo "ANDROID-HANDOFF-002: recording could not be retrieved (exit ${pull_exit})." >&2
  exit "$pull_exit"
fi
adb shell dumpsys window windows > "$OUT/window-state.txt"
adb logcat -d > "$OUT/logcat.txt"
grep "RobysHandoff" "$OUT/logcat.txt" > "$OUT/handoff-states.txt" || true

VIDEO_BYTES="$(wc -c < "$OUT/robys-atomic-handoff.mp4")"
test "$VIDEO_BYTES" -gt 50000

# This is a single cold-launch contract, not an eventual-recovery contract.
# The documented WEB_READY_TIMEOUT fallback remains allowed; terminal failures
# cannot be hidden by a later completion marker from another attempt.
if grep -Eq 'RobysHandoff.*: (LOAD_COMMIT_TIMEOUT|VISUAL_STATE_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR)$' "$OUT/handoff-states.txt"; then
  echo "ANDROID-HANDOFF-002: terminal launch failure observed; completion markers cannot override it." >&2
  cat "$OUT/handoff-states.txt" >&2
  exit 1
fi

if [[ "$handoff_complete" -ne 1 ]]; then
  echo "ANDROID-HANDOFF-002: HANDOFF_COMPLETE was not observed within ${HANDOFF_WAIT_SECONDS}s after activity start." >&2
  echo "Observed RobysHandoff states:" >&2
  cat "$OUT/handoff-states.txt" >&2
  grep -E "FATAL EXCEPTION|AndroidRuntime|MAIN_FRAME_ERROR|SSL_ERROR|LOAD_COMMIT" "$OUT/logcat.txt" | tail -n 80 >&2 || true
  exit 1
fi

first_state_line() {
  local pattern="$1"
  grep -nE "$pattern" "$OUT/handoff-states.txt" | head -n 1 | cut -d: -f1 || true
}

native_line="$(first_state_line 'RobysHandoff.*NATIVE_SURFACE')"
commit_line="$(first_state_line 'RobysHandoff.*WEB_COMMITTED')"
ready_line="$(first_state_line 'RobysHandoff.*WEB_READY(_TIMEOUT)?')"
visual_line="$(first_state_line 'RobysHandoff.*VISUAL_STATE_CONFIRMED')"
complete_line="$(first_state_line 'RobysHandoff.*HANDOFF_COMPLETE$')"

if [[ -z "$native_line" || -z "$commit_line" || -z "$ready_line" || -z "$visual_line" || -z "$complete_line" ]]; then
  echo "ANDROID-HANDOFF-002: required handoff state is missing." >&2
  cat "$OUT/handoff-states.txt" >&2
  exit 1
fi

if ! (( native_line < commit_line && commit_line < ready_line && ready_line < visual_line && visual_line < complete_line )); then
  echo "ANDROID-HANDOFF-002: handoff states occurred out of order." >&2
  printf 'NATIVE_SURFACE=%s WEB_COMMITTED=%s WEB_READY_OR_TIMEOUT=%s VISUAL_STATE_CONFIRMED=%s HANDOFF_COMPLETE=%s\n' \
    "$native_line" "$commit_line" "$ready_line" "$visual_line" "$complete_line" >&2
  cat "$OUT/handoff-states.txt" >&2
  exit 1
fi

printf 'video_bytes=%s\n' "$VIDEO_BYTES" > "$OUT/evidence-summary.txt"
printf 'package=%s\nactivity=%s\n' "$PACKAGE" "$ACTIVITY" >> "$OUT/evidence-summary.txt"
printf 'handoff_wait_seconds=%s\nrecording_size=540x1200\nscreenshot_size=native\n' "$HANDOFF_WAIT_SECONDS" >> "$OUT/evidence-summary.txt"
printf 'state_lines=NATIVE_SURFACE:%s,WEB_COMMITTED:%s,WEB_READY_OR_FALLBACK:%s,VISUAL_STATE_CONFIRMED:%s,HANDOFF_COMPLETE:%s\n' \
  "$native_line" "$commit_line" "$ready_line" "$visual_line" "$complete_line" >> "$OUT/evidence-summary.txt"
printf 'contract=SYSTEM_SPLASH->NATIVE_SURFACE->WEB_COMMITTED->WEB_READY_OR_FALLBACK->VISUAL_STATE_CONFIRMED->HANDOFF_COMPLETE\n' >> "$OUT/evidence-summary.txt"
