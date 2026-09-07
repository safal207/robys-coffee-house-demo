#!/usr/bin/env python3
"""Validate the diagnostic control preserves native failure semantics."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('observer', ROOT / 'scripts/prepare-android-observer-probe.py')
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
original = (ROOT / '.github/scripts/capture-android-launch.sh').read_bytes()
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / 'capture.sh').write_bytes(original)
    (root / 'fixture-manifest.json').write_text(json.dumps({'source_sha': '07aa407d091f8d37264871eaa330dab6e849c884'}))
    observer.prepare(root, 'recorded')
    assert (root / 'observer-probe.sh').read_bytes() == original
    observer.prepare(root, 'unrecorded')
    probe = (root / 'observer-probe.sh').read_text()
    assert 'adb shell screenrecord ' not in probe
    assert 'HANDOFF_WAIT_SECONDS=30' in probe and 'sleep 0.35\n' in probe
    assert 'adb exec-out screencap -p' in probe
    metadata = json.loads((root / 'observer-probe.json').read_text())
    assert metadata['visual_certification'] == 'NOT_RUN_BY_THIS_EXPERIMENT'
    # Reuse original fake-adb negative controls. Adapt only its assertion that
    # a recorder exit file exists: there is intentionally no recorder here.
    test = (ROOT / 'scripts/test-android-capture-contract.py').read_text()
    test = test.replace("if case not in {'install_error', 'interrupted'}:", "if False:  # no recorder in the diagnostic control")
    adapted = root / 'native-negative-controls.py'
    adapted.write_text(test)
    cases = 'success,fallback,timeout,missing_visual,out_of_order,missing_commit,install_error,interrupted,timeout_then_complete,error_then_complete,error_after_complete'
    subprocess.run(['python3', str(adapted), str(root / 'observer-probe.sh')], check=True,
                   env=dict(os.environ, CAPTURE_CASES=cases))
assert (ROOT / '.github/scripts/capture-android-launch.sh').read_bytes() == original
print('Observer control: identical recorded bytes; 11 native success/failure controls preserved; certification untouched.')
