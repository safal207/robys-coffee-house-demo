#!/usr/bin/env bash
set -euo pipefail

MODE="${CAPTURE_MODE:?CAPTURE_MODE required}"
REP="${CAPTURE_REPLICATE:?CAPTURE_REPLICATE required}"
case "$MODE" in record|no-record) ;; *) echo "invalid CAPTURE_MODE=$MODE" >&2; exit 2;; esac

OUT="android-native/build/render-diagnostic/${MODE}-${REP}"
APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.robys.coffeehouse.debug"
ACTIVITY="com.robys.coffeehouse.MainActivity"
DEVICE_VIDEO="/sdcard/robys-render-diagnostic.mp4"
mkdir -p "$OUT"
rm -f "$OUT"/*

git rev-parse HEAD > "$OUT/native-source.sha"
sha256sum "$APK" > "$OUT/apk-sha256.txt"
printf 'diagnostic_only=true\ncapture_mode=%s\nreplicate=%s\nweb_source=public-github-pages\nweb_url=https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff\nweb_bytes_pinned_to_pr=false\ngpu_backend=software\n' "$MODE" "$REP" > "$OUT/source-boundary.txt"
date -u '+captured_at=%Y-%m-%dT%H:%M:%SZ' >> "$OUT/source-boundary.txt"

cleanup() {
  local rc=$?
  trap - EXIT
  set +e
  timeout 8s adb logcat -d > "$OUT/logcat.txt"
  grep 'RobysHandoff' "$OUT/logcat.txt" > "$OUT/handoff-states.txt"
  timeout 8s adb shell dumpsys gfxinfo "$PACKAGE" framestats > "$OUT/gfxinfo-framestats.txt"
  timeout 8s adb shell dumpsys window windows > "$OUT/window-state.txt"
  timeout 8s adb shell dumpsys webviewupdate > "$OUT/webview-provider.txt"
  printf 'script_exit=%s\n' "$rc" > "$OUT/script-exit.txt"
  exit "$rc"
}
trap cleanup EXIT

adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
adb shell wm size > "$OUT/display-size.txt"
# Match release smoke: preserve cold WebView provider load, settle unrelated boot services.
sleep 20
adb shell input keyevent HOME
sleep 1
adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell rm -f "$DEVICE_VIDEO"

RECORDER_PID=""
if [[ "$MODE" == record ]]; then
  adb shell screenrecord --size 540x1200 --time-limit 40 --bit-rate 6000000 "$DEVICE_VIDEO" >"$OUT/screenrecord.log" 2>&1 &
  RECORDER_PID=$!
  sleep 0.35
else
  # Preserve the same pre-launch delay without starting encoder/capture work.
  sleep 0.35
fi

start_wall="$(date +%s%3N)"
adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"
sleep 0.45
adb exec-out screencap -p > "$OUT/native-brand-surface.png"

outcome="NO_TERMINAL_STATE"
for ((i=0;i<30;i++)); do
  states="$(adb logcat -d -s RobysHandoff:D '*:S' 2>/dev/null || true)"
  if grep -q 'HANDOFF_COMPLETE' <<<"$states"; then outcome="HANDOFF_COMPLETE"; break; fi
  if grep -Eq 'VISUAL_STATE_TIMEOUT|LOAD_COMMIT_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR' <<<"$states"; then
    outcome="$(grep -Eo 'VISUAL_STATE_TIMEOUT|LOAD_COMMIT_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR' <<<"$states" | tail -n1)"
    break
  fi
  sleep 1
done
end_wall="$(date +%s%3N)"
adb exec-out screencap -p > "$OUT/post-terminal.png"

if [[ -n "$RECORDER_PID" ]]; then
  # Keep release-smoke recording parameters; bounded termination after outcome avoids waiting for unrelated tail time.
  kill "$RECORDER_PID" 2>/dev/null || true
  wait "$RECORDER_PID" 2>/dev/null || true
  adb pull "$DEVICE_VIDEO" "$OUT/robys-render-diagnostic.mp4" >/dev/null 2>&1 || true
fi

adb logcat -d > "$OUT/logcat.txt"
grep 'RobysHandoff' "$OUT/logcat.txt" > "$OUT/handoff-states.txt" || true
adb shell dumpsys gfxinfo "$PACKAGE" framestats > "$OUT/gfxinfo-framestats.txt" || true
adb shell dumpsys webviewupdate > "$OUT/webview-provider.txt" || true

python3 - "$OUT/logcat.txt" "$OUT/summary.json" "$outcome" "$start_wall" "$end_wall" "$MODE" "$REP" <<'PY'
import json,re,sys
log,output,outcome,start,end,mode,rep=sys.argv[1:]
lines=open(log,errors='replace').read().splitlines()
app=[]
for line in lines:
    if 'RobysHandoff:' in line:
        m=re.search(r'^(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d{3}).*RobysHandoff: ([A-Z_]+)',line)
        if m: app.append({'stamp':m.group(2),'state':m.group(3),'line':line})
davey=[]
for line in lines:
    if 'HWUI' not in line or 'Davey!' not in line: continue
    kv={k:int(v) for k,v in re.findall(r'([A-Za-z]+)=([0-9]+)',line)}
    row={'line':line,'duration_ms':kv.get('duration')}
    keys=['FrameStartTime','DrawStart','IssueDrawCommandsStart','SwapBuffers','FrameCompleted','GpuCompleted','SwapBuffersCompleted','CommandSubmissionCompleted']
    if all(k in kv for k in keys):
        row.update({
          'frame_timestamp_total_ms':(kv['FrameCompleted']-kv['FrameStartTime'])/1e6,
          'pre_draw_ms':(kv['DrawStart']-kv['FrameStartTime'])/1e6,
          'draw_to_issue_ms':(kv['IssueDrawCommandsStart']-kv['DrawStart'])/1e6,
          'issue_to_command_submission_ms':(kv['CommandSubmissionCompleted']-kv['IssueDrawCommandsStart'])/1e6,
          'swap_to_complete_ms':(kv['SwapBuffersCompleted']-kv['SwapBuffers'])/1e6,
          'command_to_gpu_complete_ms':(kv['GpuCompleted']-kv['CommandSubmissionCompleted'])/1e6,
        })
    davey.append(row)
skips=[]
for line in lines:
    m=re.search(r'Choreographer: Skipped (\d+) frames!',line)
    if m: skips.append({'frames':int(m.group(1)),'line':line})
summary={
 'diagnostic_only':True,'release_certified':False,'mode':mode,'replicate':int(rep),'outcome':outcome,
 'driver_elapsed_ms':int(end)-int(start),'handoff_states':app,
 'max_davey_duration_ms':max((x.get('duration_ms') or 0 for x in davey),default=0),
 'max_issue_to_command_submission_ms':max((x.get('issue_to_command_submission_ms') or 0 for x in davey),default=0),
 'max_swap_to_complete_ms':max((x.get('swap_to_complete_ms') or 0 for x in davey),default=0),
 'max_skipped_frames':max((x['frames'] for x in skips),default=0),
 'davey_frames':davey,'skipped_frames':skips,
 'scope':'Fresh API36 software-GPU emulator. Same native SHA and mutable public web source. Difference under study is screenrecord process only; screenshots remain in both arms. No release threshold or product byte is changed.'
}
open(output,'w').write(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ['mode','replicate','outcome','driver_elapsed_ms','max_davey_duration_ms','max_issue_to_command_submission_ms','max_swap_to_complete_ms','max_skipped_frames']}))
PY

# Outcome is evidence, not this diagnostic job's pass/fail. Fail only if capture itself is malformed.
test -s "$OUT/logcat.txt"
test -s "$OUT/handoff-states.txt"
test -s "$OUT/summary.json"
