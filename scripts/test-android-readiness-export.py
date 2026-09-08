#!/usr/bin/env python3
"""Rebuild delayed-export fixtures and reject stale inputs without partial writes.

These are preparation/provenance controls, not Android lifecycle or performance
certification. Explicit subject bindings are supported; otherwise the controls
derive their fixture identity from the selected immutable commit.
"""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = 'android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java'
ASSETS = 'android-native/app/src/main/assets'


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def clone_fixture(source, target):
    def copy(src, dst):
        if '/assets/pinned-web/' in str(src):
            os.link(src, dst)
        else:
            shutil.copy2(src, dst)
        return dst
    shutil.copytree(source, target, copy_function=copy)


def replace_bytes(path, data):
    # Asset copies share immutable hardlinks. Break the link before corruption.
    if path.exists():
        path.unlink()
    path.write_bytes(data)


def tree_state(root):
    result = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            result[relative] = ('link', os.readlink(path))
        elif path.is_dir():
            result[relative] = ('dir', path.stat().st_mode & 0o777)
        else:
            result[relative] = ('file', path.stat().st_mode & 0o777, digest(path.read_bytes()))
    return result


def rewrite_json(path, modify):
    data = json.loads(path.read_bytes())
    modify(data)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')


def fixture_json(root, modify):
    path = root / 'fixture-manifest.json'
    rewrite_json(path, modify)
    (root / ASSETS / 'pinned-manifest.json').write_bytes(path.read_bytes())


def main(source, expected_source_sha=None, expected_web_sha256=None, expected_web_count=None):
    source = Path(source).resolve()
    pinned = module('prepare-android-pinned-fixture')
    system = module('prepare-android-trace-probe')
    rendering = module('prepare-android-rendering-trace')
    observer = module('prepare-android-readiness-export')
    actual_source_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    expected_source_sha = expected_source_sha or actual_source_sha
    check(actual_source_sha == expected_source_sha, 'test subject is not the explicitly requested commit')
    status_before = subprocess.check_output(['git', 'status', '--porcelain'], cwd=source)
    total = 0
    with tempfile.TemporaryDirectory(prefix='robys-readiness-preparation-') as temporary:
        root = Path(temporary)
        baseline = root / 'baseline'
        with contextlib.redirect_stdout(io.StringIO()):
            pinned_manifest = pinned.prepare(source, baseline)
            inventory = json.dumps(pinned_manifest['files'], sort_keys=True, separators=(',', ':')).encode()
            if expected_web_sha256 is None:
                expected_web_sha256 = digest(inventory)
            if expected_web_count is None:
                expected_web_count = len(pinned_manifest['files'])
            expected = dict(expected_source_sha=expected_source_sha,
                            expected_web_sha256=expected_web_sha256,
                            expected_web_count=expected_web_count)
            system.prepare(baseline)
            rendering.prepare(baseline, source, **expected)
        baseline_state = tree_state(baseline)
        previous_manifest_bytes = (baseline / 'fixture-manifest.json').read_bytes()
        previous_manifest = json.loads(previous_manifest_bytes)
        previous_trace_bytes = (baseline / 'trace-evidence/manifest.json').read_bytes()
        previous_trace = json.loads(previous_trace_bytes)
        previous_native = (baseline / ACTIVITY).read_bytes()
        previous_diff = (baseline / 'native-instrumentation.diff').read_bytes()
        capture_bytes = (baseline / 'capture.sh').read_bytes()
        trace_capture_bytes = (baseline / 'trace-capture.sh').read_bytes()
        original = subprocess.check_output(['git', 'show', f'{expected_source_sha}:{ACTIVITY}'], cwd=source)

        positive = root / 'positive'
        clone_fixture(baseline, positive)
        summary = observer.prepare(positive, source, **expected)
        manifest_bytes = (positive / 'fixture-manifest.json').read_bytes()
        manifest = json.loads(manifest_bytes)
        trace = json.loads((positive / 'trace-evidence/manifest.json').read_bytes())
        final_native = (positive / ACTIVITY).read_bytes()
        export_helper = (positive / ACTIVITY).with_name('RobysReadinessExport.java').read_bytes()
        check(summary['source_sha'] == expected_source_sha, 'observer subject differs')
        check(summary['web_inventory_sha256'] == expected_web_sha256 and
              summary['web_files'] == expected_web_count, 'observer web identity differs')
        check(manifest['files'] == previous_manifest['files'], 'web inventory changed')
        for item in previous_manifest['files'].values():
            data = (positive / ASSETS / 'pinned-web' / item['asset']).read_bytes()
            check(digest(data) == item['sha256'] and len(data) == item['bytes'], 'web bytes changed')
        check((positive / 'native-rendering-source.java').read_bytes() == previous_native,
              'previous native stage was not preserved')
        check((positive / 'native-rendering-manifest.json').read_bytes() == previous_manifest_bytes,
              'previous fixture manifest was not preserved')
        check((positive / 'native-rendering-instrumentation.diff').read_bytes() == previous_diff,
              'previous diagnostic diff was not preserved')
        check((positive / 'trace-evidence/pre-readiness-manifest.json').read_bytes() == previous_trace_bytes,
              'previous trace manifest was not preserved')
        check((positive / 'native-original-source.java').read_bytes() == original,
              'original native stage changed')
        check(manifest['rendering_observer'] == previous_manifest['rendering_observer'],
              'rendering observer history was rewritten')
        check((positive / ASSETS / 'pinned-manifest.json').read_bytes() == manifest_bytes,
              'embedded final provenance differs')
        check(manifest['native_original_sha256'] == digest(original), 'original native binding differs')
        check(manifest['native_instrumented_sha256'] == summary['native_final_sha256'] == digest(final_native),
              'final native binding differs')
        check(summary['native_rendering_sha256'] == digest(previous_native), 'previous native binding differs')
        check(summary['helper_sha256'] == digest(export_helper), 'new helper binding differs')
        observer_bytes = (positive / 'readiness-export-manifest.json').read_bytes()
        check(json.loads(observer_bytes) == summary == manifest['readiness_export'],
              'observer stage manifests disagree')
        check(trace['readiness_export_manifest_sha256'] == digest(observer_bytes),
              'trace does not bind export observer')
        config = (positive / 'trace-evidence/config.pbtx').read_bytes()
        previous_config = (baseline / 'trace-evidence/config.pbtx').read_bytes()
        check(config.startswith(previous_config) and len(config) > len(previous_config),
              'sampling changed the original system capture configuration')
        check(trace['config_sha256'] == summary['config_sha256'] == digest(config),
              'new trace configuration binding differs')
        check(trace['previous_config_sha256'] == summary['previous_config_sha256'] ==
              previous_trace['config_sha256'] == digest(previous_config), 'previous trace binding differs')
        check((positive / 'capture.sh').read_bytes() == capture_bytes, 'capture assertions changed')
        check((positive / 'trace-capture.sh').read_bytes() == trace_capture_bytes,
              'trace capture assertions changed')
        for name in ['PinnedWebFixture.java', 'RobysRenderingTrace.java']:
            check((positive / ACTIVITY).with_name(name).read_bytes() ==
                  (baseline / ACTIVITY).with_name(name).read_bytes(), 'previous helper changed: ' + name)
        stripped = final_native.decode()
        for insertion in ['    private RobysReadinessExport readinessExport;\n',
                          '        readinessExport = RobysReadinessExport.start(this, webView);\n',
                          '        if (readinessExport != null) readinessExport.destroy();\n']:
            check(stripped.count(insertion) == 1, 'new native hook missing or duplicated')
            stripped = stripped.replace(insertion, '')
        check(stripped.encode() == previous_native, 'native behavior changed outside the three declared hooks')
        # Replay the emitted combined diff; metadata alone cannot prove its contents.
        replay = root / 'diff-replay'
        (replay / ACTIVITY).parent.mkdir(parents=True)
        (replay / ACTIVITY).write_bytes(original)
        subprocess.run(['git', 'apply', '-p0', str(positive / 'native-instrumentation.diff')], cwd=replay,
                       check=True, capture_output=True)
        check((replay / ACTIVITY).read_bytes() == final_native, 'combined diff cannot recreate final native')
        for name in ['RobysRenderingTrace.java', 'RobysReadinessExport.java']:
            check((replay / ACTIVITY).with_name(name).read_bytes() ==
                  (positive / ACTIVITY).with_name(name).read_bytes(), 'combined diff omits helper ' + name)
        total += 1
        print('PASS immutable source, complete stage bindings, diff replay, unchanged capture/web bytes')

        def changed(path, relative):
            target = path / relative
            replace_bytes(target, target.read_bytes() + b'\n// stale diagnostic input\n')

        def changed_asset(path):
            first = next(iter(previous_manifest['files'].values()))
            changed(path, ASSETS + '/pinned-web/' + first['asset'])

        def field(key, value):
            return lambda path: fixture_json(path, lambda data: data.__setitem__(key, value))

        def trace_field(key, value):
            return lambda path: rewrite_json(path / 'trace-evidence/manifest.json',
                                             lambda data: data.__setitem__(key, value))

        def rebound_rendering(path, key, value):
            # A copied stage can be internally hash-consistent yet belong to a
            # different subject; native Java is identical across these commits.
            fixture_json(path, lambda data: data['rendering_observer'].__setitem__(key, value))
            record = json.loads((path / 'fixture-manifest.json').read_bytes())['rendering_observer']
            encoded = (json.dumps(record, indent=2, sort_keys=True) + '\n').encode()
            (path / 'rendering-observer-manifest.json').write_bytes(encoded)
            rewrite_json(path / 'trace-evidence/manifest.json',
                         lambda data: data.__setitem__('rendering_observer_manifest_sha256', digest(encoded)))

        cases = [
            ('wrong expected source', lambda path: None, {'expected_source_sha': '0' * 40}),
            ('wrong expected inventory', lambda path: None, {'expected_web_sha256': '0' * 64}),
            ('wrong expected web count', lambda path: None, {'expected_web_count': expected_web_count + 1}),
            ('stale fixture source', field('source_sha', '0' * 40), {}),
            ('wrong original native hash', field('native_original_sha256', '0' * 64), {}),
            ('wrong final rendering hash', field('native_instrumented_sha256', '0' * 64), {}),
            ('divergent embedded manifest', lambda path: (path / ASSETS / 'pinned-manifest.json').write_text('{}\n'), {}),
            ('mutated pinned asset', changed_asset, {}),
            ('mutated rendering native', lambda path: changed(path, ACTIVITY), {}),
            ('mutated rendering helper', lambda path: changed(path, str(Path(ACTIVITY).with_name('RobysRenderingTrace.java'))), {}),
            ('mutated transport adapter', lambda path: changed(path, str(Path(ACTIVITY).with_name('PinnedWebFixture.java'))), {}),
            ('stale rendering manifest', lambda path: rewrite_json(path / 'rendering-observer-manifest.json', lambda data: data.__setitem__('source_sha', '0' * 40)), {}),
            ('hash-consistent rendering record from another source', lambda path: rebound_rendering(path, 'source_sha', '0' * 40), {}),
            ('hash-consistent rendering record with stale inventory', lambda path: rebound_rendering(path, 'web_inventory_sha256', '0' * 64), {}),
            ('hash-consistent rendering record with stale count', lambda path: rebound_rendering(path, 'web_files', expected_web_count + 1), {}),
            ('hash-consistent rendering record with wrong original', lambda path: rebound_rendering(path, 'native_original_sha256', '0' * 64), {}),
            ('mutated original source artifact', lambda path: changed(path, 'native-original-source.java'), {}),
            ('mutated transport source artifact', lambda path: changed(path, 'native-transport-source.java'), {}),
            ('stale transport manifest source', lambda path: rewrite_json(path / 'native-transport-manifest.json', lambda data: data.__setitem__('source_sha', '0' * 40)), {}),
            ('stale transport manifest web inventory', lambda path: rewrite_json(path / 'native-transport-manifest.json', lambda data: data.__setitem__('files', {})), {}),
            ('stale transport manifest adapter', lambda path: rewrite_json(path / 'native-transport-manifest.json', lambda data: data.__setitem__('adapter_sha256', '0' * 64)), {}),
            ('mutated transport instrumentation diff', lambda path: changed(path, 'native-transport-instrumentation.diff'), {}),
            ('mutated rendering observer diff', lambda path: changed(path, 'rendering-observer.diff'), {}),
            ('mutated cumulative instrumentation diff', lambda path: changed(path, 'native-instrumentation.diff'), {}),
            ('stale trace subject', trace_field('source_sha', '0' * 40), {}),
            ('stale rendering trace binding', trace_field('rendering_observer_manifest_sha256', '0' * 64), {}),
            ('modified original capture', lambda path: changed(path, 'capture.sh'), {}),
            ('modified trace capture', lambda path: changed(path, 'trace-capture.sh'), {}),
            ('modified original trace config', lambda path: changed(path, 'trace-evidence/config.pbtx'), {}),
            ('missing prior instrumentation diff', lambda path: (path / 'native-instrumentation.diff').unlink(), {}),
            ('already installed observer', field('readiness_export', {}), {}),
            ('existing export helper', lambda path: (path / ACTIVITY).with_name('RobysReadinessExport.java').write_text('// stale\n'), {}),
            ('existing stage output', lambda path: (path / 'native-rendering-source.java').write_text('// stale\n'), {}),
        ]
        failures = []
        for index, (name, corrupt, override) in enumerate(cases):
            path = root / f'negative-{index}'
            clone_fixture(baseline, path)
            corrupt(path)
            before = tree_state(path)
            rejected = False
            try:
                observer.prepare(path, source, **{**expected, **override})
            except (ValueError, FileNotFoundError, KeyError):
                rejected = True
            if not rejected:
                failures.append('accepted ' + name)
            elif tree_state(path) != before:
                failures.append('partial writes after rejecting ' + name)
            else:
                total += 1
                print('PASS reject without writes: ' + name)

        # Exercise a stale/new config boundary without modifying shared tooling.
        altered_tooling = root / 'altered-tooling'
        (altered_tooling / 'scripts/qa').mkdir(parents=True)
        for name in ['android-handoff-trace.pbtx', 'android-raster-callstack.pbtx', 'RobysReadinessExport.java']:
            shutil.copy2(ROOT / 'scripts/qa' / name, altered_tooling / 'scripts/qa' / name)
        config_path = altered_tooling / 'scripts/qa/android-raster-callstack.pbtx'
        config_path.write_bytes(b'# changed original prefix\n' + config_path.read_bytes())
        path = root / 'negative-config-prefix'
        clone_fixture(baseline, path)
        before = tree_state(path)
        saved_root = observer.ROOT
        try:
            observer.ROOT = altered_tooling
            try:
                observer.prepare(path, source, **expected)
            except ValueError:
                check(tree_state(path) == before, 'partial writes after rejecting sampling config prefix')
                total += 1
                print('PASS reject without writes: sampling configuration changes original prefix')
            else:
                failures.append('accepted changed sampling configuration prefix')
        finally:
            observer.ROOT = saved_root

        check(tree_state(baseline) == baseline_state, 'negative controls damaged immutable shared fixture')
        check(subprocess.check_output(['git', 'status', '--porcelain'], cwd=source) == status_before,
              'preparation controls changed the source worktree')
        check(not failures, '; '.join(failures))
    print(f'ANDROID-READINESS-EXPORT-PREPARATION: {total}/{total} controls PASS; Android runtime validation remains separate')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--expected-source-sha')
    parser.add_argument('--expected-web-sha256')
    parser.add_argument('--expected-web-count', type=int)
    args = parser.parse_args()
    main(args.source, args.expected_source_sha, args.expected_web_sha256, args.expected_web_count)
