#!/usr/bin/env python3
"""Compare extracted run34232699525 artifacts with two explicit prepared subjects.

Standard library only. This validates byte/provenance bindings, not the GitHub
artifact download origin, ZIP safety, native verdict, timing, or visible pixels.
Fixtures must be independently reconstructed with the pinned preparation tools.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

TOOLING = '80dbc2c5ad5acc81f84cb477ad01a6f7eb26cf3e'
TOOLING_TREE = '66c2370b21e3d06176b95a1aee7292b9309d5cd8'
WORKFLOW = '.github/workflows/pr346-early-styles-probe.yml'
WORKFLOW_HASH = '8267ce00420e0927f5bc30dd29e67d7792789df01fff73e3f522dd0042f245d1'
NATIVE_TREE = 'f2f8179479394f164f82c8d5e5bdb0ad438bdb92'
NATIVE_FINAL = '9ebd9c780f4bef5018f2937c760f68af7c20c0142333ebd4bd77f97b05e4baa0'
ARMS = {
    'control': ('6592c51a1bd5812e3ae85ed6c83c53effafc7050', '8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588'),
    'candidate': ('3ca3e5b20134a7e9678570105849333d23e96ac0', '80b4c74cee5b5a8384e096960b06ecadc1d61ad2c3090c40feaeaa974ebe08f4'),
}
PREPARED = (
    'rendering-observer-manifest.json', 'native-instrumentation.diff',
    'readiness-export-manifest.json', 'rendering-preparation-summary.json',
    'native-transport-manifest.json', 'readiness-export.diff',
    'sample-emulator-cpu.py', 'native-rendering-instrumentation.diff',
    'native-transport-instrumentation.diff', 'native-rendering-manifest.json',
    'trace-capture.sh', 'capture.sh', 'rendering-observer.diff',
    'native-rendering-source.java', 'fixture-manifest.json',
    'native-transport-source.java', 'trace-runner.sh', 'native-original-source.java',
    'trace-evidence/capture.diff', 'trace-evidence/manifest.json',
    'trace-evidence/pre-readiness-manifest.json', 'trace-evidence/config.pbtx',
    'android-native/app/src/main/java/com/robys/coffeehouse/RobysReadinessExport.java',
    'android-native/app/src/main/java/com/robys/coffeehouse/PinnedWebFixture.java',
    'android-native/app/src/main/java/com/robys/coffeehouse/RobysRenderingTrace.java',
    'android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java',
)
COPIED = (
    'run-android-readiness-probe.sh', 'verify-android-readiness-export.py',
    'run-android-rendering-probe.sh', 'verify-android-rendering-trace.py',
    'run-android-preraster-probe.sh', 'print-android-preraster-evidence.py',
    'android-settling-wait.py', 'sample-emulator-cpu.py',
)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.PIPE)


def read(root, name):
    root = Path(root).resolve()
    path = root / name
    require(path.is_file(), 'missing required file: ' + str(path))
    cursor = path
    while cursor != root:
        require(not cursor.is_symlink(), 'symlink in required path: ' + str(cursor))
        cursor = cursor.parent
    return path.read_bytes()


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate JSON key: ' + key)
        result[key] = value
    return result


def decode(data):
    return json.loads(data, object_pairs_hook=unique_pairs)


def context(repo):
    require(git(repo, 'rev-parse', TOOLING + '^{tree}').decode().strip() == TOOLING_TREE,
            'tooling tree mismatch')
    workflow = git(repo, 'show', TOOLING + ':' + WORKFLOW)
    require(sha(workflow) == WORKFLOW_HASH, 'pinned tooling workflow differs')
    # The archived bytes must exactly match this immutable workflow. Also bind
    # both arm constants to its bounded matrix, without a YAML dependency.
    matrix = re.findall(rb'          - label: (control|candidate)\n'
                        rb'            subject_sha: ([a-f0-9]{40})\n'
                        rb'            web_digest: ([a-f0-9]{64})\n', workflow)
    require(matrix == [(arm.encode(), subject.encode(), digest.encode())
                       for arm, (subject, digest) in ARMS.items()], 'unexpected archived matrix pins')
    lines = [line.strip() for line in workflow.decode().splitlines()
             if line.strip().startswith('sha256sum ')]
    require(len(lines) == 1, 'tool manifest command missing or duplicated')
    names = lines[0].split(' > ')[0].split()[1:]
    require(len(names) == len(set(names)) == 19, 'expected exactly 19 original hashed tools')
    hashes = {name: sha(git(repo, 'show', TOOLING + ':' + name)) for name in names}
    manifest = ''.join(digest + '  ' + name + '\n' for name, digest in hashes.items()).encode()
    copied = {name: git(repo, 'show', TOOLING + ':scripts/qa/' + name) for name in COPIED}
    for arm, (subject, _) in ARMS.items():
        require(git(repo, 'rev-parse', subject + ':android-native').decode().strip() == NATIVE_TREE,
                arm + ': original native subtree differs')
    return {'workflow': workflow, 'hashes': hashes, 'manifest': manifest, 'copied': copied}


def expected_binding(arm):
    subject, digest = ARMS[arm]
    return {
        'schema': 'robys.android.early-styles-ab.v1', 'arm': arm,
        'source_sha': subject, 'web_inventory_sha256': digest, 'web_files': 241,
        'native_tree_sha': NATIVE_TREE, 'tooling_sha': TOOLING,
        'workflow_sha256': WORKFLOW_HASH,
    }


def verify_arm(arm, fixture, artifact, ctx, repo):
    subject, digest = ARMS[arm]
    fixture_manifest = decode(read(fixture, 'fixture-manifest.json'))
    require(fixture_manifest['source_sha'] == subject, arm + ': reconstruction uses another subject')
    files = fixture_manifest['files']
    require(len(files) == 241 and sha(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()) == digest,
            arm + ': reconstructed inventory differs')
    original = git(repo, 'show', subject + ':android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java')
    require(read(fixture, 'native-original-source.java') == original, arm + ': reconstructed original native differs')
    require(fixture_manifest['native_original_sha256'] == sha(original), arm + ': original native manifest differs')
    require(fixture_manifest['native_instrumented_sha256'] == NATIVE_FINAL, arm + ': final native manifest differs')
    prepared = {}
    require(len(PREPARED) == 26, 'internal prepared file list changed')
    for name in PREPARED:
        actual, expected = read(artifact, name), read(fixture, name)
        require(actual == expected, arm + ': reconstructed byte mismatch: ' + name)
        prepared[name] = sha(actual)
    require(prepared[PREPARED[-1]] == NATIVE_FINAL, arm + ': archived final native differs')
    require(read(artifact, 'diagnostic-tooling.sha') == (TOOLING + '\n').encode(), arm + ': tooling commit differs')
    require(read(artifact, 'diagnostic-workflow.yml') == ctx['workflow'], arm + ': archived workflow differs')
    require(read(artifact, 'diagnostic-tools.sha256') == ctx['manifest'], arm + ': 19-tool manifest differs')
    require(decode(read(artifact, 'experiment-binding.json')) == expected_binding(arm), arm + ': experiment binding differs')
    copied = {}
    for name, expected in ctx['copied'].items():
        actual = read(artifact, name)
        require(actual == expected, arm + ': copied execution tool differs: ' + name)
        copied[name] = sha(actual)
    return {
        'verified': True, 'artifact_directory': str(Path(artifact).resolve()),
        'reconstruction_directory': str(Path(fixture).resolve()),
        'binding': expected_binding(arm), 'prepared_files_sha256': prepared,
        'diagnostic_tools_sha256': ctx['hashes'], 'copied_tools_sha256': copied,
        'native_final_sha256': NATIVE_FINAL,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tooling-repo', required=True)
    for arm in ARMS:
        parser.add_argument('--' + arm + '-fixture', required=True)
        parser.add_argument('--' + arm + '-artifact', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    report = {'schema': 'robys.android.early-styles-provenance.v1',
              'run_id_context': 34232699525, 'tooling_sha': TOOLING, 'tooling_tree': TOOLING_TREE,
              'verified': False, 'arms': {},
              'claim_boundary': 'Prepared-byte and provenance comparison only. GitHub download origin, ZIP safety, native verdict, timing and visible pixels require separate evidence.'}
    try:
        ctx = context(args.tooling_repo)
        for arm in ARMS:
            try:
                report['arms'][arm] = verify_arm(arm, getattr(args, arm + '_fixture'),
                    getattr(args, arm + '_artifact'), ctx, args.tooling_repo)
            except Exception as error:
                report['arms'][arm] = {'verified': False, 'error': str(error)}
        report['verified'] = all(item['verified'] for item in report['arms'].values())
    except Exception as error:
        report['error'] = str(error)
    encoded = json.dumps(report, indent=2, sort_keys=True) + '\n'
    if args.output:
        Path(args.output).write_text(encoded)
    print(encoded, end='')
    return 0 if report['verified'] else 1


if __name__ == '__main__':
    sys.exit(main())
