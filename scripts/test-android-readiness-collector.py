#!/usr/bin/env python3
"""Synthetic delayed-export evidence and wrapper failure propagation controls."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / 'scripts/qa/verify-android-readiness-export.py'
WRAPPER = ROOT / 'scripts/qa/run-android-readiness-probe.sh'


def valid_record():
    """A genuinely pending preparation is valid observation, not native success."""
    return {
        'schema': 'robys.android.readiness-export.v1',
        'state': 'captured', 'error': None, 'export_after_ms': 55000,
        'start_elapsed_ns': 10_000_000_000,
        'request_elapsed_ns': 65_000_000_000,
        'callback_elapsed_ns': 65_001_000_000,
        'written_elapsed_ns': 65_002_000_000,
        'start_uptime_ms': 10000, 'request_uptime_ms': 65000,
        'written_uptime_ms': 65002,
        'start_wall_ms': 1788854410000, 'request_wall_ms': 1788854465000,
        'written_wall_ms': 1788854465002,
        'payload': {
            'href': 'https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff&handoff-gen=1',
            'now_ms': 55001, 'time_origin_ms': 1788854410000,
            'snapshot': {
                'schema': 'robys.android.readiness.v1',
                'timeOriginMs': 1788854410000, 'dropped': 0,
                'events': [
                    {'phase': 'bootstrap', 'atMs': 0},
                    {'phase': 'module-evaluated', 'atMs': 1},
                    {'phase': 'state', 'atMs': 1, 'detail': 'loading'},
                    {'phase': 'dom-wait', 'atMs': 2},
                ],
            },
        },
    }


def set_path(record, path, value):
    cursor = record
    for key in path[:-1]:
        cursor = cursor[key]
    cursor[path[-1]] = value


class ExportEvidenceTests(unittest.TestCase):
    def verify(self, record=None, raw=None, missing=False):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            if not missing:
                data = raw if raw is not None else json.dumps(record).encode()
                (directory / 'readiness-observation.json').write_bytes(data)
            # A failed invocation must replace a previous successful report.
            (directory / 'verification.json').write_text('{"observation_valid":true,"stale":true}')
            result = subprocess.run([sys.executable, str(VALIDATOR), str(directory)],
                                    capture_output=True, text=True, timeout=10)
            report = json.loads((directory / 'verification.json').read_text())
            self.assertNotIn('stale', report)
            self.assertIn('does not change the original native verdict', report['claim_boundary'])
            self.assertEqual(report['observation_valid'], result.returncode == 0)
            return result, report

    def assert_invalid(self, record=None, raw=None, missing=False):
        result, report = self.verify(record, raw, missing)
        self.assertEqual(result.returncode, 42, (result.stdout, result.stderr))
        self.assertFalse(report['observation_valid'])
        self.assertIn('error', report)

    def test_pending_phase_is_valid_without_synthesizing_ready(self):
        record = valid_record()
        result, report = self.verify(record)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(report['events'], 4)
        self.assertEqual(report['generation'], 1)
        self.assertEqual(report['native_export_round_trip_ms'], 1)
        self.assertNotIn('ready', report['phases'])
        self.assertNotIn('native_pass', report)
        self.assertEqual(report['phases'], [item['phase'] for item in record['payload']['snapshot']['events']])

    def test_actual_recorder_string_and_primitive_boundaries(self):
        # JS String.slice bounds UTF-16 code units, not Python code points.
        accepted = [('ascii-detail', 'd' * 160), ('unicode-detail', '\U0001f600' * 80),
                    ('split-surrogate', '\U0001f600' * 79 + '\ud83d'),
                    ('number-detail', 128)]
        for name, detail in accepted:
            with self.subTest(name=name):
                record = valid_record()
                record['payload']['snapshot']['events'][-1]['detail'] = detail
                result, _ = self.verify(record)
                self.assertEqual(result.returncode, 0, (name, result.stdout, result.stderr))
        for name, detail in [('ascii-overflow', 'd' * 161), ('unicode-overflow', '\U0001f600' * 81),
                             ('object', {'nested': 'fixture'}), ('list', []), ('boolean', True),
                             ('null', None), ('infinity', float('inf'))]:
            with self.subTest(name=name):
                record = valid_record()
                record['payload']['snapshot']['events'][-1]['detail'] = detail
                self.assert_invalid(record)
        for name, phase, expected in [('ascii-phase', 'p' * 80, 0),
                                      ('unicode-phase', '\U0001f600' * 40, 0),
                                      ('ascii-phase-overflow', 'p' * 81, 42),
                                      ('unicode-phase-overflow', '\U0001f600' * 41, 42)]:
            with self.subTest(name=name):
                record = valid_record()
                record['payload']['snapshot']['events'].append({'phase': phase, 'atMs': 3})
                result, _ = self.verify(record)
                self.assertEqual(result.returncode, expected, (result.stdout, result.stderr))

    def test_missing_truncated_and_invalid_export(self):
        self.assert_invalid(missing=True)
        self.assert_invalid(raw=b'{"schema":')
        self.assert_invalid(raw=b'null')
        self.assert_invalid(raw=b'[]')
        for field in ['payload', 'state', 'request_elapsed_ns', 'start_uptime_ms']:
            with self.subTest(field=field):
                record = valid_record()
                del record[field]
                self.assert_invalid(record)

    def test_snapshot_and_native_failure_controls(self):
        mutations = [
            ('destroyed', ('state',), 'destroyed'),
            ('missing-state', ('state',), 'missing'),
            ('export-error', ('error',), 'FixtureFailure'),
            ('wrong-export-schema', ('schema',), 'different'),
            ('missing-snapshot', ('payload', 'snapshot'), None),
            ('wrong-snapshot-schema', ('payload', 'snapshot', 'schema'), 'different'),
            ('dropped-events', ('payload', 'snapshot', 'dropped'), 1),
            ('dropped-bool', ('payload', 'snapshot', 'dropped'), False),
            ('dropped-float', ('payload', 'snapshot', 'dropped'), 0.0),
            ('empty-events', ('payload', 'snapshot', 'events'), []),
            ('null-events', ('payload', 'snapshot', 'events'), None),
            ('missing-startup', ('payload', 'snapshot', 'events'), [{'phase': 'state', 'atMs': 0, 'detail': 'ready'}]),
            ('wrong-origin', ('payload', 'time_origin_ms'), 1788854409999),
            ('boolean-origin', ('payload', 'time_origin_ms'), True),
            ('no-origin', ('payload', 'snapshot', 'timeOriginMs'), None),
            ('nan-origin', ('payload', 'snapshot', 'timeOriginMs'), float('nan')),
            ('negative-export-clock', ('payload', 'now_ms'), -1),
            ('boolean-export-clock', ('payload', 'now_ms'), True),
        ]
        for name, path, value in mutations:
            with self.subTest(name=name):
                record = valid_record()
                set_path(record, path, value)
                self.assert_invalid(record)
        record = valid_record()
        record['payload']['snapshot']['events'] += [{'phase': 'fixture', 'atMs': 3}] * 125
        self.assert_invalid(record)
        record = valid_record()
        record['payload']['snapshot']['events'][0]['extra'] = 'unexpected'
        self.assert_invalid(record)

    def test_clock_delay_and_order_controls(self):
        mutations = [
            ('retimed-export', ('export_after_ms',), 54000),
            ('early-elapsed', ('request_elapsed_ns',), 64_999_999_999),
            ('early-uptime', ('request_uptime_ms',), 64999),
            ('negative-start-uptime', ('start_uptime_ms',), -1),
            ('boolean-start-uptime', ('start_uptime_ms',), False),
            ('infinite-request-uptime', ('request_uptime_ms',), float('inf')),
            ('native-reversal', ('callback_elapsed_ns',), 64_000_000_000),
            ('native-write-reversal', ('written_elapsed_ns',), 65_000_000_000),
            ('boolean-native-clock', ('start_elapsed_ns',), True),
            ('negative-event-clock', ('payload', 'snapshot', 'events', 0, 'atMs'), -0.5),
            ('reversed-event-clock', ('payload', 'snapshot', 'events', 3, 'atMs'), 0.5),
            ('future-event-clock', ('payload', 'snapshot', 'events', 3, 'atMs'), 55002),
            ('boolean-event-clock', ('payload', 'snapshot', 'events', 3, 'atMs'), True),
        ]
        for name, path, value in mutations:
            with self.subTest(name=name):
                record = valid_record()
                set_path(record, path, value)
                self.assert_invalid(record)

    def test_first_launch_url_and_generation_binding(self):
        base = 'https://safal207.github.io/robys-coffee-house-demo/'
        invalid_urls = [
            base.replace('https:', 'http:') + '?entry=android-handoff&handoff-gen=1',
            base.replace('safal207.github.io', 'example.org') + '?entry=android-handoff&handoff-gen=1',
            base.replace('/robys-coffee-house-demo/', '/another/') + '?entry=android-handoff&handoff-gen=1',
            base + '?entry=off&handoff-gen=1',
            base + '?handoff-gen=1',
            base + '?entry=android-handoff&entry=android-handoff&handoff-gen=1',
            base + '?entry=android-handoff',
        ]
        invalid_urls += [base + '?entry=android-handoff&handoff-gen=' + generation
                         for generation in ['0', '2', '-1', '01', '+1', '1.0', '1e0', '\u0661', '2147483648', '1&handoff-gen=1']]
        for href in invalid_urls:
            with self.subTest(href=href):
                record = valid_record()
                record['payload']['href'] = href
                self.assert_invalid(record)


class WrapperVerdictTests(unittest.TestCase):
    def run_wrapper(self, native_exit, failure=None, invalid=False):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            shutil.copyfile(VALIDATOR, work / VALIDATOR.name)
            shutil.copyfile(WRAPPER, work / WRAPPER.name)
            (work / 'run-android-rendering-probe.sh').write_text(
                f'#!/bin/bash\nprintf ran > original-probe-ran\nexit {native_exit}\n')
            record = valid_record()
            if invalid:
                record['payload']['snapshot']['dropped'] = 1
            device = work / 'device-files'
            device.mkdir()
            (device / 'readiness-observation.json').write_text(json.dumps(record))
            evidence = work / 'readiness-evidence'
            evidence.mkdir()
            (evidence / 'verification.json').write_text('{"observation_valid":true,"stale":true}')
            if failure == 'output-io':
                (evidence / 'readiness-observation.json').mkdir()
            shims = work / 'bin'
            shims.mkdir()
            adb = shims / 'adb'
            adb.write_text(f'''#!{sys.executable}
import os,sys
from pathlib import Path
assert sys.argv[1:] == ['exec-out','run-as','com.robys.coffeehouse.debug','cat','files/readiness-observation.json'], sys.argv
failure=os.environ.get('TEST_FAILURE')
if failure=='pull':sys.exit(11)
if failure=='truncated':sys.stdout.write('{{"schema":');sys.exit(0)
sys.stdout.buffer.write((Path('device-files')/'readiness-observation.json').read_bytes())
''')
            adb.chmod(0o755)
            # Preserve the actual timeout argv, avoiding any real 15-second wait.
            timeout = shims / 'timeout'
            timeout.write_text(f'''#!{sys.executable}
import os,sys
assert sys.argv[1]=='15s',sys.argv
if os.environ.get('TEST_FAILURE')=='timeout':sys.exit(124)
os.execvp(sys.argv[2],sys.argv[2:])
''')
            timeout.chmod(0o755)
            for command, token, code in [('tee', 'tee', 17), ('mkdir', 'mkdir', 18),
                                         ('python3', 'report', 19), ('rm', 'rm', 20)]:
                real = sys.executable if command == 'python3' else shutil.which(command)
                shim = shims / command
                shim.write_text(f'''#!{sys.executable}
import os,sys
if os.environ.get('TEST_FAILURE')=={token!r}:sys.exit({code})
os.execv({real!r},[{real!r}]+sys.argv[1:])
''')
                shim.chmod(0o755)
            env = dict(os.environ, PATH=str(shims) + os.pathsep + os.environ['PATH'],
                       TEST_FAILURE=failure or '')
            result = subprocess.run(['bash', WRAPPER.name], cwd=work, env=env,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual((work / 'original-probe-ran').read_text(), 'ran')
            report_path = evidence / 'verification.json'
            if failure != 'rm' and report_path.exists():
                self.assertNotIn('stale', json.loads(report_path.read_text()))
            exits_path = evidence / 'exits.txt'
            if failure not in ('mkdir', 'rm', 'tee'):
                exits = dict(line.split('=', 1) for line in exits_path.read_text().splitlines())
                self.assertEqual(exits['original_probe_exit'], str(native_exit))
                if failure == 'pull':
                    self.assertEqual(exits['pull_exit'], '11')
                if failure == 'timeout':
                    self.assertEqual(exits['pull_exit'], '124')
                if failure == 'report':
                    self.assertEqual(exits['observation_exit'], '19')
            return result

    def test_original_verdict_has_priority_over_all_observer_failures(self):
        for native_exit in [0, 23]:
            for failure in [None, 'pull', 'truncated', 'timeout', 'report', 'tee', 'mkdir', 'rm', 'output-io']:
                with self.subTest(native=native_exit, failure=failure):
                    result = self.run_wrapper(native_exit, failure)
                    expected = native_exit if native_exit else (42 if failure else 0)
                    self.assertEqual(result.returncode, expected, (result.stdout, result.stderr))
            with self.subTest(native=native_exit, failure='invalid-evidence'):
                result = self.run_wrapper(native_exit, invalid=True)
                self.assertEqual(result.returncode, native_exit or 42, (result.stdout, result.stderr))


if __name__ == '__main__':
    unittest.main(verbosity=2)
