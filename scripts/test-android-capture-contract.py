#!/usr/bin/env python3
"""Exercise capture-script failure semantics with a fake adb; not an emulator test."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

CAPTURE = Path(sys.argv[1] if len(sys.argv) > 1 else '.github/scripts/capture-android-launch.sh').resolve()

ADB = r'''#!/usr/bin/env -S python3 -S
import os
from pathlib import Path
import signal
import sys
args = sys.argv[1:]
case = os.environ['CAPTURE_TEST_CASE']
states = ['NATIVE_SURFACE', 'WEB_COMMITTED', 'WEB_READY', 'VISUAL_STATE_CONFIRMED', 'HANDOFF_COMPLETE_WEB_READY', 'HANDOFF_COMPLETE']
if case == 'fallback':
    states[2] = 'WEB_READY_TIMEOUT'
    states[4] = 'HANDOFF_COMPLETE_FALLBACK'
elif case == 'timeout':
    states = states[:3] + ['VISUAL_STATE_TIMEOUT']
elif case == 'missing_visual':
    states.remove('VISUAL_STATE_CONFIRMED')
elif case == 'out_of_order':
    states[2], states[3] = states[3], states[2]
elif case == 'missing_commit':
    states.remove('WEB_COMMITTED')
elif case == 'timeout_then_complete':
    states.insert(3, 'VISUAL_STATE_TIMEOUT')
elif case == 'error_then_complete':
    states.insert(1, 'MAIN_FRAME_ERROR')
elif case == 'error_after_complete':
    states.append('SSL_ERROR')
if args[:2] == ['shell', 'screenrecord'] and case == 'recording_error':
    sys.exit(17)
if args[:1] == ['pull'] and case == 'pull_error':
    sys.exit(19)
if args[:1] == ['install'] and case == 'install_error':
    sys.exit(23)
if args[:4] == ['shell', 'am', 'start', '-W']:
    if case == 'interrupted':
        os.kill(os.getppid(), signal.SIGTERM)
    print('Status: ok')
elif args[:2] == ['logcat', '-d']:
    print('\n'.join('D RobysHandoff: ' + state for state in states))
elif args[:1] == ['pull']:
    Path(args[2]).write_bytes(b'x' * (10 if case == 'short_video' else 60000))
elif args[:2] == ['exec-out', 'screencap']:
    sys.stdout.buffer.write(b'fixture-png')
elif args[:3] == ['shell', 'wm', 'size']:
    print('Physical size: 1080x2400')
elif args[:3] == ['shell', 'dumpsys', 'webviewupdate']:
    print('fixture-webview-provider')
'''

CASES = {'success': 0, 'fallback': 0, 'timeout': 1, 'missing_visual': 1,
         'out_of_order': 1, 'missing_commit': 1, 'short_video': 1,
         'install_error': 23, 'interrupted': 143, 'recording_error': 17,
         'pull_error': 19, 'timeout_then_complete': 1,
         'error_then_complete': 1, 'error_after_complete': 1}
selection = os.environ.get("CAPTURE_CASES")
if selection:
    CASES = {key: CASES[key] for key in selection.split(",")}
results = []
with tempfile.TemporaryDirectory(prefix='robys-capture-contract-') as temporary:
    root = Path(temporary)
    shims = root / 'bin'
    shims.mkdir()
    for name, body in {'adb': ADB, 'sleep': '#!/bin/sh\nexit 0\n'}.items():
        file = shims / name
        file.write_text(body)
        file.chmod(0o755)
    for case, expected in CASES.items():
        work = root / case
        work.mkdir()
        subprocess.run(['git', 'init', '-q', str(work)], check=True)
        subprocess.run(['git', '-C', str(work), '-c', 'user.name=QA fixture', '-c',
                        'user.email=qa@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], check=True)
        apk = work / 'android-native/app/build/outputs/apk/debug/app-debug.apk'
        apk.parent.mkdir(parents=True)
        apk.write_bytes(b'fixture apk, not an installable application')
        env = dict(os.environ, PATH=str(shims) + os.pathsep + os.environ['PATH'], CAPTURE_TEST_CASE=case)
        run = subprocess.run(['bash', str(CAPTURE)], cwd=work, env=env, capture_output=True, text=True, timeout=20)
        evidence = work / 'android-native/build/visual-evidence'
        assert run.returncode == expected, (case, run.returncode, expected, run.stderr)
        assert (evidence / 'capture-exit.txt').read_text().strip() == f'exit_code={expected}', case
        assert (evidence / 'webview-provider.txt').read_text().strip() == 'fixture-webview-provider', case
        assert 'web_bytes_pinned_to_pr=false' in (evidence / 'source-boundary.txt').read_text(), case
        head = subprocess.check_output(['git', '-C', str(work), 'rev-parse', 'HEAD'], text=True).strip()
        assert (evidence / 'native-source.sha').read_text().strip() == head, case
        assert (evidence / 'handoff-states.txt').is_file(), case
        assert (evidence / 'evidence-summary.txt').exists() == (expected == 0), case
        if case not in {'install_error', 'interrupted'}:
            recorder_exit = 17 if case == 'recording_error' else 0
            assert (evidence / 'recorder-exit.txt').read_text().strip() == f'exit_code={recorder_exit}', case
        if case == 'recording_error':
            assert (evidence / 'robys-atomic-handoff.mp4').stat().st_size > 50000, case
            assert 'screen recording failed' in run.stderr, case
        if case in {'timeout_then_complete', 'error_then_complete', 'error_after_complete'}:
            assert 'terminal launch failure' in run.stderr, case
        print(f'{case}: PASS ({run.returncode})', file=sys.stderr, flush=True)
        results.append({'case': case, 'expectedExit': expected, 'actualExit': run.returncode,
                        'diagnosticsPreserved': True, 'passed': True})
print(json.dumps({'scope': 'capture harness with fake adb; not native/app verification',
                  'cases': results, 'passed': len(results), 'total': len(CASES)}, indent=2))
