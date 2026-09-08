#!/usr/bin/env python3
"""Exercise rendering output and wrapper verdicts with synthetic local evidence."""
import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / 'scripts/qa/verify-android-rendering-trace.py'
WRAPPER = ROOT / 'scripts/qa/run-android-rendering-probe.sh'


def write_evidence(directory, mode='good'):
    events = [{'cat': 'gpu,benchmark', 'ph': 'X', 'name': 'DrawAndSwap',
               'ts': 110, 'dur': 30, 'pid': 20, 'tid': 21}]
    if mode == 'empty':
        events = []
    if mode == 'no-gpu':
        events = [{'cat': 'gpu', 'ph': 'M', 'name': 'thread_name'},
                  {'cat': 'disabled-by-default-gpu.service', 'ph': 'X', 'name': 'Service'}]
    raw = json.dumps({'traceEvents': events}).encode()
    if mode == 'invalid-json':
        raw = b'{broken'
    if mode == 'gzip':
        raw = gzip.compress(raw)
    status = {
        'state': 'closed', 'reason': 'timer', 'bytes_written': len(raw),
        'io_error_count': 0, 'stop_accepted': True,
        'start_elapsed_ns': 100, 'start_returned_elapsed_ns': 120,
        'stop_requested_elapsed_ns': 200, 'closed_elapsed_ns': 220,
        'provider': {'package_name': 'com.google.android.webview',
                     'version_name': 'synthetic', 'long_version_code': 1},
        'categories': ['CATEGORIES_RENDERING', 'CATEGORIES_ANDROID_WEBVIEW',
                       'disabled-by-default-gpu.service', 'disabled-by-default-skia.shaders'],
        'mode': 'RECORD_UNTIL_FULL', 'stop_after_ms': 35000,
    }
    changes = {
        'writing': {'state': 'writing'},
        'early-destroy': {'reason': 'destroy'},
        'io': {'io_error_count': 1},
        'bytes': {'bytes_written': len(raw) + 1},
        'stop-false': {'stop_accepted': False},
        'clock': {'closed_elapsed_ns': 190},
    }
    status.update(changes.get(mode, {}))
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'rendering-trace.json').write_bytes(raw)
    (directory / 'rendering-trace-status.json').write_text(json.dumps(status))


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    modes = ('good', 'gzip', 'writing', 'early-destroy', 'io', 'bytes',
             'stop-false', 'clock', 'invalid-json', 'empty', 'no-gpu')
    for mode in modes:
        evidence = root / mode
        write_evidence(evidence, mode)
        result = subprocess.run([sys.executable, str(VALIDATOR), str(evidence)],
                                capture_output=True, text=True, timeout=10)
        expected = 0 if mode in ('good', 'gzip') else 42
        assert result.returncode == expected, (mode, result.stdout, result.stderr)
        report = json.loads((evidence / 'verification.json').read_text())
        assert report['observation_valid'] == (expected == 0), mode
        assert report['provider']['version_name'] == 'synthetic'
        assert report['trace_bytes'] == (evidence / 'rendering-trace.json').stat().st_size
        assert ('does not change the original native verdict' in report['claim_boundary'])

    cases = (
        ('success', 0, 'good', None, 0),
        ('native-failure', 23, 'good', None, 23),
        ('both-fail', 23, 'writing', None, 23),
        ('observer-failure', 0, 'writing', None, 42),
        ('trace-pull-failure', 0, 'good', 'trace', 42),
        ('status-pull-failure', 0, 'good', 'status', 42),
        ('native-and-tee-failure', 23, 'good', 'tee', 23),
        ('native-and-mkdir-failure', 23, 'good', 'mkdir', 23),
        ('native-and-report-failure', 23, 'good', 'python', 23),
    )
    for name, native, mode, failure, expected in cases:
        work = root / ('wrapper-' + name)
        work.mkdir()
        write_evidence(work / 'device-files', mode)
        shutil.copyfile(VALIDATOR, work / VALIDATOR.name)
        shutil.copyfile(WRAPPER, work / WRAPPER.name)
        (work / 'run-android-preraster-probe.sh').write_text(
            f'#!/bin/bash\nprintf ran > original-probe-ran\nexit {native}\n')
        # A prior successful report must never survive this collection attempt.
        (work / 'rendering-evidence').mkdir()
        (work / 'rendering-evidence/verification.json').write_text('{"stale": true}')
        shims = work / 'bin'
        shims.mkdir()
        adb = shims / 'adb'
        adb.write_text(f'''#!{sys.executable}
import os,sys
from pathlib import Path
assert sys.argv[1:5] == ['exec-out','run-as','com.robys.coffeehouse.debug','cat'], sys.argv
name=Path(sys.argv[5]).name
assert name in ('rendering-trace.json','rendering-trace-status.json'), name
failure=os.environ.get('TEST_FAILURE')
if failure=='trace' and name=='rendering-trace.json':sys.exit(11)
if failure=='status' and name=='rendering-trace-status.json':sys.exit(12)
sys.stdout.buffer.write((Path('device-files')/name).read_bytes())
''')
        adb.chmod(0o755)
        for command, exit_code in (('tee', 17), ('mkdir', 18), ('python3', 19)):
            real = sys.executable if command == 'python3' else shutil.which(command)
            token = 'python' if command == 'python3' else command
            shim = shims / command
            shim.write_text(f'''#!{sys.executable}
import os,sys
if os.environ.get('TEST_FAILURE')=={token!r}:sys.exit({exit_code})
os.execv({real!r}, [{real!r}]+sys.argv[1:])
''')
            shim.chmod(0o755)
        env = dict(os.environ, PATH=str(shims) + os.pathsep + os.environ['PATH'],
                   TEST_FAILURE=failure or '')
        result = subprocess.run(['bash', WRAPPER.name], cwd=work, env=env,
                                capture_output=True, text=True, timeout=15)
        assert result.returncode == expected, (name, expected, result.returncode,
                                               result.stdout, result.stderr)
        assert (work / 'original-probe-ran').read_text() == 'ran'
        report_path = work / 'rendering-evidence/verification.json'
        assert not report_path.exists() or 'stale' not in json.loads(report_path.read_text()), name
        if failure not in ('mkdir', 'tee'):
            exits = dict(line.split('=') for line in
                         (work / 'rendering-evidence/exits.txt').read_text().splitlines())
            assert exits['original_probe_exit'] == str(native), name
            assert exits['trace_pull_exit'] == ('11' if failure == 'trace' else '0'), name
            assert exits['status_pull_exit'] == ('12' if failure == 'status' else '0'), name
            if failure == 'python':
                assert exits['observation_exit'] == '19'

print('Rendering collection: 11 output controls and 9 wrapper verdict controls passed.')
print('Synthetic local evidence only; no emulator or native application verdict was tested.')
