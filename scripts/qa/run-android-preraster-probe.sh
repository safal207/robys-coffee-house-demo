#!/usr/bin/env bash
# Diagnostic log excerpts must preserve the original capture/trace failure.
set -euo pipefail
probe_exit=0
bash trace-runner.sh || probe_exit=$?
printf 'PR346_PRERASTER_PROBE_EXIT=%s\n' "$probe_exit"
report_exit=0
python3 print-android-preraster-evidence.py . || report_exit=$?
printf 'PR346_PRERASTER_PROBE_EXIT=%s REPORT_EXIT=%s\n' "$probe_exit" "$report_exit"
if [[ "$probe_exit" -ne 0 ]]; then exit "$probe_exit"; fi
exit "$report_exit"
