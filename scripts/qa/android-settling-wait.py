#!/usr/bin/env python3
"""Record a diagnostic idle interval before the unchanged first-app capture."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time


def wait_before_capture(seconds, output):
    if seconds not in (0, 120):
        raise ValueError('Only the declared 0-second and 120-second arms are allowed')
    output = Path(output)
    started = time.monotonic_ns()
    evidence = {
        'scope': 'idle emulator before original capture; no app/provider warmup commands',
        'requested_seconds': seconds,
        'started_utc': datetime.now(timezone.utc).isoformat(),
        'started_monotonic_ns': started,
        'state': 'waiting',
    }
    output.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence), flush=True)
    time.sleep(seconds)
    ended = time.monotonic_ns()
    evidence.update({
        'state': 'completed',
        'ended_utc': datetime.now(timezone.utc).isoformat(),
        'ended_monotonic_ns': ended,
        'elapsed_seconds': (ended - started) / 1_000_000_000,
    })
    output.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=int, choices=(0, 120), required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    wait_before_capture(args.seconds, args.output)
