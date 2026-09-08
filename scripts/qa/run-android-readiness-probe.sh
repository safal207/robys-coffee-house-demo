#!/usr/bin/env bash
# Delayed observation retains every original/native/rendering failure.
set -euo pipefail
original_probe_exit=0
bash run-android-rendering-probe.sh || original_probe_exit=$?
finish() {
  local wrapper_exit=$?
  trap - EXIT
  if [[ "$original_probe_exit" -ne 0 ]]; then exit "$original_probe_exit"; fi
  if [[ "$wrapper_exit" -ne 0 ]]; then exit 42; fi
  exit 0
}
trap finish EXIT
rm -f readiness-evidence/verification.json
mkdir -p readiness-evidence
pull_exit=0
timeout 15s adb exec-out run-as com.robys.coffeehouse.debug cat \
  files/readiness-observation.json > readiness-evidence/readiness-observation.json || pull_exit=$?
observation_exit=0
python3 verify-android-readiness-export.py readiness-evidence || observation_exit=$?
printf 'original_probe_exit=%s\npull_exit=%s\nobservation_exit=%s\n' \
  "$original_probe_exit" "$pull_exit" "$observation_exit" | tee readiness-evidence/exits.txt
if [[ "$pull_exit" -ne 0 || "$observation_exit" -ne 0 ]]; then exit 42; fi
