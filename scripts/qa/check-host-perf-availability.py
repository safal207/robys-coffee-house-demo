#!/usr/bin/env python3
"""Test only whether this runner permits perf's own harmless child event.

No installation, permission changes, process discovery, or Android invocation.
Success does not establish attach access, usable stacks, or product readiness.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time


def timestamp():
    return {'host_monotonic_ns': time.monotonic_ns(),
            'host_utc': datetime.now(timezone.utc).isoformat()}


def run_command(output, name, argv, timeout_seconds):
    row = {'argv': argv, 'timeout_seconds': timeout_seconds,
           'started': timestamp(), 'timed_out': False}
    paths = {stream: output / (name + '.' + stream) for stream in ('stdout', 'stderr')}
    with paths['stdout'].open('wb') as stdout, paths['stderr'].open('wb') as stderr:
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=stdout,
                                   stderr=stderr, start_new_session=True)
        try:
            process.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            row['timed_out'] = True
        finally:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=2)
        row['returncode'] = process.returncode
    row['ended'] = timestamp()
    for stream, path in paths.items():
        data = path.read_bytes()
        row[stream] = {'file': path.name, 'bytes': len(data),
                       'sha256': hashlib.sha256(data).hexdigest()}
    return row


def collect(output):
    output.mkdir(parents=True, exist_ok=False)
    record = {'schema': 'robys.host.perf-availability.v1', 'state': 'INCOMPLETE',
              'started': timestamp(), 'exit_code': 42, 'commands': {},
              'scope': 'perf stat cpu-clock:u for its own harmless true child only',
              'limits': 'No Android run, emulator attach, DWARF stack, performance, or product readiness proof',
              'runner': {'image_os': os.environ.get('ImageOS'),
                         'image_version': os.environ.get('ImageVersion'),
                         'kernel_release': os.uname().release,
                         'machine': os.uname().machine},
              'tooling_sha': os.environ.get('GITHUB_SHA')}
    try:
        record['perf_event_paranoid'] = Path('/proc/sys/kernel/perf_event_paranoid').read_text().strip()
    except OSError as error:
        record['perf_event_paranoid_read_error'] = type(error).__name__
    executable = shutil.which('perf')
    record['perf_available_on_path'] = executable is not None
    try:
        if executable is None:
            record['reason'] = 'PERF_EXECUTABLE_ABSENT'
        else:
            record['commands']['version'] = run_command(output, 'perf-version', [executable, '--version'], 5)
            record['commands']['stat'] = run_command(output, 'perf-stat',
                [executable, 'stat', '-e', 'cpu-clock:u', '--', 'true'], 10)
            version, stat = record['commands']['version'], record['commands']['stat']
            if version['timed_out'] or stat['timed_out']:
                record['reason'] = 'COMMAND_TIMEOUT'
            elif version['returncode'] != 0:
                record['reason'] = 'PERF_VERSION_FAILED'
            elif stat['returncode'] != 0:
                record['reason'] = 'PERF_STAT_FAILED_INSPECT_STDERR'
            else:
                record.update(state='PREFLIGHT_ALLOWED_UNVALIDATED_STACKS', exit_code=0,
                              reason='OWN_CHILD_USERSPACE_EVENT_ALLOWED')
    except SystemExit as error:
        record['reason'] = 'CANCELLED'
        record['exit_code'] = error.code
        raise
    except (OSError, subprocess.SubprocessError) as error:
        record['reason'] = 'COMMAND_EXECUTION_ERROR'
        record['error_type'] = type(error).__name__
    finally:
        record['ended'] = timestamp()
        (output / 'status.json').write_text(json.dumps(record, indent=2, sort_keys=True) + '\n')
    return record['exit_code']


def interrupted(signum, _frame):
    raise SystemExit(128 + signum)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('host-perf-preflight'))
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    raise SystemExit(collect(args.output))
