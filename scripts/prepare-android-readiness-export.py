#!/usr/bin/env python3
"""Append delayed JS export and scoped CPU sampling to an already verified fixture."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = 'android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def delta(before, after, name):
    return ''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile=name, tofile=name))

def prepare(directory, source, expected_source_sha, expected_web_sha256, expected_web_count):
    root, source = Path(directory), Path(source)
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    require(revision == expected_source_sha, 'immutable subject differs')
    original = subprocess.check_output(['git', 'show', f'{revision}:{ACTIVITY}'], cwd=source)
    manifest_bytes = (root / 'fixture-manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    assets = root / 'android-native/app/src/main/assets'
    require((assets / 'pinned-manifest.json').read_bytes() == manifest_bytes, 'embedded manifest differs')
    require(manifest['source_sha'] == revision, 'fixture source differs')
    require(manifest['native_original_sha256'] == sha(original), 'original native differs')
    require('readiness_export' not in manifest, 'export already installed')
    inventory = json.dumps(manifest['files'], sort_keys=True, separators=(',', ':')).encode()
    require(len(manifest['files']) == expected_web_count and sha(inventory) == expected_web_sha256, 'web inventory differs')
    for entry in manifest['files'].values():
        data = (assets / 'pinned-web' / entry['asset']).read_bytes()
        require(sha(data) == entry['sha256'] and len(data) == entry['bytes'], 'web bytes differ')
    adapter = (root / ACTIVITY).with_name('PinnedWebFixture.java').read_bytes()
    require(sha(adapter) == manifest['adapter_sha256'], 'transport adapter differs')
    previous_diff = (root / 'native-instrumentation.diff').read_bytes()
    previous = (root / ACTIVITY).read_bytes()
    rendering = manifest['rendering_observer']
    require(rendering['source_sha'] == revision and rendering['web_files'] == expected_web_count and rendering['web_inventory_sha256'] == sha(inventory) and rendering['native_original_sha256'] == sha(original), 'rendering subject identity differs')
    require((root / 'native-original-source.java').read_bytes() == original, 'preserved original differs')
    transport = (root / 'native-transport-source.java').read_bytes()
    require(sha(transport) == rendering['native_transport_sha256'] == manifest['native_transport_sha256'], 'preserved transport differs')
    ancestor = json.loads((root / 'native-transport-manifest.json').read_bytes())
    for key in ('source_sha', 'native_original_sha256', 'adapter_sha256', 'files'):
        require(ancestor[key] == manifest[key], 'transport manifest differs: ' + key)
    require(ancestor['native_instrumented_sha256'] == sha(transport), 'transport manifest native differs')
    require(manifest['native_instrumented_sha256'] == sha(previous) == rendering['native_observer_sha256'], 'rendering native differs')
    rendering_helper = (root / ACTIVITY).with_name('RobysRenderingTrace.java').read_bytes()
    require(sha(rendering_helper) == rendering['helper_sha256'], 'rendering helper differs')
    rendering_helper_diff = delta('', rendering_helper.decode(), str(Path(ACTIVITY).with_name('RobysRenderingTrace.java')))
    require((root / 'native-transport-instrumentation.diff').read_text() == delta(original.decode(), transport.decode(), ACTIVITY), 'transport diff differs')
    require((root / 'rendering-observer.diff').read_text() == delta(transport.decode(), previous.decode(), ACTIVITY) + rendering_helper_diff, 'rendering diff differs')
    require(previous_diff.decode() == delta(original.decode(), previous.decode(), ACTIVITY) + rendering_helper_diff, 'combined rendering diff differs')
    require((root / 'rendering-observer-manifest.json').read_bytes() == encoded(rendering), 'rendering manifest differs')
    trace_path = root / 'trace-evidence/manifest.json'
    trace_bytes = trace_path.read_bytes()
    trace = json.loads(trace_bytes)
    require(trace['source_sha'] == revision, 'trace source differs')
    require(trace['rendering_observer_manifest_sha256'] == sha(encoded(rendering)), 'trace rendering binding differs')
    for path, key, other_key in [('capture.sh', 'original_capture_sha256', 'capture_sha256'), ('trace-capture.sh', 'trace_capture_sha256', 'trace_capture_sha256')]:
        digest = sha((root / path).read_bytes())
        require(digest == trace[key] == rendering[other_key], path + ' differs')
    old_config = (root / 'trace-evidence/config.pbtx').read_bytes()
    require(sha(old_config) == trace['config_sha256'], 'trace config differs')
    require(old_config == (ROOT / 'scripts/qa/android-handoff-trace.pbtx').read_bytes(), 'original config differs')
    config = (ROOT / 'scripts/qa/android-raster-callstack.pbtx').read_bytes()
    require(config.startswith(old_config), 'sampling config changes original prefix')
    helper = (ROOT / 'scripts/qa/RobysReadinessExport.java').read_bytes()
    helper_path = (root / ACTIVITY).with_name('RobysReadinessExport.java')
    products = ['readiness-export-manifest.json', 'native-rendering-source.java', 'native-rendering-manifest.json', 'native-rendering-instrumentation.diff', 'readiness-export.diff', 'trace-evidence/pre-readiness-manifest.json']
    require(not helper_path.exists() and not any((root / x).exists() for x in products), 'observer outputs exist')
    text = previous.decode()
    replacements = {
        '    private RobysRenderingTrace renderingTrace;\n': '    private RobysReadinessExport readinessExport;\n',
        '        renderingTrace = RobysRenderingTrace.start(this);\n': '        readinessExport = RobysReadinessExport.start(this, webView);\n',
        '    protected void onDestroy() {\n': '        if (readinessExport != null) readinessExport.destroy();\n',
    }
    for anchor, insertion in replacements.items():
        require(text.count(anchor) == 1, 'export insertion boundary changed')
        text = text.replace(anchor, anchor + insertion, 1)
    observer = {
        'schema': 'robys.android.readiness-export-preparation.v1', 'source_sha': revision,
        'native_original_sha256': sha(original), 'native_rendering_sha256': sha(previous),
        'native_final_sha256': sha(text.encode()), 'helper_sha256': sha(helper),
        'web_inventory_sha256': sha(inventory), 'web_files': expected_web_count,
        'export_after_ms': 55000, 'expected_generation': 1, 'snapshot_contract': 'robys.android.readiness.v1',
        'previous_config_sha256': sha(old_config), 'config_sha256': sha(config),
        'capture_sha256': rendering['capture_sha256'], 'trace_capture_sha256': rendering['trace_capture_sha256'],
        'scope': 'diagnostic overhead; no product readiness or performance certification',
    }
    manifest['native_instrumented_sha256'] = sha(text.encode())
    manifest['readiness_export'] = observer
    trace['previous_config_sha256'] = sha(old_config)
    trace['config_sha256'] = sha(config)
    trace['readiness_export_manifest_sha256'] = sha(encoded(observer))
    trace['app_instrumentation'] = 'pinned transport, rendering observer, passive JS phases and delayed native export'
    # All rejection gates precede writes to the disposable prepared fixture.
    (root / 'native-rendering-source.java').write_bytes(previous)
    (root / 'native-rendering-manifest.json').write_bytes(manifest_bytes)
    (root / 'native-rendering-instrumentation.diff').write_bytes(previous_diff)
    (root / 'trace-evidence/pre-readiness-manifest.json').write_bytes(trace_bytes)
    (root / ACTIVITY).write_text(text)
    helper_path.write_bytes(helper)
    (root / 'fixture-manifest.json').write_bytes(encoded(manifest))
    (assets / 'pinned-manifest.json').write_bytes(encoded(manifest))
    (root / 'readiness-export-manifest.json').write_bytes(encoded(observer))
    (root / 'trace-evidence/config.pbtx').write_bytes(config)
    trace_path.write_bytes(encoded(trace))
    helper_diff = delta('', helper.decode(), str(Path(ACTIVITY).with_name('RobysReadinessExport.java')))
    (root / 'readiness-export.diff').write_text(delta(previous.decode(), text, ACTIVITY) + helper_diff)
    (root / 'native-instrumentation.diff').write_text(delta(original.decode(), text, ACTIVITY) + delta('', rendering_helper.decode(), str(Path(ACTIVITY).with_name('RobysRenderingTrace.java'))) + helper_diff)
    return observer

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--source', required=True)
    parser.add_argument('--expected-source-sha', required=True)
    parser.add_argument('--expected-web-sha256', required=True)
    parser.add_argument('--expected-web-count', type=int, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.directory, args.source, args.expected_source_sha, args.expected_web_sha256, args.expected_web_count), sort_keys=True))
