#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import statistics
import sys
from pathlib import Path

A_SHA = "0611ca0caa5d39f769fd0916bca65f037886aa56"
B_SHA = "9e4e09d09affa28712b27bb6ca48961adc8cbca8"
DIAG_SHA = "fad4e6d42d45c581c7bbd041d4cee67e3f161b38"
CAPTURE_BLOB = "52222dbbee45bad86df5604bbc5acf5b3f5c1914"
OUT = Path(".artifacts/android-pinned-ab")
CASES = [
    ("01-A-0611", "A", A_SHA),
    ("02-B-9e4", "B", B_SHA),
    ("03-B-9e4", "B", B_SHA),
    ("04-A-0611", "A", A_SHA),
]
TERMINAL = re.compile(r"LOAD_COMMIT_TIMEOUT|VISUAL_STATE_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR")


def git_blob(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def replace_one(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError(f"expected one transform match: {old[:120]!r}")
    return source.replace(old, new)


def prepare() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    capture = Path(".github/scripts/capture-android-launch.sh")
    raw = capture.read_bytes()
    if git_blob(raw) != CAPTURE_BLOB:
        raise RuntimeError(f"unexpected capture contract blob: {git_blob(raw)}")
    s = raw.decode()
    s = replace_one(
        s,
        "printf 'web_source=public-github-pages\\nweb_url=https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff\\nweb_bytes_pinned_to_pr=false\\n' > \"$OUT/source-boundary.txt\"",
        "printf 'web_source=pinned-git-archive\\nweb_url=%s\\nweb_bytes_pinned_to_pr=true\\nweb_commit=%s\\nstudy_label=%s\\n' \"$ROBYS_PINNED_WEB_URL\" \"$ROBYS_WEB_COMMIT\" \"$ROBYS_STUDY_LABEL\" > \"$OUT/source-boundary.txt\"",
    )
    s = replace_one(
        s,
        'adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"',
        'adb shell am start -W -n "$PACKAGE/$ACTIVITY" --es robys.test.APP_URL "$ROBYS_PINNED_WEB_URL" > "$OUT/activity-start.txt"',
    )
    for required in (
        "HANDOFF_WAIT_SECONDS=30",
        "LOAD_COMMIT_TIMEOUT|VISUAL_STATE_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR",
        "native_line < commit_line && commit_line < ready_line && ready_line < visual_line && visual_line < complete_line",
    ):
        if required not in s:
            raise RuntimeError(f"capture assertion changed: {required}")
    target = OUT / "capture-pinned.sh"
    target.write_text(s)
    target.chmod(0o755)

    runner = OUT / "run-case.sh"
    runner.write_text(r'''#!/usr/bin/env bash
set -uo pipefail
label="$1"
web_dir="$2"
web_commit="$3"
case_dir=".artifacts/android-pinned-ab/cases/$label"
visual_dir="android-native/build/visual-evidence"
rm -rf "$visual_dir"
mkdir -p "$visual_dir" "$case_dir"
python3 -m http.server 4199 --bind 0.0.0.0 --directory "$web_dir" > "$case_dir/web-server.log" 2>&1 &
server_pid=$!
cleanup(){ kill "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT
ready=0
for _ in $(seq 1 50); do
  if curl --fail --silent 'http://127.0.0.1:4199/?entry=android-handoff' >/dev/null; then ready=1; break; fi
  sleep .1
done
if [[ "$ready" != 1 ]]; then
  echo 97 > "$case_dir/capture-exit.txt"
  echo 'HOST_WEB_SERVER_NOT_READY' > "$case_dir/harness-error.txt"
  exit 97
fi
curl --fail --silent http://127.0.0.1:4199/android-handoff.js >/dev/null || {
  echo 98 > "$case_dir/capture-exit.txt"
  echo 'PINNED_ANDROID_HANDOFF_JS_NOT_SERVED' > "$case_dir/harness-error.txt"
  exit 98
}
export ROBYS_PINNED_WEB_URL='http://10.0.2.2:4199/?entry=android-handoff'
export ROBYS_WEB_COMMIT="$web_commit"
export ROBYS_STUDY_LABEL="$label"
set +e
bash .artifacts/android-pinned-ab/capture-pinned.sh
rc=$?
set -e
printf '%s\n' "$rc" > "$case_dir/capture-exit.txt"
if [[ -d "$visual_dir" ]]; then
  cp -a "$visual_dir"/. "$case_dir"/ 2>/dev/null || true
fi
printf 'label=%s\nweb_commit=%s\nweb_dir=%s\ncapture_exit=%s\n' "$label" "$web_commit" "$web_dir" "$rc" > "$case_dir/case-meta.txt"
exit "$rc"
''')
    runner.chmod(0o755)
    (OUT / "plan.json").write_text(json.dumps({
        "design": "fixed ABBA, four fresh API36 emulator instances in one eligible KVM job",
        "diagnostic_native_commit": DIAG_SHA,
        "A": A_SHA,
        "B": B_SHA,
        "cases": [{"label": l, "arm": a, "web_commit": c} for l, a, c in CASES],
        "release_authorization": False,
        "interpretation_limit": "Two observations per arm can bound a causal hypothesis but cannot establish a stable failure rate or production speedup.",
    }, indent=2) + "\n")
    print(target)


def parse_time(line: str):
    m = re.match(r"(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+) .*RobysHandoff: (.+)$", line)
    if not m:
        return None
    t = dt.datetime.strptime("2026-" + m.group(1) + " " + m.group(2), "%Y-%m-%d %H:%M:%S.%f")
    return t, m.group(3)


def first_state(rows, prefix: str):
    for t, state in rows:
        if state.startswith(prefix):
            return t, state
    return None


def delta_ms(a, b):
    if a is None or b is None:
        return None
    return round((b[0] - a[0]).total_seconds() * 1000, 1)


def med(values):
    xs = [x for x in values if isinstance(x, (int, float))]
    return round(statistics.median(xs), 1) if xs else None


def summarize() -> None:
    records = []
    study_valid = True
    providers = []
    for label, arm, commit in CASES:
        d = OUT / "cases" / label
        r = {"label": label, "arm": arm, "web_commit": commit, "evidence_present": d.exists()}
        if not d.exists():
            r["valid"] = False
            r["invalid_reason"] = "CASE_DIRECTORY_MISSING"
            study_valid = False
            records.append(r)
            continue
        try:
            rc = int((d / "capture-exit.txt").read_text().strip())
        except Exception:
            rc = None
        r["capture_exit"] = rc
        boundary = (d / "source-boundary.txt").read_text().splitlines() if (d / "source-boundary.txt").exists() else []
        r["source_boundary"] = boundary
        expected = {
            "web_source=pinned-git-archive",
            "web_bytes_pinned_to_pr=true",
            f"web_commit={commit}",
            f"study_label={label}",
        }
        boundary_ok = expected.issubset(set(boundary))
        state_text = (d / "handoff-states.txt").read_text() if (d / "handoff-states.txt").exists() else ""
        parsed = [p for line in state_text.splitlines() if (p := parse_time(line))]
        native = first_state(parsed, "NATIVE_SURFACE")
        committed = first_state(parsed, "WEB_COMMITTED")
        ready = first_state(parsed, "WEB_READY_TIMEOUT") or first_state(parsed, "WEB_READY")
        visual = first_state(parsed, "VISUAL_STATE_CONFIRMED") or first_state(parsed, "VISUAL_STATE_TIMEOUT")
        complete = first_state(parsed, "HANDOFF_COMPLETE")
        r["states"] = [state for _, state in parsed]
        r["native_to_commit_ms"] = delta_ms(native, committed)
        r["commit_to_ready_ms"] = delta_ms(committed, ready)
        r["ready_to_visual_ms"] = delta_ms(ready, visual)
        r["visual_outcome"] = visual[1] if visual else None
        r["native_to_complete_ms"] = delta_ms(native, complete)
        r["terminal_state_seen"] = bool(TERMINAL.search(state_text))
        provider = (d / "webview-provider.txt").read_text().strip() if (d / "webview-provider.txt").exists() else None
        r["webview_provider"] = provider
        if provider:
            providers.append(provider)
        r["passed"] = rc == 0 and complete is not None and not r["terminal_state_seen"]
        r["valid"] = boundary_ok and bool(parsed) and rc is not None and provider is not None
        if not r["valid"]:
            study_valid = False
            r["invalid_reason"] = "BOUNDARY_OR_CAPTURE_EVIDENCE_MISSING"
        records.append(r)

    provider_consistent = bool(providers) and len(set(providers)) == 1 and len(providers) == len(CASES)
    if not provider_consistent:
        study_valid = False
    groups = {}
    for arm, commit in (("A", A_SHA), ("B", B_SHA)):
        rows = [r for r in records if r["arm"] == arm]
        groups[arm] = {
            "web_commit": commit,
            "n": len(rows),
            "passes": sum(bool(r.get("passed")) for r in rows),
            "failures": sum(r.get("valid") is True and not r.get("passed") for r in rows),
            "ready_to_visual_ms": [r.get("ready_to_visual_ms") for r in rows],
            "ready_to_visual_median_ms": med([r.get("ready_to_visual_ms") for r in rows]),
            "native_to_complete_ms": [r.get("native_to_complete_ms") for r in rows],
            "native_to_complete_median_ms": med([r.get("native_to_complete_ms") for r in rows]),
            "visual_outcomes": [r.get("visual_outcome") for r in rows],
        }
    summary = {
        "study_valid": study_valid,
        "all_cases_pass": all(r.get("passed") is True for r in records),
        "release_authorization": False,
        "design": "ABBA fixed order; four fresh emulator instances; same diagnostic APK; exact pinned web archives",
        "diagnostic_native_commit": DIAG_SHA,
        "provider_consistent": provider_consistent,
        "provider": providers[0] if provider_consistent else None,
        "cases": records,
        "groups": groups,
        "claim_boundary": "This small matched study can test whether behavior differs under controlled pinned bytes. It cannot establish a production failure rate, fixed speedup, or sole root cause.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    if not study_valid:
        raise SystemExit(2)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "summarize"}:
        raise SystemExit("usage: android-pinned-ab.py prepare|summarize")
    {"prepare": prepare, "summarize": summarize}[sys.argv[1]]()


if __name__ == "__main__":
    main()
