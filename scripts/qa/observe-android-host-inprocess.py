#!/usr/bin/env python3
"""Bind an AEMU in-process trace; never adjudicate product or trace coverage."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time


EXPECTED = {
    'emulator/emulator': 'd430b26ab9806894b06d6a1d3750d8c8a5125300967b2bd87d76245541bc4ce1',
    'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless': '05ccc01317bf9cde47c943b470232636b416da05f1c5ea93183fe3dc89435c4f',
    'emulator/lib64/libandroid-emu-tracing.so': '1a7a5ebc1e16b31c12064d38daee32bb50e821378e173bc80dec9bfb2423d095',
    'emulator/lib64/libgfxstream_backend.so': 'fc9386749b288a6875c1da775071fd7b7ccd6c5af6180b2029215a6ca953f339',
}
ENGINE = 'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'
SUBJECT = '6592c51a1bd5812e3ae85ed6c83c53effafc7050'
WEB_DIGEST = '8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588'
LIMITS = ('Added startup observer; not unchanged-observer performance evidence. '
          'Trace scopes are not host CPU stacks. Buffer loss, clocks, relevant '
          'host events, request correlation and product verdict require analysis.')


def stamp():
    return {'host_monotonic_ns': time.monotonic_ns(),
            'host_utc': datetime.now(timezone.utc).isoformat()}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def read_json(path):
    require(path.is_file() and path.stat().st_size <= 2 * 1024 * 1024, 'JSON_INVALID:' + path.name)
    return json.loads(path.read_text())


def digest(path, limit):
    before = path.stat()
    require(path.is_file() and not path.is_symlink() and 0 < before.st_size <= limit,
            'FILE_TYPE_OR_SIZE:' + path.name)
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    after = path.stat()
    require((before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_ino, after.st_size, after.st_mtime_ns), 'FILE_CHANGED:' + path.name)
    return {'bytes': after.st_size, 'sha256': value.hexdigest()}


def package_binding(fixture):
    cap = read_json(fixture / 'emulator-capabilities/status.json')
    require(cap['state'] == 'CAPABILITIES_RECORDED_UNVALIDATED' and cap['exit_code'] == 0,
            'CAPABILITIES_INCOMPLETE')
    require(cap['reported_version'] in ('37.1.11', '37.1.11.0') and
            cap['reported_build'] == '15917651', 'PACKAGE_VERSION_MISMATCH')
    require(cap['tooling_sha'] == (fixture / 'diagnostic-tooling.sha').read_text().strip(),
            'TOOLING_BINDING_MISMATCH')
    sdk = Path(cap['sdk_root']).resolve(strict=True)
    rows = {row['sdk_relative_path']: row for row in cap['binary_markers']['files']}
    result = {}
    for relative, expected in EXPECTED.items():
        path = (sdk / relative).resolve(strict=True)
        require(path.is_relative_to(sdk), 'SDK_PATH_ESCAPE')
        require(rows[relative]['sha256'] == expected, 'PREFLIGHT_BINARY_MISMATCH:' + relative)
        value = digest(path, 512 * 1024 * 1024)
        require(value['sha256'] == expected, 'LIVE_BINARY_MISMATCH:' + relative)
        result[relative] = {'realpath': str(path), **value}
    return result


def process_identity(pid):
    proc = Path('/proc') / str(pid)
    try:
        raw = (proc / 'stat').read_text()
    except FileNotFoundError:
        return None
    tail = raw[raw.rfind(')') + 2:].split()
    require(len(tail) > 19, 'PROC_STAT_INVALID')
    return {'pid': pid, 'starttime_ticks': int(tail[19]), 'state': tail[0]}


def live_engine(expected):
    found = []
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            if os.readlink(proc / 'exe') != expected:
                continue
            row = process_identity(int(proc.name))
            if row is None:
                continue
            args = (proc / 'cmdline').read_bytes()
            require(len(args) <= 65536, 'PROCESS_ARGV_SIZE_LIMIT')
            argv = [item.decode('utf-8', errors='strict') for item in args.split(b'\0') if item]
            require('-no-window' in argv, 'HEADLESS_ARGUMENT_MISSING')
            after = process_identity(int(proc.name))
            require(after is not None and after['starttime_ticks'] == row['starttime_ticks'],
                    'ENGINE_PROCESS_CHANGED_DURING_BINDING')
            row.update(executable=expected, argv=argv)
            found.append(row)
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    require(len(found) == 1, 'EXACT_ENGINE_PROCESS_NOT_UNIQUE')
    return found[0]


def perform(mode, fixture, output, record):
    if mode == 'prepare':
        require(not (output / 'host.pftrace').exists(), 'PREEXISTING_HOST_TRACE')
        manifest = read_json(fixture / 'fixture-manifest.json')
        inventory = hashlib.sha256(json.dumps(manifest['files'], sort_keys=True,
                                              separators=(',', ':')).encode()).hexdigest()
        require(manifest['source_sha'] == SUBJECT and len(manifest['files']) == 241 and
                inventory == WEB_DIGEST, 'PINNED_SUBJECT_MISMATCH')
        record.update(source_sha=SUBJECT, web_inventory_sha256=inventory,
                      package=package_binding(fixture),
                      activation={'VPERFETTO_TRACE_ENABLED': '1',
                                  'VPERFETTO_HOST_FILE': str(output / 'host.pftrace')},
                      output_log=str(output / 'emulator.log'),
                      state='PREPARED_UNVALIDATED', exit_code=0)
    elif mode == 'bind':
        require(read_json(output / 'prepare.json')['state'] == 'PREPARED_UNVALIDATED',
                'PREPARATION_INCOMPLETE')
        require(os.environ.get('VPERFETTO_TRACE_ENABLED') == '1' and
                os.environ.get('VPERFETTO_HOST_FILE') == str(output / 'host.pftrace'),
                'ACTIVATION_ENVIRONMENT_MISMATCH')
        require(not os.environ.get('ANDROID_EMU_TRACING'), 'SECOND_OBSERVER_ENABLED')
        require(not os.environ.get('VPERFETTO_GUEST_FILE') and
                not os.environ.get('VPERFETTO_COMBINED_FILE'), 'COMBINED_TRACE_REQUESTED')
        package = package_binding(fixture)
        record.update(package=package, process=live_engine(package[ENGINE]['realpath']),
                      state='LIVE_PROCESS_BOUND_UNVALIDATED', exit_code=0)
    else:
        bound = read_json(output / 'bind.json')
        require(bound['state'] == 'LIVE_PROCESS_BOUND_UNVALIDATED', 'LIVE_BINDING_INCOMPLETE')
        row = bound['process']
        record['process'] = row
        deadline = time.monotonic() + 45
        while True:
            current = process_identity(row['pid'])
            if current is None or current['starttime_ticks'] != row['starttime_ticks'] or current['state'] == 'Z':
                break
            require(time.monotonic() < deadline, 'NORMAL_TEARDOWN_NOT_FINISHED')
            time.sleep(0.25)
        record['process_exit_observed'] = stamp()
        record['package'] = package_binding(fixture)
        raw_exit = (output / 'original-runner.exit').read_text().strip()
        require(re.fullmatch(r'(?:0|[1-9][0-9]{0,2})', raw_exit) is not None and int(raw_exit) <= 255,
                'ORIGINAL_RUNNER_EXIT_INVALID')
        record['original_runner_exit'] = int(raw_exit)
        original = (fixture / 'late-profile-exits.txt').read_text()
        match = re.fullmatch(r'original_probe_exit=(\d+)\nprofile_collection_exit=(\d+)\n', original)
        require(match is not None, 'ORIGINAL_PROBE_EXIT_MISSING')
        record['original_probe_exit'], record['guest_profile_collection_exit'] = map(int, match.groups())
        log = output / 'emulator.log'
        record['emulator_log'] = digest(log, 16 * 1024 * 1024)
        log_bytes = log.read_bytes()
        require(b'Tracing begins' in log_bytes and b'Tracing ended' in log_bytes and
                b'Saving host trace first...(done)' in log_bytes,
                'ACTIVATION_OR_SAVE_WITNESS_MISSING')
        trace = output / 'host.pftrace'
        first = digest(trace, 128 * 1024 * 1024)
        time.sleep(0.25)
        require(first == digest(trace, 128 * 1024 * 1024), 'HOST_TRACE_NOT_STABLE')
        record.update(trace=first, activation_and_save_log_witness=True,
                      state='COLLECTED_UNVALIDATED', exit_code=0,
                      runtime_event_validation='NOT_RUN', clock_mapping='NOT_RUN',
                      completeness='NOT_RUN', request_coverage='NOT_RUN')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('prepare', 'bind', 'finalize'))
    parser.add_argument('fixture', type=Path)
    args = parser.parse_args()
    fixture = args.fixture.resolve(strict=True)
    output = fixture / 'host-inprocess-evidence'
    if args.mode == 'prepare':
        output.mkdir(exist_ok=False)
    record = {'schema': 'robys.host-inprocess-observation.v1', 'mode': args.mode,
              'state': 'INCOMPLETE', 'exit_code': 42, 'started': stamp(), 'limits': LIMITS}
    try:
        perform(args.mode, fixture, output, record)
    except (OSError, ValueError, KeyError, TypeError) as error:
        record['reason'] = str(error)
    record['ended'] = stamp()
    if output.is_dir():
        (output / (args.mode + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, sort_keys=True))
    return record['exit_code']


if __name__ == '__main__':
    sys.exit(main())
