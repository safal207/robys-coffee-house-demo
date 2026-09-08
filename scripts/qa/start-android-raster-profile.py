#!/usr/bin/env python3
"""Collect a second, PID-scoped profile after the app identifies its first surface.

This observer never modifies the original trace or native capture. A collected
file is not proof of usable samples; raw packet/stack validation remains separate.
"""
import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import time

PACKAGE = 'com.robys.coffeehouse.debug'
DEVICE_TRACE = '/data/misc/perfetto-traces/robys-late-raster.pftrace'
MAX_LOG_BYTES = 1024 * 1024
MAX_LINE_BYTES = 8192
MARKER = re.compile(r'^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\S+)\s+(\S+)\s+D\s+RobysHandoff\s*:\s*NATIVE_SURFACE\s*$')


@dataclass(frozen=True)
class Limits:
    marker: float = 60
    identity: float = 8
    profile: float = 65
    pull: float = 15
    stop: float = 2


class Incomplete(Exception):
    def __init__(self, stage, reason, returncode=None):
        super().__init__(reason)
        self.stage, self.reason, self.returncode = stage, reason, returncode


def timestamp():
    return {'host_monotonic_ns': time.monotonic_ns(),
            'host_utc': datetime.now(timezone.utc).isoformat()}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def profile_config(pid):
    if type(pid) is not int or not 0 < pid <= 2147483647:
        raise ValueError('PID must be a positive int32')
    return f'''# Additional observer; original system trace remains unchanged.
duration_ms: 45000
buffers {{ size_kb: 16384 fill_policy: DISCARD }}
data_sources {{
  config {{
    name: "linux.perf"
    target_buffer: 0
    perf_event_config {{
      timebase {{
        counter: SW_CPU_CLOCK
        frequency: 80
        timestamp_clock: PERF_CLOCK_MONOTONIC
      }}
      callstack_sampling {{
        scope {{ target_pid: {pid} }}
        kernel_frames: false
        user_frames: UNWIND_DWARF
      }}
    }}
  }}
}}
'''.encode()


def stop_owned(process, seconds):
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=seconds)
    return process.returncode


class Observer:
    def __init__(self, output, limits):
        self.output, self.limits = Path(output), limits
        self.record = {'schema': 'robys.android.late-raster-profile.v1',
                       'state': 'WAITING', 'stage': 'initializing',
                       'package': PACKAGE, 'device_trace': DEVICE_TRACE,
                       'started': timestamp(), 'commands': [],
                       'stack_validation': 'NOT_RUN',
                       'scope': 'additional diagnostic overhead; no product readiness or performance certification'}

    def save(self, stage):
        self.record['stage'] = stage
        self.record['updated'] = timestamp()
        temporary = self.output / 'status.json.tmp'
        temporary.write_text(json.dumps(self.record, indent=2, sort_keys=True) + '\n')
        temporary.replace(self.output / 'status.json')

    def command(self, stage, argv, timeout, data=None):
        row = {'stage': stage, 'argv': argv, 'timeout_seconds': timeout,
               'started': timestamp(), 'stdout': stage + '.stdout', 'stderr': stage + '.stderr'}
        self.record['commands'].append(row)
        self.save(stage)
        with (self.output / row['stdout']).open('wb') as stdout, (self.output / row['stderr']).open('wb') as stderr:
            process = subprocess.Popen(argv, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                                       stdout=stdout, stderr=stderr, start_new_session=True)
            timed_out = False
            interrupted = None
            try:
                process.communicate(input=data, timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
            except BaseException as error:
                interrupted = error
            finally:
                stop_owned(process, self.limits.stop)
                row.update({'ended': timestamp(), 'returncode': process.returncode, 'timed_out': timed_out})
        for key in ('stdout', 'stderr'):
            content = (self.output / row[key]).read_bytes()
            row[key + '_sha256'] = sha(content)
            row[key + '_bytes'] = len(content)
        self.save(stage + '-finished')
        if interrupted is not None:
            raise interrupted
        if timed_out:
            raise Incomplete(stage, stage + ' command timed out', 124)
        if row['returncode'] != 0:
            raise Incomplete(stage, stage + ' command failed', row['returncode'])
        return (self.output / row['stdout']).read_bytes()

    def wait_for_marker(self):
        argv = ['adb', 'logcat', '-v', 'threadtime', '-s', 'RobysHandoff:D', '*:S']
        row = {'stage': 'native-marker', 'argv': argv, 'timeout_seconds': self.limits.marker,
               'started': timestamp(), 'stdout': 'native-marker.stdout', 'stderr': 'native-marker.stderr'}
        self.record['commands'].append(row)
        self.save('waiting-for-native-surface')
        found = None
        with (self.output / row['stdout']).open('wb') as output, (self.output / row['stderr']).open('wb') as stderr:
            process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                       stderr=stderr, start_new_session=True)
            selector = selectors.DefaultSelector()
            selector.register(process.stdout, selectors.EVENT_READ)
            deadline = time.monotonic() + self.limits.marker
            pending = b''
            total = 0
            try:
                while found is None:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        raise Incomplete('native-marker', 'NATIVE_SURFACE was not observed before deadline', 124)
                    chunk = os.read(process.stdout.fileno(), 16384)
                    if not chunk:
                        process.wait(timeout=self.limits.stop)
                        raise Incomplete('native-marker', 'logcat ended before NATIVE_SURFACE', process.returncode)
                    output.write(chunk)
                    output.flush()
                    total += len(chunk)
                    if total > MAX_LOG_BYTES:
                        raise Incomplete('native-marker', 'bounded log stream overflow')
                    pending += chunk
                    while b'\n' in pending:
                        raw_line, pending = pending.split(b'\n', 1)
                        if len(raw_line) > MAX_LINE_BYTES:
                            raise Incomplete('native-marker', 'bounded log line overflow')
                        line = raw_line.decode('utf-8', errors='replace').rstrip('\r')
                        match = MARKER.fullmatch(line)
                        if match is None:
                            continue
                        device_time, raw_pid, raw_tid = match.groups()
                        self.record['marker'] = {'raw_line': line, 'raw_pid': raw_pid,
                                                 'raw_tid': raw_tid, 'device_log_time': device_time,
                                                 'selected': timestamp()}
                        if not re.fullmatch(r'[1-9][0-9]{0,9}', raw_pid) or int(raw_pid) > 2147483647:
                            raise Incomplete('native-marker', 'marker PID is not canonical positive int32')
                        found = int(raw_pid)
                        break
                    if len(pending) > MAX_LINE_BYTES:
                        raise Incomplete('native-marker', 'bounded partial log line overflow')
            finally:
                selector.close()
                row['returncode'] = stop_owned(process, self.limits.stop)
                process.stdout.close()
                row['ended'] = timestamp()
                row['stopped_by_observer'] = True
                output.flush()
                for key in ('stdout', 'stderr'):
                    content = (self.output / row[key]).read_bytes()
                    row[key + '_sha256'] = sha(content)
                    row[key + '_bytes'] = len(content)
                self.save('native-marker-stream-closed')
        return found

    def collect(self):
        fixture_path = Path.cwd() / 'fixture-manifest.json'
        tooling_path = Path.cwd() / 'diagnostic-tooling.sha'
        fixture_bytes = fixture_path.read_bytes()
        source_sha = json.loads(fixture_bytes)['source_sha']
        tooling_sha = tooling_path.read_text().strip()
        if not re.fullmatch(r'[0-9a-f]{40}', source_sha) or not re.fullmatch(r'[0-9a-f]{40}', tooling_sha):
            raise Incomplete('fixture-identity', 'source or tooling identity is malformed')
        self.record['fixture'] = {'source_sha': source_sha, 'manifest_sha256': sha(fixture_bytes),
                                  'tooling_sha': tooling_sha}
        pid = self.wait_for_marker()
        self.record['pid'] = pid
        raw_cmdline = self.command('process-identity', ['adb', 'exec-out', 'cat', f'/proc/{pid}/cmdline'], self.limits.identity)
        self.record['process_identity'] = {'pid': pid, 'cmdline_sha256': sha(raw_cmdline),
                                          'raw_cmdline_hex': raw_cmdline.hex(),
                                          'verified': False, 'observed': timestamp()}
        if not raw_cmdline or len(raw_cmdline) > 4096 or raw_cmdline.rstrip(b'\0') != PACKAGE.encode():
            raise Incomplete('process-identity', 'first native marker does not identify the exact application command line')
        self.record['process_identity']['verified'] = True
        self.record['process_identity']['cmdline'] = PACKAGE
        config = profile_config(pid)
        (self.output / 'config.pbtx').write_bytes(config)
        self.record['config_sha256'] = sha(config)
        self.record['profile_duration_ms'] = 45000
        self.record['state'] = 'PROFILING'
        self.save('verified-pid-before-profile')
        primary_failure = None
        try:
            self.command('perfetto', ['adb', 'shell', 'perfetto', '--txt', '-c', '-', '-o', DEVICE_TRACE],
                         self.limits.profile, data=config)
        except Incomplete as error:
            primary_failure = error
        # Pull any useful partial trace without overriding the original failure.
        try:
            self.command('pull', ['adb', 'pull', DEVICE_TRACE, str(self.output / 'profile.pftrace')], self.limits.pull)
        except Incomplete as error:
            if primary_failure is None:
                primary_failure = error
            else:
                self.record['secondary_failure'] = {'stage': error.stage, 'reason': error.reason,
                                                    'returncode': error.returncode}
        trace = self.output / 'profile.pftrace'
        if trace.is_file():
            self.record['trace_bytes'] = trace.stat().st_size
            self.record['trace_sha256'] = sha(trace.read_bytes())
        if primary_failure is not None:
            raise primary_failure
        if not trace.is_file() or trace.stat().st_size == 0:
            raise Incomplete('trace-file', 'profile trace was not collected or is empty')
        self.record['state'] = 'COLLECTED_UNVALIDATED'
        self.record['exit_code'] = 0
        self.save('trace-collected-stack-validation-required')


def run(output='late-profile-evidence', limits=None):
    output = Path(output).resolve()
    # Preserve prior evidence rather than replacing it with a new attempt.
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        print('INCOMPLETE: late profile output must be a fresh or empty directory', file=sys.stderr)
        return 42
    output.mkdir(parents=True, exist_ok=True)
    observer = Observer(output, limits or Limits())
    try:
        observer.collect()
        return 0
    except Exception as error:
        observer.record['state'] = 'INCOMPLETE'
        observer.record['exit_code'] = 42
        observer.record['failure'] = {'stage': getattr(error, 'stage', observer.record['stage']),
                                      'reason': getattr(error, 'reason', str(error)),
                                      'returncode': getattr(error, 'returncode', None)}
        observer.save('incomplete')
        print(json.dumps(observer.record['failure']), file=sys.stderr)
        return 42


if __name__ == '__main__':
    def cancelled(signum, _frame):
        raise Incomplete('cancelled', 'observer cancelled; owned ADB client is stopped', 128 + signum)
    signal.signal(signal.SIGINT, cancelled)
    signal.signal(signal.SIGTERM, cancelled)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='late-profile-evidence')
    sys.exit(run(parser.parse_args().output))
