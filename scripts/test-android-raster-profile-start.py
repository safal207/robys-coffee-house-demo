#!/usr/bin/env python3
"""Exercise real observer subprocess boundaries with a bounded fake ADB stream."""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/qa/start-android-raster-profile.py'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


observer = load('late_profile_observer', HELPER)
config_parser = load('raster_config_parser', ROOT / 'scripts/test-android-raster-callstack.py')
SOURCE = '6592c51a1bd5812e3ae85ed6c83c53effafc7050'
FAKE_ADB = r'''#!/usr/bin/env python3
import json,os,sys,time
from pathlib import Path
mode=os.environ['PROFILE_TEST_MODE']
args=sys.argv[1:]
with Path('adb-calls.jsonl').open('a') as output:
    output.write(json.dumps(args)+'\n')
if args==['logcat','-v','threadtime','-s','RobysHandoff:D','*:S']:
    if mode=='log-failure':
        print('synthetic log failure',file=sys.stderr)
        sys.exit(17)
    print('09-08 13:05:43.734  777  777 D RobysHandoff: WEB_COMMITTED',flush=True)
    if mode=='no-marker':sys.exit(0)
    if mode=='marker-timeout':time.sleep(10)
    pid={'pid-leading-zero':'00123','pid-zero':'0','pid-negative':'-3','pid-too-large':'2147483648'}.get(mode,'123')
    if mode=='first-foreign':
        print('09-08 13:05:43.735  999  999 D RobysHandoff: NATIVE_SURFACE',flush=True)
    print(f'09-08 13:05:43.736  {pid}  123 D RobysHandoff: NATIVE_SURFACE',flush=True)
    time.sleep(10)
elif args[:2]==['exec-out','cat']:
    if mode=='proc-failure':sys.exit(13)
    if mode=='proc-timeout':time.sleep(10)
    value=b'com.robys.coffeehouse.debug\0\0'
    if mode=='wrong-name':value=b'com.robys.coffeehouse.debug.evil\0'
    if mode=='renderer-name':value=b'com.robys.coffeehouse.debug:renderer\0'
    if mode=='extra-argument':value=b'com.robys.coffeehouse.debug\0unexpected\0'
    if mode=='first-foreign' and args[-1]=='/proc/999/cmdline':value=b'system_server\0'
    sys.stdout.buffer.write(value)
elif args[:2]==['shell','perfetto']:
    Path('config-received.pbtx').write_bytes(sys.stdin.buffer.read())
    if mode=='profile-timeout':time.sleep(10)
    if mode in ('profile-failure','profile-and-pull-failure'):
        print('synthetic profile failure',file=sys.stderr)
        sys.exit(7)
    print('synthetic foreground profile closed')
elif args[0]=='pull':
    if mode in ('pull-failure','profile-and-pull-failure'):sys.exit(9)
    if mode=='pull-timeout':time.sleep(10)
    if mode!='missing-file':
        Path(args[-1]).write_bytes(b'' if mode=='empty-file' else b'raw synthetic trace; no sample availability claim')
else:
    raise AssertionError(args)
'''


@contextlib.contextmanager
def environment(directory, mode, executable_dir):
    cwd, old_mode, old_path = Path.cwd(), os.environ.get('PROFILE_TEST_MODE'), os.environ.get('PATH', '')
    os.chdir(directory)
    os.environ['PROFILE_TEST_MODE'] = mode
    os.environ['PATH'] = str(executable_dir) + os.pathsep + old_path
    try:
        yield
    finally:
        os.chdir(cwd)
        os.environ['PATH'] = old_path
        if old_mode is None:
            os.environ.pop('PROFILE_TEST_MODE', None)
        else:
            os.environ['PROFILE_TEST_MODE'] = old_mode


def assert_scope(config, pid):
    parsed = config_parser.parse_fields(config.decode())
    assert set(parsed) == {'duration_ms', 'buffers', 'data_sources'}
    assert parsed['duration_ms'] == ['45000']
    assert parsed['buffers'] == [{'size_kb': ['16384'], 'fill_policy': ['DISCARD']}]
    assert len(parsed['data_sources']) == 1
    source = parsed['data_sources'][0]
    assert set(source) == {'config'} and len(source['config']) == 1
    source = source['config'][0]
    assert set(source) == {'name', 'target_buffer', 'perf_event_config'}
    assert source['name'] == ['"linux.perf"'] and source['target_buffer'] == ['0']
    perf = source['perf_event_config'][0]
    assert set(perf) == {'timebase', 'callstack_sampling'}
    assert perf['timebase'] == [{'counter': ['SW_CPU_CLOCK'], 'frequency': ['80'], 'timestamp_clock': ['PERF_CLOCK_MONOTONIC']}]
    assert perf['callstack_sampling'] == [{'scope': [{'target_pid': [str(pid)]}],
                                        'kernel_frames': ['false'], 'user_frames': ['UNWIND_DWARF']}]


def main():
    limits = observer.Limits(marker=0.15, identity=0.15, profile=0.15, pull=0.15, stop=0.15)
    assert observer.Limits() == observer.Limits(marker=60, identity=8, profile=65, pull=15, stop=2)
    cases = [
        ('success', 0, None, None),
        ('pid-leading-zero', 42, 'native-marker', None),
        ('pid-zero', 42, 'native-marker', None),
        ('pid-negative', 42, 'native-marker', None),
        ('pid-too-large', 42, 'native-marker', None),
        ('first-foreign', 42, 'process-identity', None),
        ('wrong-name', 42, 'process-identity', None),
        ('renderer-name', 42, 'process-identity', None),
        ('extra-argument', 42, 'process-identity', None),
        ('proc-failure', 42, 'process-identity', 13),
        ('proc-timeout', 42, 'process-identity', 124),
        ('marker-timeout', 42, 'native-marker', 124),
        ('no-marker', 42, 'native-marker', 0),
        ('log-failure', 42, 'native-marker', 17),
        ('profile-failure', 42, 'perfetto', 7),
        ('profile-timeout', 42, 'perfetto', 124),
        ('pull-failure', 42, 'pull', 9),
        ('pull-timeout', 42, 'pull', 124),
        ('profile-and-pull-failure', 42, 'perfetto', 7),
        ('empty-file', 42, 'trace-file', None),
        ('missing-file', 42, 'trace-file', None),
    ]
    with tempfile.TemporaryDirectory(prefix='robys-late-raster-start-') as temporary:
        root = Path(temporary)
        executable_dir = root / 'bin'
        executable_dir.mkdir()
        adb = executable_dir / 'adb'
        adb.write_text(FAKE_ADB)
        adb.chmod(0o755)
        for mode, expected_exit, failure_stage, failure_code in cases:
            directory = root / mode
            directory.mkdir()
            (directory / 'fixture-manifest.json').write_text(json.dumps({'source_sha': SOURCE}))
            (directory / 'diagnostic-tooling.sha').write_text('6' * 40 + '\n')
            original = {'trace-evidence/config.pbtx': b'original sixty-second trace configuration\n',
                        'capture.sh': b'original native capture assertions\n'}
            for name, content in original.items():
                path = directory / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            with environment(directory, mode, executable_dir), open(os.devnull, 'w') as quiet, contextlib.redirect_stderr(quiet):
                result = observer.run('late-profile-evidence', limits)
            assert result == expected_exit, mode
            evidence = directory / 'late-profile-evidence'
            record = json.loads((evidence / 'status.json').read_bytes())
            assert record['stack_validation'] == 'NOT_RUN', mode
            assert record['fixture']['source_sha'] == SOURCE, mode
            calls = [json.loads(line) for line in (directory / 'adb-calls.jsonl').read_text().splitlines()]
            assert calls[0] == ['logcat', '-v', 'threadtime', '-s', 'RobysHandoff:D', '*:S'], mode
            for name, content in original.items():
                assert (directory / name).read_bytes() == content, (mode, name)
            if expected_exit == 0:
                assert record['state'] == 'COLLECTED_UNVALIDATED', mode
                assert record['pid'] == 123 and record['marker']['raw_pid'] == '123', mode
                assert record['process_identity']['verified'], mode
                assert calls[1] == ['exec-out', 'cat', '/proc/123/cmdline'], mode
                assert calls[2] == ['shell', 'perfetto', '--txt', '-c', '-', '-o', observer.DEVICE_TRACE], mode
                assert calls[3][0:3] == ['pull', observer.DEVICE_TRACE, str(evidence / 'profile.pftrace')], mode
                config = (evidence / 'config.pbtx').read_bytes()
                assert_scope(config, 123)
                assert config == (directory / 'config-received.pbtx').read_bytes(), mode
                assert record['config_sha256'] == observer.sha(config), mode
                assert record['trace_sha256'] == observer.sha((evidence / 'profile.pftrace').read_bytes()), mode
            else:
                assert record['state'] == 'INCOMPLETE' and record['exit_code'] == 42, mode
                assert record['failure']['stage'] == failure_stage, (mode, record)
                assert record['failure']['returncode'] == failure_code, (mode, record)
                if failure_stage in ('native-marker', 'process-identity'):
                    assert not any(call[:2] == ['shell', 'perfetto'] for call in calls), mode
                    assert not (evidence / 'config.pbtx').exists(), mode
            if mode == 'first-foreign':
                assert record['pid'] == 999 and calls[1][-1] == '/proc/999/cmdline'
            if mode == 'profile-and-pull-failure':
                assert record['secondary_failure']['stage'] == 'pull' and record['secondary_failure']['returncode'] == 9
            print('PASS ' + mode)
        # Verify the actual CLI uses the same fixed contract, without test timeout options.
        cli = root / 'cli'
        cli.mkdir()
        (cli / 'fixture-manifest.json').write_text(json.dumps({'source_sha': SOURCE}))
        (cli / 'diagnostic-tooling.sha').write_text('6' * 40 + '\n')
        with environment(cli, 'success', executable_dir):
            completed = subprocess.run([sys.executable, str(HELPER), '--output', 'evidence'], capture_output=True, text=True, timeout=10)
        assert completed.returncode == 0, completed.stderr
        assert_scope((cli / 'evidence/config.pbtx').read_bytes(), 123)
        status_before = (cli / 'evidence/status.json').read_bytes()
        with environment(cli, 'success', executable_dir), open(os.devnull, 'w') as quiet, contextlib.redirect_stderr(quiet):
            assert observer.run('evidence', limits) == 42
        assert (cli / 'evidence/status.json').read_bytes() == status_before
        print('PASS actual CLI fixed configuration and existing-evidence rejection')
    print(f'Late raster start: {len(cases) + 1}/{len(cases) + 1} controls PASS; no real device samples or native verdict tested.')


if __name__ == '__main__':
    main()
