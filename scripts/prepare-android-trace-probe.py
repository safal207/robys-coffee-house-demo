#!/usr/bin/env python3
"""Add system tracing to an isolated copy of the original capture, not the app."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START = '''# Begin the diagnostic system trace after the original cold-provider settling.
adb shell perfetto --version > trace-evidence/perfetto-version.txt
adb shell atrace --list_categories > trace-evidence/atrace-categories.txt
date +%s%N > trace-evidence/host-before-ns.txt
adb shell date +%s%N > trace-evidence/guest-wall-ns.txt
date +%s%N > trace-evidence/host-after-ns.txt
adb shell perfetto --background-wait --txt -c - -o /data/misc/perfetto-traces/robys-handoff.pftrace < trace-evidence/config.pbtx > trace-evidence/perfetto-pid.txt 2> trace-evidence/perfetto-start.log
'''
RUNNER = '''#!/usr/bin/env bash
set -euo pipefail
python3 sample-emulator-cpu.py trace-evidence/host-threads.jsonl &
cpu_sampler_pid=$!
collect_trace() {
  local result=$?
  trap - EXIT
  set +e
  kill "$cpu_sampler_pid" 2>/dev/null
  wait "$cpu_sampler_pid" 2>/dev/null
  if [[ -f trace-evidence/perfetto-pid.txt ]]; then
    trace_pid="$(tr -d '\\r\\n ' < trace-evidence/perfetto-pid.txt)"
    if [[ "$trace_pid" =~ ^[0-9]+$ ]]; then
      adb shell kill -INT "$trace_pid" 2> trace-evidence/perfetto-stop.log
      for ((n = 0; n < 20; n++)); do
        adb shell kill -0 "$trace_pid" 2>/dev/null || break
        sleep 0.25
      done
    fi
  fi
  timeout 12s adb pull /data/misc/perfetto-traces/robys-handoff.pftrace trace-evidence/launch.pftrace > trace-evidence/trace-pull.log 2>&1
  pull_result=$?
  timeout 6s adb shell dumpsys gfxinfo com.robys.coffeehouse.debug framestats > trace-evidence/gfxinfo.txt
  printf 'capture_exit=%s\\ntrace_pull_exit=%s\\n' "$result" "$pull_result" > trace-evidence/exits.txt
  if [[ "$result" -ne 0 ]]; then exit "$result"; fi
  if [[ "$pull_result" -ne 0 || ! -s trace-evidence/launch.pftrace ]]; then exit 1; fi
}
trap collect_trace EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
bash trace-capture.sh
'''


def prepare(directory):
    root = Path(directory)
    original = (root / 'capture.sh').read_text()
    anchor = 'adb logcat -c\n'
    assert original.count(anchor) == 1, 'capture insertion boundary changed'
    derived = original.replace(anchor, anchor + START)
    assert derived.replace(START, '') == original, 'original capture changed'
    evidence = root / 'trace-evidence'
    evidence.mkdir(exist_ok=False)
    config = (ROOT / 'scripts/qa/android-handoff-trace.pbtx').read_bytes()
    (evidence / 'config.pbtx').write_bytes(config)
    sampler = (ROOT / 'scripts/qa/sample-emulator-cpu.py').read_bytes()
    (root / 'sample-emulator-cpu.py').write_bytes(sampler)
    for name, body in [('trace-capture.sh', derived), ('trace-runner.sh', RUNNER)]:
        (root / name).write_text(body)
    sha = lambda data: hashlib.sha256(data).hexdigest()
    subject = json.loads((root / 'fixture-manifest.json').read_text())['source_sha']
    (evidence / 'manifest.json').write_text(json.dumps({
        'source_sha': subject, 'scope': 'system trace; adds observation overhead; not a performance waiver',
        'original_capture_sha256': sha(original.encode()), 'trace_capture_sha256': sha(derived.encode()),
        'runner_sha256': sha(RUNNER.encode()), 'config_sha256': sha(config),
        'host_sampler_sha256': sha(sampler),
        'app_instrumentation': 'none beyond existing pinned transport',
        'original_capture_assertions': 'unchanged'}, indent=2) + '\n')
    (evidence / 'capture.diff').write_text(''.join(difflib.unified_diff(
        original.splitlines(True), derived.splitlines(True), fromfile='capture.sh', tofile='trace-capture.sh')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    prepare(parser.parse_args().directory)
