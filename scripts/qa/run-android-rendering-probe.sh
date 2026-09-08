#!/usr/bin/env bash
# Add diagnostic observation without replacing the original capture verdict.
set -euo pipefail

original_probe_exit=0
bash run-android-preraster-probe.sh || original_probe_exit=$?

# Once capture has returned, even a local reporting failure must preserve it.
finish() {
  local wrapper_exit=$?
  trap - EXIT
  if [[ "$original_probe_exit" -ne 0 ]]; then
    exit "$original_probe_exit"
  fi
  if [[ "$wrapper_exit" -ne 0 ]]; then
    exit 42
  fi
  exit 0
}
trap finish EXIT

rm -f rendering-evidence/verification.json
mkdir -p rendering-evidence

trace_pull_exit=0
status_pull_exit=0
timeout 15s adb exec-out run-as com.robys.coffeehouse.debug cat \
  files/rendering-trace.json > rendering-evidence/rendering-trace.json \
  || trace_pull_exit=$?
timeout 15s adb exec-out run-as com.robys.coffeehouse.debug cat \
  files/rendering-trace-status.json > rendering-evidence/rendering-trace-status.json \
  || status_pull_exit=$?

observation_exit=0
python3 verify-android-rendering-trace.py rendering-evidence || observation_exit=$?

printf 'original_probe_exit=%s\ntrace_pull_exit=%s\nstatus_pull_exit=%s\nobservation_exit=%s\n' \
  "$original_probe_exit" "$trace_pull_exit" "$status_pull_exit" "$observation_exit" \
  | tee rendering-evidence/exits.txt

if [[ "$trace_pull_exit" -ne 0 || "$status_pull_exit" -ne 0 || "$observation_exit" -ne 0 ]]; then
  exit 42
fi
