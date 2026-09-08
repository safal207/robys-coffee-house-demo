#!/usr/bin/env python3
"""Recreated observer preparation: positive provenance and ten rejection controls."""
import argparse
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def clone_fixture(source, target):
    def copy(src, dst):
        if "/assets/pinned-web/" in str(src):
            os.link(src, dst)
        else:
            shutil.copy2(src, dst)
        return dst
    shutil.copytree(source, target, copy_function=copy)


def rewrite_json(path, modify):
    data = json.loads(path.read_bytes())
    modify(data)
    path.write_text(json.dumps(data, sort_keys=True) + "\n")


def main(source):
    pinned = module("prepare-android-pinned-fixture")
    system = module("prepare-android-trace-probe")
    observer = module("prepare-android-rendering-trace")
    source = Path(source).resolve()
    status_before = subprocess.check_output(["git", "status", "--porcelain"], cwd=source)
    with tempfile.TemporaryDirectory(prefix="robys-rendering-tests-") as temporary:
        root = Path(temporary)
        baseline = root / "baseline"
        with contextlib.redirect_stdout(io.StringIO()):
            pinned.prepare(source, baseline)
            system.prepare(baseline)
        original_manifest = (baseline / "fixture-manifest.json").read_bytes()
        transport = (baseline / observer.ACTIVITY).read_bytes()
        capture = (baseline / "capture.sh").read_bytes()
        trace_capture = (baseline / "trace-capture.sh").read_bytes()
        expected_manifest = json.loads(original_manifest)
        positive = root / "positive"
        clone_fixture(baseline, positive)
        summary = observer.prepare(positive, source)
        updated_manifest = json.loads((positive / "fixture-manifest.json").read_bytes())
        check(summary["source_sha"] == observer.SUBJECT, "incorrect subject")
        check(summary["web_files"] == 240 and summary["web_inventory_sha256"] == observer.WEB_SHA256,
              "web identity was not preserved")
        check(updated_manifest["files"] == expected_manifest["files"], "inventory changed")
        check((positive / "native-transport-manifest.json").read_bytes() == original_manifest,
              "transport manifest not preserved")
        check((positive / "native-transport-source.java").read_bytes() == transport, "transport source changed")
        original = subprocess.check_output(["git", "show", f"{observer.SUBJECT}:{observer.ACTIVITY}"], cwd=source)
        check((positive / "native-original-source.java").read_bytes() == original, "original source changed")
        observed = (positive / observer.ACTIVITY).read_bytes()
        stripped = observed.decode().replace("    private RobysRenderingTrace renderingTrace;\n", "")
        stripped = stripped.replace("        renderingTrace = RobysRenderingTrace.start(this);\n", "")
        stripped = stripped.replace('        if (renderingTrace != null) renderingTrace.stop("activity_destroy");\n', "")
        check(stripped.encode() == transport, "observer changes product behavior outside three declared hooks")
        check((positive / "capture.sh").read_bytes() == capture, "capture changed")
        check((positive / "trace-capture.sh").read_bytes() == trace_capture, "trace capture changed")
        check((positive / "android-native/app/src/main/assets/pinned-manifest.json").read_bytes() ==
              (positive / "fixture-manifest.json").read_bytes(), "embedded provenance diverged")
        trace_manifest = json.loads((positive / "trace-evidence/manifest.json").read_bytes())
        check(trace_manifest["rendering_observer_manifest_sha256"] ==
              observer.sha((positive / "rendering-observer-manifest.json").read_bytes()), "trace provenance not bound")
        print("PASS valid immutable subject, layered provenance, unchanged web and capture")

        def fixture_json(path, key, value):
            rewrite_json(path / "fixture-manifest.json", lambda data: data.__setitem__(key, value))
            shutil.copyfile(path / "fixture-manifest.json", path / "android-native/app/src/main/assets/pinned-manifest.json")

        def anchor_change(path, anchor):
            activity = path / observer.ACTIVITY
            activity.write_text(activity.read_text().replace(anchor, anchor + anchor))
            fixture_json(path, "native_instrumented_sha256", observer.sha(activity.read_bytes()))

        cases = [
            ("already installed", lambda path: fixture_json(path, "rendering_observer", {})),
            ("wrong original source hash", lambda path: fixture_json(path, "native_original_sha256", "0" * 64)),
            ("wrong transport source hash", lambda path: fixture_json(path, "native_instrumented_sha256", "0" * 64)),
            ("divergent embedded manifest", lambda path: (path / "android-native/app/src/main/assets/pinned-manifest.json").write_text("{}\n")),
            ("missing trace provenance", lambda path: (path / "trace-evidence/manifest.json").unlink()),
            ("wrong trace subject", lambda path: rewrite_json(path / "trace-evidence/manifest.json", lambda data: data.__setitem__("source_sha", "0" * 40))),
            ("modified capture assertions", lambda path: (path / "capture.sh").write_bytes(capture + b"exit 0\n")),
            ("modified trace capture assertions", lambda path: (path / "trace-capture.sh").write_bytes(trace_capture + b"exit 0\n")),
            ("ambiguous start boundary", lambda path: anchor_change(path, observer.START)),
            ("ambiguous destroy boundary", lambda path: anchor_change(path, observer.DESTROY)),
        ]
        for index, (name, corrupt) in enumerate(cases):
            path = root / f"negative-{index}"
            clone_fixture(baseline, path)
            corrupt(path)
            before_activity = (path / observer.ACTIVITY).read_bytes()
            before_manifest = (path / "fixture-manifest.json").read_bytes()
            try:
                observer.prepare(path, source)
            except (ValueError, FileNotFoundError):
                pass
            else:
                raise AssertionError("accepted " + name)
            check((path / observer.ACTIVITY).read_bytes() == before_activity, "failed preparation changed native bytes")
            check((path / "fixture-manifest.json").read_bytes() == before_manifest, "failed preparation changed manifest")
            check(not (path / "rendering-observer-manifest.json").exists(), "failed preparation published provenance")
            print("PASS reject " + name)
        check(subprocess.check_output(["git", "status", "--porcelain"], cwd=source) == status_before,
              "immutable source worktree was modified")
    print("ANDROID-RENDERING-TRACE: 11/11 provenance controls PASS; Java/runtime validation remains separate")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    main(parser.parse_args().source)
