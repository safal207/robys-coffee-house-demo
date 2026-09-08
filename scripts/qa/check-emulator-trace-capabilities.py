#!/usr/bin/env python3
"""Record installed SDK emulator identity and documented help, without an AVD.

This does not establish host tracing availability or collect a host profile.
Only -version, -help-all, -help-debug-tags and -help-environment are invoked.
Five fixed SDK binary paths are read for hashes and five literal markers only.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time


EXPECTED_VERSION = '37.1.11'
EXPECTED_BUILD = '15917651'
SOURCE_SHA = '7799f80b5a6561beec57f2d98f8e8ca58e8c36fa'
MAX_OUTPUT = 2 * 1024 * 1024  # Per command stream; excess output is a failure.
MAX_PACKAGE = 1024 * 1024
MAX_BINARY = 512 * 1024 * 1024
BINARY_PATHS = ('emulator/emulator', 'emulator/qemu/linux-x86_64/qemu-system-x86_64',
                'emulator/lib64/libandroid-emu-tracing.so',
                'emulator/lib64/libOpenglRender.so', 'emulator/lib64/libgfxstream_backend.so')
MARKERS = ('VPERFETTO_TRACE_ENABLED', 'VPERFETTO_HOST_FILE', 'ANDROID_EMU_TRACING',
           'Tracing begins', 'Saving host trace first')
COMMANDS = (('version', '-version'), ('help-all', '-help-all'),
            ('help-debug-tags', '-help-debug-tags'),
            ('help-environment', '-help-environment'))


def stamp():
    return {'host_monotonic_ns': time.monotonic_ns(),
            'host_utc': datetime.now(timezone.utc).isoformat()}


def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(chunk)
    return {'bytes': path.stat().st_size, 'sha256': sha.hexdigest()}


def stop_group(process):
    # Own a separate process group, including children that outlive their leader.
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            break
        if sig == signal.SIGTERM:
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
    process.wait(timeout=2)


def run_command(output, name, argv, timeout=10, cwd=None):
    row = {'argv': [str(item) for item in argv], 'timeout_seconds': timeout,
           'started': stamp(), 'timed_out': False, 'output_limit_exceeded': False,
           'stream_limit_bytes': MAX_OUTPUT, 'returncode': None}
    buffers = {'stdout': bytearray(), 'stderr': bytearray()}
    process = None
    selector = selectors.DefaultSelector()
    try:
        process = subprocess.Popen(row['argv'], cwd=cwd, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
        for name_, stream in (('stdout', process.stdout), ('stderr', process.stderr)):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name_)
        deadline = time.monotonic() + timeout
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                row['timed_out'] = True
                break
            for key, _ in selector.select(min(remaining, 0.05)):
                data = os.read(key.fileobj.fileno(), 65536)
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                available = MAX_OUTPUT - len(buffers[key.data])
                buffers[key.data].extend(data[:available])
                if len(data) > available:
                    row['output_limit_exceeded'] = True
                    break
            if row['output_limit_exceeded']:
                break
        if not row['timed_out'] and not row['output_limit_exceeded']:
            try:
                process.wait(timeout=max(0.001, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                row['timed_out'] = True
    except SystemExit as error:
        row['cancelled_exit_code'] = error.code
        raise
    except (OSError, subprocess.SubprocessError) as error:
        row['execution_error'] = type(error).__name__
    finally:
        if process is not None:
            stop_group(process)
            row['returncode'] = process.returncode
            process.stdout.close()
            process.stderr.close()
        selector.close()
        row['ended'] = stamp()
        for stream, data in buffers.items():
            path = output / (name + '.' + stream)
            path.write_bytes(data)
            row[stream] = {'file': path.name, **digest(path)}
        (output / (name + '.command.json')).write_text(json.dumps(row, indent=2) + '\n')
    return row


def good(row):
    return (row['returncode'] == 0 and not row['timed_out']
            and not row['output_limit_exceeded'] and 'execution_error' not in row)


class Incomplete(Exception):
    pass


def binary_markers(sdk, chunk_size=1024 * 1024):
    inventory = {'interpretation': 'LITERAL_PRESENCE_ONLY', 'file_limit_bytes': MAX_BINARY,
                 'limits': 'A literal or library may be unused or a stub; no tracing support is established',
                 'files': []}
    overlap = max(len(marker) for marker in MARKERS) - 1
    for relative in BINARY_PATHS:
        path = (sdk / relative).resolve()
        row = {'sdk_relative_path': relative, 'realpath': str(path)}
        inventory['files'].append(row)
        if not path.is_relative_to(sdk):
            raise Incomplete('SDK_BINARY_ESCAPES_ROOT:' + relative)
        if not path.exists():
            row['presence'] = 'MISSING'
            continue
        if not path.is_file():
            raise Incomplete('SDK_BINARY_NOT_REGULAR:' + relative)
        before = path.stat()
        if before.st_size > MAX_BINARY:
            raise Incomplete('SDK_BINARY_SIZE_LIMIT:' + relative)
        sha, count, carry = hashlib.sha256(), 0, b''
        found = {marker: False for marker in MARKERS}
        with path.open('rb') as stream:
            while count < before.st_size:
                chunk = stream.read(min(chunk_size, before.st_size - count))
                if not chunk:
                    raise Incomplete('SDK_BINARY_CHANGED:' + relative)
                sha.update(chunk)
                count += len(chunk)
                window = carry + chunk
                for marker in MARKERS:
                    found[marker] = found[marker] or marker.encode('ascii') in window
                carry = window[-overlap:]
        after = path.stat()
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            raise Incomplete('SDK_BINARY_CHANGED:' + relative)
        row.update(presence='PRESENT', bytes=count, sha256=sha.hexdigest(), literal_presence=found)
    return inventory


def collect(output, repo):
    # Refuse an existing directory even if empty, so evidence cannot be overwritten.
    output.mkdir(parents=True, exist_ok=False)
    record = {'schema': 'robys.emulator.trace-capabilities.v1',
              'state': 'INCOMPLETE', 'exit_code': 42, 'started': stamp(),
              'expected_version': EXPECTED_VERSION, 'expected_build': EXPECTED_BUILD,
              'contextual_source_sha': SOURCE_SHA,
              'source_scope': 'PR metadata only; no product checkout, execution or verdict',
              'limits': 'Help text and literal markers do not prove tracing support, enabled build features, '
                        'request coverage, usable host stacks or product readiness',
              'commands': {}}
    try:
        meta = run_command(output, 'git-identity', ['git', 'rev-parse', 'HEAD', 'HEAD^{tree}'], cwd=repo)
        record['commands']['git-identity'] = meta
        lines = (output / 'git-identity.stdout').read_text().splitlines()
        if not good(meta) or len(lines) != 2 or any(not re.fullmatch('[0-9a-f]{40}', x) for x in lines):
            raise Incomplete('GIT_IDENTITY_UNAVAILABLE')
        record['tooling_sha'], record['tooling_tree_sha'] = lines
        github_sha = os.environ.get('GITHUB_SHA')
        record['github_sha'] = github_sha
        if github_sha != record['tooling_sha']:
            raise Incomplete('GITHUB_SHA_MISSING_OR_MISMATCH')
        clean = run_command(output, 'git-tracked-state', ['git', 'diff', '--quiet', 'HEAD', '--'], cwd=repo)
        record['commands']['git-tracked-state'] = clean
        if not good(clean):
            raise Incomplete('TOOLING_TRACKED_BYTES_CHANGED')

        roots = [Path(os.environ[name]).resolve() for name in ('ANDROID_SDK_ROOT', 'ANDROID_HOME')
                 if os.environ.get(name)]
        if not roots:
            raise Incomplete('SDK_ENVIRONMENT_ABSENT')
        if len(set(roots)) != 1:
            raise Incomplete('SDK_ENVIRONMENT_CONFLICT')
        sdk = roots[0]
        binary = (sdk / 'emulator/emulator').resolve(strict=True)
        if not binary.is_relative_to(sdk) or not binary.is_file() or not os.access(binary, os.X_OK):
            raise Incomplete('SDK_EMULATOR_EXECUTABLE_INVALID')
        record['sdk_root'] = str(sdk)
        record['binary_markers'] = binary_markers(sdk)
        binary_identity = record['binary_markers']['files'][0]
        record['emulator'] = {'sdk_relative_path': 'emulator/emulator',
                              'realpath': str(binary), 'bytes': binary_identity['bytes'],
                              'sha256': binary_identity['sha256']}
        record['package_files'] = {}
        for name in ('source.properties', 'package.xml'):
            path = (sdk / 'emulator' / name).resolve(strict=True)
            if not path.is_relative_to(sdk) or not path.is_file() or path.stat().st_size > MAX_PACKAGE:
                raise Incomplete('SDK_PACKAGE_METADATA_INVALID')
            data = path.read_bytes()
            copy = output / name
            copy.write_bytes(data)
            record['package_files'][name] = {'sdk_relative_path': 'emulator/' + name,
                                             'realpath': str(path), 'file': name, **digest(copy)}
        properties = (output / 'source.properties').read_text()
        revisions = re.findall(r'^\s*Pkg\.Revision\s*=\s*(\S+)\s*$', properties, re.MULTILINE)
        if revisions != [EXPECTED_VERSION]:
            raise Incomplete('SDK_PACKAGE_VERSION_MISMATCH')

        for name, flag in COMMANDS:
            row = run_command(output, 'emulator-' + name, [str(binary), flag])
            record['commands'][name] = row
            if not good(row):
                raise Incomplete('EMULATOR_COMMAND_FAILED:' + name)
            if name == 'version':
                version_text = ''.join((output / row[stream]['file']).read_text(errors='replace')
                                       for stream in ('stdout', 'stderr'))
                identities = sorted(set(re.findall(r'Android emulator version\s+([\d.]+)\s+\(build_id\s+(\d+)\)', version_text)))
                if len(identities) != 1 or identities[0][0] not in (EXPECTED_VERSION, EXPECTED_VERSION + '.0') or identities[0][1] != EXPECTED_BUILD:
                    raise Incomplete('EMULATOR_VERSION_OR_BUILD_MISMATCH')
                record['reported_version'], record['reported_build'] = identities[0]
        record.update(state='CAPABILITIES_RECORDED_UNVALIDATED', exit_code=0,
                      reason='EXACT_PACKAGE_IDENTITY_AND_DOCUMENTED_HELP_RECORDED')
    except Incomplete as error:
        record['reason'] = str(error)
    except SystemExit as error:
        record.update(reason='CANCELLED', exit_code=error.code)
        raise
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        record.update(reason='COLLECTION_ERROR', error_type=type(error).__name__)
    finally:
        record['ended'] = stamp()
        (output / 'status.json').write_text(json.dumps(record, indent=2, sort_keys=True) + '\n')
    return record['exit_code']


def interrupted(signum, _frame):
    raise SystemExit(128 + signum)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('emulator-trace-capabilities'))
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    raise SystemExit(collect(args.output.resolve(), Path(__file__).resolve().parents[2]))
