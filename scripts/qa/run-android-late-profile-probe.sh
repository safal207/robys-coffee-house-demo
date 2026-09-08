#!/usr/bin/env bash
# Separate scoped profile after native startup; original verdict retains priority.
set -euo pipefail
original_probe_exit=0
profile_exit=0
profile_pid=''
finish() {
  local wrapper_exit=$?
  trap - EXIT
  if [[ -n "$profile_pid" ]]; then
    kill "$profile_pid" 2>/dev/null || true
    wait "$profile_pid" 2>/dev/null || true
  fi
  if [[ "$original_probe_exit" -ne 0 ]]; then exit "$original_probe_exit"; fi
  if [[ "$wrapper_exit" -eq 130 || "$wrapper_exit" -eq 143 ]]; then exit "$wrapper_exit"; fi
  if [[ "$wrapper_exit" -ne 0 ]]; then exit 42; fi
  exit 0
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
timeout --kill-after=5s 135s python3 start-android-raster-profile.py --output late-profile-evidence > late-profile-collector.log 2>&1 &
profile_pid=$!
bash run-android-readiness-probe.sh || original_probe_exit=$?
wait "$profile_pid" || profile_exit=$?
profile_pid=''
printf 'original_probe_exit=%s\nprofile_collection_exit=%s\n' \
  "$original_probe_exit" "$profile_exit" | tee late-profile-exits.txt
if [[ "$profile_exit" -ne 0 ]]; then exit 42; fi
