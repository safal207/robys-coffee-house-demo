#!/usr/bin/env python3
"""Compile and exercise real MainActivity callbacks using deterministic JVM doubles.

Requires Java 17 with its compiler module. Does not launch Android, measure
rendering, or replace the SDK build/native capture release requirements.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "scripts/qa/fixtures/android-handoff-deadlines"
ACTIVITY = ROOT / "android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ACTIVITY,
                        help="MainActivity source to compile; defaults to this checkout")
    args = parser.parse_args()
    java = shutil.which("java")
    if java is None:
        parser.error("Java 17 with the jdk.compiler module is required")
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("android_deadline_stubs", FIXTURES / "android_stubs.py")
    stubs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(stubs)
    source = args.source.read_bytes()
    harness = (FIXTURES / "HandoffDeadlineHarness.java").read_bytes()
    with tempfile.TemporaryDirectory(prefix="robys-handoff-deadlines-") as directory:
        work = Path(directory)
        sources = work / "src"
        for name, content in stubs.SOURCES.items():
            destination = sources / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(content, encoding="utf-8")
        activity = sources / "com/robys/coffeehouse/MainActivity.java"
        activity.write_bytes(source)
        (activity.parent / "HandoffDeadlineHarness.java").write_bytes(harness)
        classes = work / "classes"
        compile_run = subprocess.run(
            [java, "com.sun.tools.javac.Main", "--release", "17", "-encoding", "UTF-8",
             "-d", str(classes), *map(str, sorted(sources.rglob("*.java")))],
            capture_output=True, text=True, timeout=60,
        )
        if compile_run.returncode:
            print(compile_run.stdout, end="")
            print(compile_run.stderr, end="")
            return compile_run.returncode
        run = subprocess.run(
            [java, "-cp", str(classes), "com.robys.coffeehouse.HandoffDeadlineHarness"],
            capture_output=True, text=True, timeout=30,
        )
        print(run.stdout, end="")
        if run.stderr:
            print(run.stderr, end="")
        print(json.dumps({
            "scope": "actual MainActivity callbacks on JVM API doubles; not Android rendering",
            "source_sha256": digest(source),
            "harness_sha256": digest(harness),
            "stubs_sha256": digest((FIXTURES / "android_stubs.py").read_bytes()),
            "runner_sha256": digest(Path(__file__).read_bytes()),
            "compiled_actual_activity": True,
            "exit_code": run.returncode,
        }, sort_keys=True))
        return run.returncode


if __name__ == "__main__":
    raise SystemExit(main())
