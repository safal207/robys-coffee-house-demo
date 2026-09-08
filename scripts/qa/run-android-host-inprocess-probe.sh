#!/usr/bin/env bash
# The original settling/capture sequence and its exit retain priority.
set -uo pipefail
python3 observe-android-host-inprocess.py bind "$PWD" || exit 42
original_runner_exit=0
python3 android-settling-wait.py --seconds 120 --output startup-wait.json &&
  test -z "$(adb shell pm path com.robys.coffeehouse.debug | tee package-before-install.txt)" &&
  bash run-android-late-profile-probe.sh || original_runner_exit=$?
record_exit=0
printf '%s\n' "$original_runner_exit" > host-inprocess-evidence/original-runner.exit || record_exit=42
if [[ "$original_runner_exit" -ne 0 ]]; then exit "$original_runner_exit"; fi
exit "$record_exit"
