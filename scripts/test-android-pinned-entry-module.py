#!/usr/bin/env python3
"""Prove an observed legacy bridge cannot substitute for the native entry module."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERIFIER = ROOT / 'scripts/verify-android-pinned-evidence.py'
LEGACY = 'android-handoff.js'
NATIVE = 'android-native-product-frame.js'


def fixture(root, served, *, omit_native=False, wrong_hash=False):
    resources = {
        'index.html': b'<!doctype html><title>synthetic identity fixture</title>',
        LEGACY: b'/* synthetic legacy bridge */',
        NATIVE: b'/* synthetic native product frame */',
    }
    if omit_native:
        del resources[NATIVE]
    manifest = {'source_sha': '1' * 40, 'files': {
        name: {'asset': name, 'bytes': len(data),
               'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in resources.items()}}
    manifest_bytes = (json.dumps(manifest, sort_keys=True) + '\n').encode()
    (root / 'fixture-manifest.json').write_bytes(manifest_bytes)
    apk = root / 'android-native/app/build/outputs/apk/debug/app-debug.apk'
    apk.parent.mkdir(parents=True)
    with zipfile.ZipFile(apk, 'w') as archive:
        archive.writestr('assets/pinned-manifest.json', manifest_bytes)
        for name, data in resources.items():
            archive.writestr('assets/pinned-web/' + name, data)
    log = root / 'android-native/build/visual-evidence/logcat.txt'
    log.parent.mkdir(parents=True)
    lines = []
    for name in ['index.html', *served]:
        digest = manifest['files'].get(name, {}).get('sha256', 'e' * 64)
        if wrong_hash and name == NATIVE:
            digest = 'f' * 64
        lines.append(f'RobysPinned: SERVED {name} sha256={digest} status=200')
    log.write_text('\n'.join(lines) + '\n')


def main():
    # expected=None exercises the original CLI default. Both modules are packaged
    # unless stated otherwise, so delivery cannot be inferred from APK inclusion.
    cases = (
        ('legacy_default', None, [LEGACY], {}, True),
        ('native_explicit', NATIVE, [NATIVE], {}, True),
        ('native_with_legacy', NATIVE, [LEGACY, NATIVE], {}, True),
        ('legacy_does_not_prove_native', NATIVE, [LEGACY], {}, False),
        ('native_wrong_delivery_hash', NATIVE, [LEGACY, NATIVE], {'wrong_hash': True}, False),
        ('native_absent_from_inventory', NATIVE, [LEGACY], {'omit_native': True}, False),
        ('native_does_not_change_default', None, [NATIVE], {}, False),
        ('arbitrary_entry_rejected', 'index.html', [LEGACY], {}, False),
    )
    with tempfile.TemporaryDirectory() as temporary:
        for name, expected, served, options, success in cases:
            directory = Path(temporary) / name
            directory.mkdir()
            fixture(directory, served, **options)
            command = [sys.executable, str(VERIFIER), str(directory)]
            if expected is not None:
                command.extend(['--entry-module', expected])
            result = subprocess.run(command, capture_output=True, text=True, timeout=10)
            assert (result.returncode == 0) == success, (name, result.stdout, result.stderr)
            summary = directory / 'pinned-evidence-summary.json'
            if success:
                report = json.loads(summary.read_text())
                assert report['entry_module'] == (expected or LEGACY), name
                assert report['entry_module'] in report['served_paths'], name
                assert report['scope'] == 'pinned resource identity only; capture.sh independently enforces handoff'
            else:
                assert not summary.exists(), name
    print('Pinned entry-module identity: 3 positive and 5 negative controls passed.')
    print('Synthetic APK/log identity only; no native handoff or performance verdict tested.')


if __name__ == '__main__':
    main()
