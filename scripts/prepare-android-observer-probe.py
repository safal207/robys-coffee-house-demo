#!/usr/bin/env python3
"""Derive a diagnostic recording control; never replace visual certification."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path


def between(text, start, end):
    assert text.count(start) == text.count(end) == 1, "capture anchors changed"
    return text[text.index(start):text.index(end)]


def prepare(directory, mode):
    root = Path(directory)
    original = (root / "capture.sh").read_text()
    derived = original
    if mode == "unrecorded":
        recording = between(original, 'adb shell screenrecord --size ', 'sleep 0.35\n')
        assert recording.endswith('RECORDER_PID=$!\n'), "unexpected recorder setup"
        derived = derived.replace(recording, '# Diagnostic control: encoder absent; original visual gate remains required.\n')
        retrieval = between(original, '# A recorder can fail ', 'adb shell dumpsys window windows > "$OUT/window-state.txt"\nadb logcat -d')
        assert 'wait "$RECORDER_PID"' in retrieval and 'adb pull "$DEVICE_VIDEO"' in retrieval
        derived = derived.replace(retrieval, '')
        size_check = 'VIDEO_BYTES="$(wc -c < "$OUT/robys-atomic-handoff.mp4")"\ntest "$VIDEO_BYTES" -gt 50000\n'
        assert original.count(size_check) == 1, "video evidence contract changed"
        derived = derived.replace(size_check, 'VIDEO_BYTES="NOT_RECORDED_DIAGNOSTIC_ONLY"\n')
    else:
        assert mode == "recorded", "unknown diagnostic mode"
    # Native deadlines, cold-start preparation, screenshots, wait, terminal
    # errors and ordered completion checks are identical on both sides.
    assert derived[derived.index('# This is a single cold-launch contract'): ] == original[original.index('# This is a single cold-launch contract'): ]
    assert between(derived, 'adb install -r ', '# A half-resolution recording') == between(original, 'adb install -r ', '# A half-resolution recording')
    script = root / "observer-probe.sh"
    script.write_text(derived)
    script.chmod(0o755)
    (root / "observer-probe.diff").write_text(''.join(difflib.unified_diff(
        original.splitlines(True), derived.splitlines(True), fromfile="capture.sh", tofile="observer-probe.sh")))
    manifest = json.loads((root / "fixture-manifest.json").read_text())
    result = {"mode": mode, "source_sha": manifest["source_sha"],
              "scope": "observer-cost experiment on pinned bytes, not visual certification",
              "visual_certification": "NOT_RUN_BY_THIS_EXPERIMENT",
              "original_capture_sha256": hashlib.sha256(original.encode()).hexdigest(),
              "probe_sha256": hashlib.sha256(derived.encode()).hexdigest(),
              "native_deadlines_and_assertions": "unchanged"}
    (root / "observer-probe.json").write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--mode', required=True, choices=['recorded', 'unrecorded'])
    args = parser.parse_args()
    prepare(args.directory, args.mode)
