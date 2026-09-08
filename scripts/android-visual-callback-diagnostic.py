#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import statistics
import sys
from pathlib import Path

BASE_DIAG_SHA = "fad4e6d42d45c581c7bbd041d4cee67e3f161b38"
WEB_SHA = "9e4e09d09affa28712b27bb6ca48961adc8cbca8"
MAIN = Path("android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java")
MAIN_BLOB = "1d52767c0a8447e831ec1f2f41f40991e5c8a244"
CAPTURE = Path(".github/scripts/capture-android-launch.sh")
CAPTURE_BLOB = "52222dbbee45bad86df5604bbc5acf5b3f5c1914"
OUT = Path(".artifacts/visual-callback-diag")
LABELS = ["01", "02", "03", "04"]


def blob(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def one(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError(f"expected exactly one match: {old[:120]!r}")
    return source.replace(old, new)


def apply_native() -> None:
    data = MAIN.read_bytes()
    if blob(data) != MAIN_BLOB:
        raise RuntimeError(f"unexpected diagnostic MainActivity blob: {blob(data)}")
    s = data.decode()
    s = one(s, "import android.view.Gravity;\n", "import android.view.Choreographer;\nimport android.view.Gravity;\n")
    s = one(s, '    private static final String HANDOFF_TAG = "RobysHandoff";\n', '    private static final String HANDOFF_TAG = "RobysHandoff";\n    private static final String HANDOFF_DIAG_TAG = "RobysHandoffDiag";\n')
    old = '''        visualStateRequested = true;
        bridgeReadyAtReveal = bridgeReady;
        cancelHandoffCallbacks();
        long requestId = SystemClock.uptimeMillis();
        view.postVisualStateCallback(requestId, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long ignoredRequestId) {
                completeHandoff(view, generation);
            }
        });
        visualStateTimeout = () -> {
            if (isActiveGeneration(generation) && !handoffComplete && visualStateRequested) {
                debugState("VISUAL_STATE_TIMEOUT");
                showLoadError(generation);
            }
        };
        mainHandler.postDelayed(visualStateTimeout, VISUAL_CALLBACK_TIMEOUT_MS);
'''
    new = '''        visualStateRequested = true;
        bridgeReadyAtReveal = bridgeReady;
        cancelHandoffCallbacks();
        long requestId = SystemClock.uptimeMillis();
        debugTiming("VISUAL_REQUEST", requestId);
        view.postVisualStateCallback(requestId, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long ignoredRequestId) {
                debugTiming("VISUAL_CALLBACK_ENTER", requestId);
                completeHandoff(view, generation);
            }
        });
        // Diagnostic-only liveness probes. They do not read layout or change handoff decisions.
        mainHandler.post(() -> debugTiming("UI_QUEUE_IMMEDIATE", requestId));
        mainHandler.postDelayed(() -> debugTiming("UI_QUEUE_500MS", requestId), 500L);
        mainHandler.postDelayed(() -> debugTiming("UI_QUEUE_1250MS", requestId), 1_250L);
        Choreographer.getInstance().postFrameCallback(
                frameTimeNanos -> debugTiming("CHOREOGRAPHER_FRAME", requestId)
        );
        visualStateTimeout = () -> {
            debugTiming("VISUAL_TIMEOUT_RUNNABLE_ENTER", requestId);
            if (isActiveGeneration(generation) && !handoffComplete && visualStateRequested) {
                debugState("VISUAL_STATE_TIMEOUT");
                showLoadError(generation);
            }
        };
        mainHandler.postDelayed(visualStateTimeout, VISUAL_CALLBACK_TIMEOUT_MS);
'''
    s = one(s, old, new)
    old = '''    private void debugState(String state) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            Log.d(HANDOFF_TAG, state);
        }
    }
'''
    new = '''    private void debugTiming(String event, long requestAt) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;
        long now = SystemClock.uptimeMillis();
        Log.d(HANDOFF_DIAG_TAG,
                event + " request_id=" + requestAt
                        + " elapsed_ms=" + (now - requestAt)
                        + " uptime_ms=" + now);
    }

    private void debugState(String state) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            Log.d(HANDOFF_TAG, state);
        }
    }
'''
    s = one(s, old, new)
    for required in (
        "VISUAL_CALLBACK_TIMEOUT_MS = 1_500L",
        "BRIDGE_READY_TIMEOUT_MS = 3_500L",
        "LOAD_COMMIT_HARD_TIMEOUT_MS = 24_000L",
    ):
        if required not in s:
            raise RuntimeError(f"production deadline missing: {required}")
    MAIN.write_text(s)
    print("visual callback diagnostic instrumentation applied")


def prepare_capture() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = CAPTURE.read_bytes()
    if blob(raw) != CAPTURE_BLOB:
        raise RuntimeError(f"unexpected capture contract blob: {blob(raw)}")
    s = raw.decode()
    s = one(
        s,
        "printf 'web_source=public-github-pages\\nweb_url=https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff\\nweb_bytes_pinned_to_pr=false\\n' > \"$OUT/source-boundary.txt\"",
        "printf 'web_source=pinned-git-archive\\nweb_url=%s\\nweb_bytes_pinned_to_pr=true\\nweb_commit=%s\\ndiag_label=%s\\n' \"$ROBYS_PINNED_WEB_URL\" \"$ROBYS_WEB_COMMIT\" \"$ROBYS_DIAG_LABEL\" > \"$OUT/source-boundary.txt\"",
    )
    s = one(
        s,
        'adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"',
        'adb shell am start -W -n "$PACKAGE/$ACTIVITY" --es robys.test.APP_URL "$ROBYS_PINNED_WEB_URL" > "$OUT/activity-start.txt"',
    )
    target = OUT / "capture-pinned.sh"
    target.write_text(s)
    target.chmod(0o755)
    wrapper = OUT / "run-case.sh"
    wrapper.write_text(r'''#!/usr/bin/env bash
set -uo pipefail
label="$1"
case_dir=".artifacts/visual-callback-diag/cases/$label"
visual_dir="android-native/build/visual-evidence"
rm -rf "$visual_dir"
mkdir -p "$visual_dir" "$case_dir"
python3 -m http.server 4199 --bind 0.0.0.0 --directory /tmp/robys-web > "$case_dir/web-server.log" 2>&1 &
server_pid=$!
cleanup(){ kill "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 50); do
  if curl --fail --silent 'http://127.0.0.1:4199/?entry=android-handoff' >/dev/null; then break; fi
  sleep .1
done
export ROBYS_PINNED_WEB_URL='http://10.0.2.2:4199/?entry=android-handoff'
export ROBYS_WEB_COMMIT='9e4e09d09affa28712b27bb6ca48961adc8cbca8'
export ROBYS_DIAG_LABEL="$label"
set +e
bash .artifacts/visual-callback-diag/capture-pinned.sh
rc=$?
set -e
# Capture post-handoff diagnostic heartbeats without affecting the completed decision.
sleep 1.4
adb logcat -d -v threadtime > "$case_dir/logcat-after.txt" 2>/dev/null || true
if [[ -d "$visual_dir" ]]; then cp -a "$visual_dir"/. "$case_dir"/ 2>/dev/null || true; fi
printf '%s\n' "$rc" > "$case_dir/wrapper-exit.txt"
exit "$rc"
''')
    wrapper.chmod(0o755)
    (OUT / "plan.json").write_text(json.dumps({
        "web_commit": WEB_SHA,
        "base_diagnostic_native": BASE_DIAG_SHA,
        "samples": LABELS,
        "fresh_emulator_each": True,
        "decision_logic_changed": False,
        "production_deadlines_changed": False,
        "release_authorization": False,
        "events": ["VISUAL_REQUEST", "UI_QUEUE_IMMEDIATE", "UI_QUEUE_500MS", "UI_QUEUE_1250MS", "CHOREOGRAPHER_FRAME", "VISUAL_CALLBACK_ENTER", "VISUAL_TIMEOUT_RUNNABLE_ENTER"],
    }, indent=2) + "\n")


def parse_exit(path: Path):
    if not path.exists():
        return None
    raw = path.read_text().strip()
    m = re.fullmatch(r"(?:exit_code=)?(\d+)", raw)
    return int(m.group(1)) if m else None


def analyze() -> None:
    records = []
    valid = True
    providers = []
    diag_re = re.compile(r"RobysHandoffDiag: ([A-Z0-9_]+) request_id=(\d+) elapsed_ms=(\d+) uptime_ms=(\d+)")
    for label in LABELS:
        d = OUT / "cases" / label
        r = {"label": label}
        log = d / "logcat-after.txt"
        if not log.exists():
            log = d / "logcat.txt"
        text = log.read_text(errors="replace") if log.exists() else ""
        events = {}
        for line in text.splitlines():
            m = diag_re.search(line)
            if m:
                events.setdefault(m.group(1), {"request_id": int(m.group(2)), "elapsed_ms": int(m.group(3)), "uptime_ms": int(m.group(4))})
        states = []
        if (d / "handoff-states.txt").exists():
            for line in (d / "handoff-states.txt").read_text().splitlines():
                m = re.search(r"RobysHandoff: (.+)$", line)
                if m: states.append(m.group(1))
        rc = parse_exit(d / "capture-exit.txt")
        if rc is None:
            rc = parse_exit(d / "wrapper-exit.txt")
        provider = (d / "webview-provider.txt").read_text().strip() if (d / "webview-provider.txt").exists() else None
        if provider: providers.append(provider)
        r.update({
            "capture_exit": rc,
            "states": states,
            "events": events,
            "webview_provider": provider,
            "passed": rc == 0 and "HANDOFF_COMPLETE" in states and "VISUAL_STATE_TIMEOUT" not in states,
            "visual_callback_elapsed_ms": events.get("VISUAL_CALLBACK_ENTER", {}).get("elapsed_ms"),
            "ui_immediate_elapsed_ms": events.get("UI_QUEUE_IMMEDIATE", {}).get("elapsed_ms"),
            "ui_500_elapsed_ms": events.get("UI_QUEUE_500MS", {}).get("elapsed_ms"),
            "ui_1250_elapsed_ms": events.get("UI_QUEUE_1250MS", {}).get("elapsed_ms"),
            "choreographer_elapsed_ms": events.get("CHOREOGRAPHER_FRAME", {}).get("elapsed_ms"),
            "timeout_runnable_elapsed_ms": events.get("VISUAL_TIMEOUT_RUNNABLE_ENTER", {}).get("elapsed_ms"),
        })
        if rc is None or "VISUAL_REQUEST" not in events or provider is None:
            valid = False
            r["valid"] = False
        else:
            r["valid"] = True
        records.append(r)
    provider_consistent = len(providers) == len(LABELS) and len(set(providers)) == 1
    valid = valid and provider_consistent
    def med(key):
        xs = [r[key] for r in records if isinstance(r.get(key), (int, float))]
        return statistics.median(xs) if xs else None
    summary = {
        "study_valid": valid,
        "release_authorization": False,
        "all_cases_pass": all(r["passed"] for r in records),
        "provider_consistent": provider_consistent,
        "records": records,
        "medians_ms": {
            "visual_callback": med("visual_callback_elapsed_ms"),
            "ui_immediate": med("ui_immediate_elapsed_ms"),
            "ui_500": med("ui_500_elapsed_ms"),
            "ui_1250": med("ui_1250_elapsed_ms"),
            "choreographer": med("choreographer_elapsed_ms"),
        },
        "interpretation_boundary": "Debug timing probes can distinguish main/UI queue liveness from WebView visual callback delivery in captured samples. They add small diagnostic logging/queue work and are not release evidence.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    if not valid:
        raise SystemExit(2)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"apply-native", "prepare-capture", "analyze"}:
        raise SystemExit("usage: android-visual-callback-diagnostic.py apply-native|prepare-capture|analyze")
    {"apply-native": apply_native, "prepare-capture": prepare_capture, "analyze": analyze}[sys.argv[1]]()


if __name__ == "__main__":
    main()
