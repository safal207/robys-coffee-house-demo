#!/usr/bin/env python3
"""Replay immutable preparation for run 34227119767; never certify presentation."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import zipfile

TOOLING = "7d644c36f2c6bf7c4dffa8aa436110ec9fc2df58"
RUN = 34227119767
WORKFLOW = ".github/workflows/pr346-product-frame-probe.yml"
ACTIVITY = "android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java"
TOOLS = [
    "scripts/prepare-android-pinned-fixture.py",
    "scripts/prepare-android-trace-probe.py",
    "scripts/qa/PinnedWebFixture.java",
    "scripts/qa/android-handoff-trace.pbtx",
    "scripts/qa/sample-emulator-cpu.py",
    "scripts/qa/run-android-preraster-probe.sh",
    "scripts/qa/print-android-preraster-evidence.py",
    "scripts/qa/android-settling-wait.py",
    "scripts/prepare-android-rendering-trace.py",
    "scripts/qa/RobysRenderingTrace.java",
    "scripts/qa/run-android-rendering-probe.sh",
    "scripts/qa/verify-android-rendering-trace.py",
    ".github/scripts/capture-android-launch.sh",
]
ARMS = {
    "control": (
        "7ca13b9adbf45b953c3b0997107d010e7bad1d9b", 240,
        "2c97e25ebf4e0c2b16f50818bc3a577b569a5d18a0f623ed21e498ff26e4395c"),
    "native-product-frame-cache": (
        "c9a9d9c5feeb35d8b6077485b537ab3b60f62b67", 241,
        "9c072aed49e8c17a8a168d8a3e3196e7cc9e29da1c6d81dc32f4283e6e2adc77"),
}
RECONSTRUCTED = [
    "fixture-manifest.json", "native-original-source.java",
    "native-transport-source.java", "native-transport-manifest.json",
    "native-instrumentation.diff", "native-transport-instrumentation.diff",
    "rendering-observer-manifest.json", "rendering-observer.diff",
    "rendering-preparation-summary.json", ACTIVITY,
    str(PurePosixPath(ACTIVITY).with_name("RobysRenderingTrace.java")),
    "capture.sh", "trace-capture.sh", "trace-runner.sh",
    "sample-emulator-cpu.py", "trace-evidence/manifest.json",
    "trace-evidence/config.pbtx", "trace-evidence/capture.diff",
    "run-android-rendering-probe.sh", "verify-android-rendering-trace.py",
    "run-android-preraster-probe.sh", "print-android-preraster-evidence.py",
    "android-settling-wait.py",
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def committed(repo, sha, path):
    return git(repo, "show", sha + ":" + path)


def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    require(result.returncode == 0, "reconstruction failed: " + result.stderr[-4000:])


def reconstruct(tooling_repo, subject, temporary, source, count, inventory_digest):
    # Only execute scripts recovered from the declared git commit, never ZIP code.
    clean_tools = temporary / "tooling"
    for path in TOOLS:
        target = clean_tools / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(committed(tooling_repo, TOOLING, path))
    fixture = temporary / "fixture"
    scripts = clean_tools / "scripts"
    run([sys.executable, str(scripts / "prepare-android-pinned-fixture.py"),
         "--source", str(subject), "--output", str(fixture)])
    run([sys.executable, str(scripts / "prepare-android-trace-probe.py"), str(fixture)])
    run([sys.executable, str(scripts / "prepare-android-rendering-trace.py"), str(fixture),
         "--source", str(subject), "--expected-source-sha", source,
         "--expected-web-sha256", inventory_digest, "--expected-web-count", str(count)])
    for name in ("run-android-rendering-probe.sh", "verify-android-rendering-trace.py",
                 "run-android-preraster-probe.sh", "print-android-preraster-evidence.py",
                 "android-settling-wait.py"):
        (fixture / name).write_bytes((scripts / "qa" / name).read_bytes())
    return fixture


def verify(args):
    source, count, inventory_digest = ARMS[args.arm]
    subject = args.subject.resolve()
    require(git(subject, "rev-parse", "HEAD").decode().strip() == source,
            "subject checkout does not identify declared arm")
    require(git(args.tooling_repo, "rev-parse", TOOLING + "^{commit}").decode().strip() == TOOLING,
            "immutable tooling commit is unavailable")
    for path in (".github/scripts/capture-android-launch.sh", "scripts/test-android-capture-contract.py"):
        require(committed(args.tooling_repo, TOOLING, path) == committed(args.tooling_repo, source, path),
                "subject and tooling original capture contract differ: " + path)
    expected_zip_hash = args.sha256.removeprefix("sha256:")
    require(re.fullmatch(r"[a-f0-9]{64}", expected_zip_hash), "invalid expected artifact SHA256")
    with args.artifact.open("rb") as stream:
        actual_zip_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    require(actual_zip_hash == expected_zip_hash, "downloaded artifact SHA256 differs")

    with zipfile.ZipFile(args.artifact) as archive, tempfile.TemporaryDirectory(prefix="robys-cache-replay-") as tmp:
        entries = archive.infolist()
        names = [item.filename for item in entries if not item.is_dir()]
        require(len(names) == len(set(names)), "duplicate ZIP file paths")
        for item in entries:
            p = PurePosixPath(item.filename)
            mode = item.external_attr >> 16
            require(not p.is_absolute() and ".." not in p.parts and "\\" not in item.filename,
                    "unsafe ZIP path")
            require((mode & 0o170000) != 0o120000, "ZIP symlink is not accepted")
        require(archive.testzip() is None, "ZIP CRC integrity failed")
        fixture = reconstruct(args.tooling_repo, subject, Path(tmp), source, count, inventory_digest)
        compared = {}
        for path in RECONSTRUCTED:
            expected = (fixture / path).read_bytes()
            require(archive.read(path) == expected, "reconstructed bytes differ: " + path)
            compared[path] = digest(expected)
        for path, expected in {
            "diagnostic-workflow.yml": committed(args.tooling_repo, TOOLING, WORKFLOW),
            "diagnostic-tooling.sha": (TOOLING + "\n").encode(),
            "diagnostic-tools.sha256": "".join(
                digest(committed(args.tooling_repo, TOOLING, path)) + "  " + path + "\n"
                for path in TOOLS).encode(),
            "android-native/build/visual-evidence/native-source.sha": (source + "\n").encode(),
        }.items():
            require(archive.read(path) == expected, "immutable binding differs: " + path)
            compared[path] = digest(expected)

        manifest_bytes = archive.read("fixture-manifest.json")
        manifest = json.loads(manifest_bytes)
        files = manifest["files"]
        encoded_inventory = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
        require(manifest["source_sha"] == source and len(files) == count,
                "declared source or web file count differs")
        require(digest(encoded_inventory) == inventory_digest, "web inventory digest differs")
        require(archive.read("native-original-source.java") == committed(args.tooling_repo, source, ACTIVITY),
                "native original source differs from subject commit")

        # The uploaded inventory is a CI assertion; no APK is uploaded to independently unzip here.
        inventory = json.loads(archive.read("apk-inventory.json"))
        assets = sorted({entry["asset"] for entry in files.values()})
        require(inventory == {"expected_assets": assets, "actual_assets": assets,
                              "missing": [], "unexpected": []}, "recorded APK inventory differs")
        summary = json.loads(archive.read("pinned-evidence-summary.json"))
        require(summary["source_sha"] == source and summary["web_files"] == count and
                summary["manifest_sha256"] == digest(manifest_bytes) and summary["status"] == "PASS",
                "recorded delivery summary binding differs")
        apk_hash_text = archive.read("android-native/build/visual-evidence/apk-sha256.txt").decode()
        require(apk_hash_text.split()[0] == summary["apk_sha256"], "recorded APK hashes disagree")
        boundary = dict(line.split("=", 1) for line in archive.read(
            "android-native/build/visual-evidence/source-boundary.txt").decode().splitlines() if "=" in line)
        for key, value in {"web_source": "pinned-apk-fixture", "web_bytes_pinned_to_pr": "true",
                           "native_instrumented": "true", "external_requests": "blocked"}.items():
            require(boundary.get(key) == value, "recorded transport boundary differs: " + key)
        log = archive.read("android-native/build/visual-evidence/logcat.txt").decode()
        require(not re.search(r"RobysPinned\s*: (MISSING|HASH_MISMATCH|ERROR|METHOD|RANGE_ERROR)\b", log),
                "fixture delivery error in captured log")
        served = re.findall(r"RobysPinned\s*: SERVED (\S+) sha256=([a-f0-9]{64}) status=(200|206)", log)
        paths = sorted({path for path, _, _ in served})
        required_paths = {"index.html", "android-handoff.js", "bootstrap-v2.js"}
        if args.arm != "control":
            required_paths.add("android-native-product-frame.js")
        require(required_paths <= set(paths), "required candidate/control resources not observed")
        for path, served_hash, _ in served:
            require(path in files and served_hash == files[path]["sha256"], "served resource hash differs: " + path)
        require(paths == summary["served_paths"] and len(served) == summary["served_requests"],
                "served resources do not reproduce summary")
        states = archive.read("android-native/build/visual-evidence/handoff-states.txt").decode()
        capture_exit = archive.read("android-native/build/visual-evidence/capture-exit.txt").decode().strip()
        return {
            "schema_version": 1, "provenance_status": "PASS", "run_id": RUN,
            "verifier_sha256": digest(Path(__file__).read_bytes()),
            "artifact_id": args.artifact_id, "artifact_sha256": actual_zip_hash,
            "arm": args.arm, "source_sha": source, "tooling_sha": TOOLING,
            "web_files": count, "web_inventory_sha256": inventory_digest,
            "reconstructed_and_bound_files": compared, "compared_file_count": len(compared),
            "diagnostic_tool_hash_count": len(TOOLS), "served_paths": paths,
            "served_request_count": len(served), "recorded_apk_sha256": summary["apk_sha256"],
            "capture_exit_record": capture_exit, "captured_handoff_states": states.splitlines(),
            "limits": [
                "Run/artifact IDs are caller-supplied metadata; digest binds the reviewed ZIP bytes.",
                "APK is absent from artifact; its recorded hash/inventory are internally consistent CI assertions, not a local APK rebuild.",
                "Delivery may include service-worker precaching and does not prove module execution.",
                "Provenance PASS does not override native failure or establish pixel presentation, trace coverage, smoothness, or an upgrade-cache cure.",
            ],
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--sha256", required=True, help="Expected SHA256 from GitHub artifact metadata")
    parser.add_argument("--artifact-id", type=int, required=True)
    parser.add_argument("--arm", choices=ARMS, required=True)
    parser.add_argument("--subject", type=Path, required=True)
    parser.add_argument("--tooling-repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        report = verify(args)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        print(json.dumps({"provenance_status": "FAIL", "error": str(error)}))
        return 1
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered)
    print(rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main())
