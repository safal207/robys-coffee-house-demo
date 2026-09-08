#!/usr/bin/env python3
"""Exercise the real late-profile shell wrapper with bounded local helper controls."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / 'scripts/qa/run-android-late-profile-probe.sh'


class LateProfileWrapperTests(unittest.TestCase):
    def prepare(self, work, native_exit, profile_exit=0, failure=''):
        shutil.copyfile(WRAPPER, work / WRAPPER.name)
        (work / 'run-android-readiness-probe.sh').write_text(
            '#!/usr/bin/env bash\n'
            'printf ran > original-probe-ran\n'
            f'printf {native_exit} > original-probe-exit\n'
            f'exit {native_exit}\n')
        (work / 'start-android-raster-profile.py').write_text('''
import json, os, signal, sys
from pathlib import Path
assert sys.argv[1:] == ['--output', 'late-profile-evidence'], sys.argv
Path('helper-argv.json').write_text(json.dumps(sys.argv[1:]))
Path('late-profile-evidence').mkdir(parents=True, exist_ok=True)
Path('helper-pid').write_text(str(os.getpid()))
def stop(signum, frame):
    Path('helper-stopped').write_text(str(signum))
    sys.exit(42)
signal.signal(signal.SIGTERM, stop)
Path('helper-ready').write_text('ready')
if os.environ.get('TEST_FAILURE') == 'report-io':
    Path('late-profile-evidence/report.json').write_text('{}')
if os.environ.get('TEST_WAIT') == '1':
    while True: signal.pause()
Path('helper-completed').write_text('completed')
sys.exit(int(os.environ['TEST_PROFILE_EXIT']))
''')
        evidence = work / 'late-profile-evidence'
        if failure == 'mkdir':
            evidence.write_text('File prevents collector output directory creation')
        else:
            evidence.mkdir()
            if failure == 'log-io':
                (work / 'late-profile-collector.log').mkdir()
            elif failure == 'report-io':
                (evidence / 'report.json').mkdir()
        shims = work / 'bin'
        shims.mkdir()
        real_timeout = shutil.which('timeout')
        self.assertIsNotNone(real_timeout, 'GNU timeout is required for bounded process cleanup controls')
        timeout_shim = shims / 'timeout'
        timeout_shim.write_text(f'''#!{sys.executable}
import json, os, sys
from pathlib import Path
assert sys.argv[1:3] == ['--kill-after=5s', '135s'], sys.argv
assert sys.argv[3:] == ['python3', 'start-android-raster-profile.py', '--output', 'late-profile-evidence'], sys.argv
Path('timeout-argv.json').write_text(json.dumps(sys.argv[1:]))
if os.environ.get('TEST_FAILURE') == 'timeout-launch': sys.exit(127)
args = sys.argv[1:]
if os.environ.get('TEST_FAILURE') == 'timeout': args = ['--kill-after=1s', '0.2s'] + args[2:]
os.execv({real_timeout!r}, [{real_timeout!r}] + args)
''')
        timeout_shim.chmod(0o755)
        real_tee = shutil.which('tee')
        tee_shim = shims / 'tee'
        tee_shim.write_text(f'''#!{sys.executable}
import os, sys
if os.environ.get('TEST_FAILURE') == 'tee':
    sys.stdin.read()
    sys.exit(17)
os.execv({real_tee!r}, [{real_tee!r}] + sys.argv[1:])
''')
        tee_shim.chmod(0o755)
        return dict(os.environ, PATH=str(shims) + os.pathsep + os.environ['PATH'],
                    TEST_NATIVE_EXIT=str(native_exit), TEST_PROFILE_EXIT=str(profile_exit),
                    TEST_FAILURE=failure, TEST_WAIT='1' if failure in ('timeout', 'cancel') else '0')

    def run_wrapper(self, native_exit, profile_exit=0, failure=''):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            env = self.prepare(work, native_exit, profile_exit, failure)
            result = subprocess.run(['bash', WRAPPER.name], cwd=work, env=env,
                                    capture_output=True, text=True, timeout=6)
            self.assertTrue((work / 'original-probe-ran').is_file(),
                            f'Collector failure {failure!r} skipped the original probe: {result.stderr}')
            self.assertEqual((work / 'original-probe-exit').read_text(), str(native_exit))
            exits = work / 'late-profile-exits.txt'
            report = dict(line.split('=', 1) for line in exits.read_text().splitlines()) if exits.is_file() else None
            if failure != 'log-io':
                argv = json.loads((work / 'timeout-argv.json').read_text())
                self.assertEqual(argv[:2], ['--kill-after=5s', '135s'])
            if failure not in ('log-io', 'timeout-launch'):
                self.assertEqual(json.loads((work / 'helper-argv.json').read_text()),
                                 ['--output', 'late-profile-evidence'])
            if failure == 'timeout':
                self.assertEqual((work / 'helper-stopped').read_text(), str(signal.SIGTERM))
            return result, report

    def test_original_native_verdict_has_priority_over_helper_result(self):
        for native_exit in (0, 23):
            for profile_exit in (0, 42):
                with self.subTest(native=native_exit, profile=profile_exit):
                    result, report = self.run_wrapper(native_exit, profile_exit)
                    self.assertEqual(result.returncode, native_exit or (42 if profile_exit else 0), result.stderr)
                    self.assertEqual(report, {'original_probe_exit': str(native_exit),
                                              'profile_collection_exit': str(profile_exit)})

    def test_helper_timeout_and_launch_failure_preserve_native_failure(self):
        for native_exit in (0, 23):
            for failure, helper_code in [('timeout', 124), ('timeout-launch', 127)]:
                with self.subTest(native=native_exit, failure=failure):
                    result, report = self.run_wrapper(native_exit, failure=failure)
                    self.assertEqual(result.returncode, native_exit or 42, result.stderr)
                    self.assertEqual(report, {'original_probe_exit': str(native_exit),
                                              'profile_collection_exit': str(helper_code)})

    def test_collector_output_and_report_failures_cannot_skip_or_replace_native_result(self):
        for native_exit in (0, 23):
            for failure in ('mkdir', 'log-io', 'report-io', 'tee'):
                with self.subTest(native=native_exit, failure=failure):
                    result, report = self.run_wrapper(native_exit, failure=failure)
                    self.assertEqual(result.returncode, native_exit or 42, result.stderr)
                    if report is not None:
                        self.assertEqual(report['original_probe_exit'], str(native_exit))
                        if failure in ('mkdir', 'log-io', 'report-io'):
                            self.assertNotEqual(report['profile_collection_exit'], '0')

    def test_cancellation_cleans_helper_and_preserves_known_native_failure(self):
        for native_exit in (0, 23):
            for signum in (signal.SIGINT, signal.SIGTERM):
                with self.subTest(native=native_exit, signal=signum):
                    with tempfile.TemporaryDirectory() as temporary:
                        work = Path(temporary)
                        env = self.prepare(work, native_exit, failure='cancel')
                        process = subprocess.Popen(['bash', WRAPPER.name], cwd=work, env=env,
                                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                                   text=True, start_new_session=True)
                        try:
                            deadline = time.monotonic() + 3
                            while not ((work / 'helper-ready').exists() and (work / 'original-probe-exit').exists()):
                                self.assertIsNone(process.poll(), 'Wrapper exited before cancellation control was ready')
                                self.assertLess(time.monotonic(), deadline, 'Fixture startup exceeded bound')
                                time.sleep(0.01)
                            # Allow shell to enter its wait builtin after original probe returned.
                            time.sleep(0.05)
                            process.send_signal(signum)
                            stdout, stderr = process.communicate(timeout=3)
                            self.assertEqual(process.returncode, native_exit or (128 + signum), (stdout, stderr))
                            self.assertEqual((work / 'helper-stopped').read_text(), str(signal.SIGTERM))
                            self.assertFalse((work / 'helper-completed').exists())
                        finally:
                            if process.poll() is None:
                                os.killpg(process.pid, signal.SIGKILL)
                                process.communicate(timeout=2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
