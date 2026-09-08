#!/usr/bin/env python3
"""Exercise the bounded collector using synthetic SDK files and owned children."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import unittest
from unittest.mock import patch


MODULE = Path(__file__).parent / 'qa/check-emulator-trace-capabilities.py'
SPEC = importlib.util.spec_from_file_location('capabilities', MODULE)
CAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAP)
SHA = 'a' * 40
TREE = 'b' * 40


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sdk = self.root / 'sdk'
        package = self.sdk / 'emulator'
        package.mkdir(parents=True)
        self.binary = package / 'emulator'
        self.binary.write_text('#!/bin/sh\nexit 0\n')
        self.binary.chmod(0o755)
        (package / 'source.properties').write_text('Pkg.Revision=37.1.11\n')
        (package / 'package.xml').write_text('<sdk-repository/>\n')
        self.output = self.root / 'output'
        self.env = patch.dict(os.environ, {'ANDROID_HOME': str(self.sdk),
                              'ANDROID_SDK_ROOT': str(self.sdk), 'GITHUB_SHA': SHA})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.calls = []
        self.version = 'Android emulator version 37.1.11.0 (build_id 15917651)\n'
        self.fail_command = None
        self.timeout_command = None

    def fake_command(self, output, name, argv, timeout=10, cwd=None):
        self.calls.append(argv)
        data = (SHA + '\n' + TREE + '\n') if name == 'git-identity' else self.version if name == 'emulator-version' else ''
        stdout = output / (name + '.stdout')
        stderr = output / (name + '.stderr')
        stdout.write_text(data)
        stderr.write_text('')
        return {'returncode': 1 if name == self.fail_command else 0,
                'timed_out': name == self.timeout_command, 'output_limit_exceeded': False,
                'stdout': {'file': stdout.name, **CAP.digest(stdout)},
                'stderr': {'file': stderr.name, **CAP.digest(stderr)}}

    def collect(self):
        with patch.object(CAP, 'run_command', self.fake_command):
            code = CAP.collect(self.output, self.root)
        return code, json.loads((self.output / 'status.json').read_text())

    def test_success_is_unvalidated_and_only_documented_commands(self):
        code, record = self.collect()
        self.assertEqual(code, 0)
        self.assertEqual(record['state'], 'CAPABILITIES_RECORDED_UNVALIDATED')
        self.assertEqual([call[1:] for call in self.calls if call[0] == str(self.binary)],
                         [['-version'], ['-help-all'], ['-help-debug-tags'], ['-help-environment']])
        self.assertEqual(record['tooling_sha'], SHA)
        self.assertEqual(record['tooling_tree_sha'], TREE)
        self.assertEqual(record['emulator']['sha256'], CAP.digest(self.binary)['sha256'])
        self.assertEqual((self.output / 'source.properties').read_bytes(),
                         (self.sdk / 'emulator/source.properties').read_bytes())

    def test_version_mismatch_stops_before_help(self):
        self.version = 'Android emulator version 37.1.12.0 (build_id 15917651)\n'
        code, record = self.collect()
        self.assertEqual(code, 42)
        self.assertEqual(record['reason'], 'EMULATOR_VERSION_OR_BUILD_MISMATCH')
        self.assertEqual(len(self.calls), 3)

    def test_build_mismatch_stops_before_help(self):
        self.version = self.version.replace('15917651', '15917652')
        self.assertEqual(self.collect()[0], 42)
        self.assertEqual(len(self.calls), 3)

    def test_repeated_identical_version_is_accepted(self):
        self.version *= 2
        self.assertEqual(self.collect()[0], 0)

    def test_conflicting_version_is_incomplete(self):
        self.version += self.version.replace('15917651', '15917652')
        self.assertEqual(self.collect()[0], 42)

    def test_fixed_marker_scan_handles_chunk_boundaries_and_missing_files(self):
        data = b'x' * 19 + b'VPERFETTO_TRACE_ENABLED' + b'\0Saving host trace first\0'
        self.binary.write_bytes(data)
        inventory = CAP.binary_markers(self.sdk, chunk_size=20)
        self.assertEqual(inventory['interpretation'], 'LITERAL_PRESENCE_ONLY')
        present, *missing = inventory['files']
        self.assertEqual(present['sha256'], CAP.digest(self.binary)['sha256'])
        self.assertTrue(present['literal_presence']['VPERFETTO_TRACE_ENABLED'])
        self.assertTrue(present['literal_presence']['Saving host trace first'])
        self.assertFalse(present['literal_presence']['ANDROID_EMU_TRACING'])
        self.assertEqual([row['presence'] for row in missing], ['MISSING'] * 4)
        self.assertTrue(all('sha256' not in row for row in missing))

    def test_marker_scan_refuses_size_limit(self):
        with patch.object(CAP, 'MAX_BINARY', 1):
            with self.assertRaisesRegex(CAP.Incomplete, 'SDK_BINARY_SIZE_LIMIT'):
                CAP.binary_markers(self.sdk)

    def test_marker_scan_refuses_library_symlink_escape(self):
        external = self.root / 'external-library'
        external.write_bytes(b'VPERFETTO_TRACE_ENABLED')
        library = self.sdk / CAP.BINARY_PATHS[-1]
        library.parent.mkdir()
        library.symlink_to(external)
        with self.assertRaisesRegex(CAP.Incomplete, 'SDK_BINARY_ESCAPES_ROOT'):
            CAP.binary_markers(self.sdk)

    def test_package_version_mismatch_does_not_invoke_emulator(self):
        (self.sdk / 'emulator/source.properties').write_text('Pkg.Revision=37.1.12\n')
        code, record = self.collect()
        self.assertEqual(code, 42)
        self.assertEqual(record['reason'], 'SDK_PACKAGE_VERSION_MISMATCH')
        self.assertEqual(len(self.calls), 2)

    def test_sha_mismatch_does_not_invoke_emulator(self):
        with patch.dict(os.environ, {'GITHUB_SHA': 'c' * 40}):
            code, record = self.collect()
        self.assertEqual(code, 42)
        self.assertEqual(record['reason'], 'GITHUB_SHA_MISSING_OR_MISMATCH')
        self.assertEqual(len(self.calls), 1)

    def test_tracked_dirty_bytes_fail(self):
        self.fail_command = 'git-tracked-state'
        self.assertEqual(self.collect()[1]['reason'], 'TOOLING_TRACKED_BYTES_CHANGED')

    def test_conflicting_sdk_roots_fail(self):
        with patch.dict(os.environ, {'ANDROID_HOME': str(self.root / 'other')}):
            self.assertEqual(self.collect()[1]['reason'], 'SDK_ENVIRONMENT_CONFLICT')

    def test_symlink_escape_fails(self):
        external = self.root / 'external'
        self.binary.rename(external)
        self.binary.symlink_to(external)
        self.assertEqual(self.collect()[1]['reason'], 'SDK_EMULATOR_EXECUTABLE_INVALID')

    def test_help_failure_is_not_success(self):
        self.fail_command = 'emulator-help-all'
        code, record = self.collect()
        self.assertEqual(code, 42)
        self.assertEqual(record['reason'], 'EMULATOR_COMMAND_FAILED:help-all')
        self.assertEqual(len(self.calls), 4)

    def test_help_timeout_is_not_success(self):
        self.timeout_command = 'emulator-help-debug-tags'
        self.assertEqual(self.collect()[0], 42)
        self.assertEqual(len(self.calls), 5)

    def test_evidence_is_not_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / 'sentinel'
        sentinel.write_text('keep')
        with self.assertRaises(FileExistsError):
            self.collect()
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_cancellation_is_recorded(self):
        with patch.object(CAP, 'run_command', side_effect=SystemExit(143)):
            with self.assertRaises(SystemExit):
                CAP.collect(self.output, self.root)
        record = json.loads((self.output / 'status.json').read_text())
        self.assertEqual((record['reason'], record['exit_code']), ('CANCELLED', 143))


class CommandTests(unittest.TestCase):
    def run_fixture(self, code, timeout=2):
        with tempfile.TemporaryDirectory() as name:
            path = Path(name)
            result = CAP.run_command(path, 'fixture', [sys.executable, '-c', code], timeout=timeout)
            return result, (path / 'fixture.stdout').read_bytes(), (path / 'fixture.stderr').read_bytes()

    def test_raw_streams_and_nonzero_preserved(self):
        result, out, err = self.run_fixture('import os; os.write(1,b"out\\x00"); os.write(2,b"err"); raise SystemExit(23)')
        self.assertEqual((result['returncode'], out, err), (23, b'out\x00', b'err'))
        self.assertFalse(result['timed_out'])

    def test_timeout_kills_owned_process_group(self):
        result, _, _ = self.run_fixture('import time; time.sleep(30)', timeout=0.1)
        self.assertTrue(result['timed_out'])
        self.assertEqual(result['returncode'], -signal.SIGTERM)

    def test_output_flood_is_bounded_and_failed(self):
        with patch.object(CAP, 'MAX_OUTPUT', 4096):
            result, out, _ = self.run_fixture('import os; os.write(1,b"x"*200000)')
        self.assertTrue(result['output_limit_exceeded'])
        self.assertEqual(len(out), 4096)
        self.assertFalse(CAP.good(result))

    def test_missing_executable_records_evidence(self):
        with tempfile.TemporaryDirectory() as name:
            result = CAP.run_command(Path(name), 'missing', ['/nonexistent/robys-emulator'])
        self.assertEqual(result['execution_error'], 'FileNotFoundError')
        self.assertFalse(CAP.good(result))

    def test_outliving_child_does_not_hold_pipe_forever(self):
        result, _, _ = self.run_fixture(
            'import subprocess,sys; subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"])',
            timeout=0.1)
        self.assertTrue(result['timed_out'])


if __name__ == '__main__':
    unittest.main()
