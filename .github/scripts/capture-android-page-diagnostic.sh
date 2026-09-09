#!/usr/bin/env bash
set -euo pipefail

VARIANT="${CAPTURE_PAGE_VARIANT:?CAPTURE_PAGE_VARIANT required}"
REP="${CAPTURE_REPLICATE:?CAPTURE_REPLICATE required}"
case "$VARIANT" in full|minimal) ;; *) echo "invalid variant $VARIANT" >&2; exit 2;; esac
OUT="android-native/build/page-diagnostic/${VARIANT}-${REP}"
APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.robys.coffeehouse.debug"
ACTIVITY="com.robys.coffeehouse.MainActivity"
SOURCE="android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java"
mkdir -p "$OUT"; rm -f "$OUT"/*

printf 'base_product_head=%s\npage_variant=%s\nreplicate=%s\nweb_source=%s\nweb_bytes_pinned_to_pr=%s\ngpu_backend=software\nscreenrecord=false\n' \
  "$(git rev-parse HEAD)" "$VARIANT" "$REP" "$([[ "$VARIANT" == full ]] && echo public-github-pages || echo inline-loadDataWithBaseURL)" "$([[ "$VARIANT" == full ]] && echo false || echo inline-in-apk)" > "$OUT/source-boundary.txt"
sha256sum "$SOURCE" > "$OUT/main-activity-sha256.txt"
git diff -- "$SOURCE" > "$OUT/main-activity-diff.patch"
sha256sum "$APK" > "$OUT/apk-sha256.txt"
date -u '+captured_at=%Y-%m-%dT%H:%M:%SZ' >> "$OUT/source-boundary.txt"

cleanup(){ local rc=$?; trap - EXIT; set +e; timeout 8s adb logcat -d > "$OUT/logcat.txt"; grep RobysHandoff "$OUT/logcat.txt" > "$OUT/handoff-states.txt"; timeout 8s adb shell dumpsys gfxinfo "$PACKAGE" framestats > "$OUT/gfxinfo-framestats.txt"; timeout 8s adb shell dumpsys webviewupdate > "$OUT/webview-provider.txt"; printf 'script_exit=%s\n' "$rc" > "$OUT/script-exit.txt"; exit "$rc"; }
trap cleanup EXIT

adb install -r "$APK"
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
adb shell wm size > "$OUT/display-size.txt"
sleep 20
adb shell input keyevent HOME
sleep 1
adb shell am force-stop "$PACKAGE"
adb logcat -c
sleep 0.35
start_wall="$(date +%s%3N)"
adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"
sleep 0.45
adb exec-out screencap -p > "$OUT/native-brand-surface.png"
outcome=NO_TERMINAL_STATE
for ((i=0;i<30;i++)); do
  states="$(adb logcat -d -s RobysHandoff:D '*:S' 2>/dev/null || true)"
  if grep -q HANDOFF_COMPLETE <<<"$states"; then outcome=HANDOFF_COMPLETE; break; fi
  if grep -Eq 'VISUAL_STATE_TIMEOUT|LOAD_COMMIT_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR' <<<"$states"; then outcome="$(grep -Eo 'VISUAL_STATE_TIMEOUT|LOAD_COMMIT_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR' <<<"$states" | tail -n1)"; break; fi
  sleep 1
done
end_wall="$(date +%s%3N)"
adb exec-out screencap -p > "$OUT/post-terminal.png"
adb logcat -d > "$OUT/logcat.txt"
grep RobysHandoff "$OUT/logcat.txt" > "$OUT/handoff-states.txt" || true
adb shell dumpsys gfxinfo "$PACKAGE" framestats > "$OUT/gfxinfo-framestats.txt" || true
adb shell dumpsys webviewupdate > "$OUT/webview-provider.txt" || true

python3 - "$OUT/logcat.txt" "$OUT/summary.json" "$outcome" "$start_wall" "$end_wall" "$VARIANT" "$REP" <<'PY'
import json,re,sys
log,out,outcome,start,end,variant,rep=sys.argv[1:]
lines=open(log,errors='replace').read().splitlines(); states=[]; davey=[]; skips=[]
for line in lines:
 m=re.search(r'^(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d{3}).*RobysHandoff: ([A-Z_]+)',line)
 if m: states.append({'stamp':m.group(2),'state':m.group(3)})
 if 'HWUI' in line and 'Davey!' in line:
  kv={k:int(v) for k,v in re.findall(r'([A-Za-z]+)=([0-9]+)',line)}; row={'duration_ms':kv.get('duration'),'line':line}
  keys=['IssueDrawCommandsStart','CommandSubmissionCompleted','SwapBuffers','SwapBuffersCompleted']
  if all(k in kv for k in keys): row.update({'issue_to_command_submission_ms':(kv['CommandSubmissionCompleted']-kv['IssueDrawCommandsStart'])/1e6,'swap_to_complete_ms':(kv['SwapBuffersCompleted']-kv['SwapBuffers'])/1e6})
  davey.append(row)
 m=re.search(r'Choreographer: Skipped (\d+) frames!',line)
 if m: skips.append(int(m.group(1)))
d={'diagnostic_only':True,'release_certified':False,'variant':variant,'replicate':int(rep),'outcome':outcome,'driver_elapsed_ms':int(end)-int(start),'handoff_states':states,
   'max_davey_duration_ms':max((x.get('duration_ms') or 0 for x in davey),default=0),'max_issue_to_command_submission_ms':max((x.get('issue_to_command_submission_ms') or 0 for x in davey),default=0),'max_swap_to_complete_ms':max((x.get('swap_to_complete_ms') or 0 for x in davey),default=0),'max_skipped_frames':max(skips,default=0),'davey_frames':davey,
   'scope':'Fresh API36 software-GPU emulator, no screenrecord in either treatment. Full uses mutable public GitHub Pages; minimal uses inline loadDataWithBaseURL on the same trusted base URL. Native state-machine deadlines are unchanged. Diagnostic variant is not a release candidate.'}
open(out,'w').write(json.dumps(d,indent=2)+'\n'); print(json.dumps({k:d[k] for k in ['variant','replicate','outcome','driver_elapsed_ms','max_davey_duration_ms','max_issue_to_command_submission_ms','max_swap_to_complete_ms','max_skipped_frames']}))
PY

test -s "$OUT/logcat.txt"; test -s "$OUT/handoff-states.txt"; test -s "$OUT/summary.json"
