#!/usr/bin/env python3
"""Recreated diagnostic observer; preserve the immutable subject and capture assertions."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = "android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java"
SUBJECT = "7ca13b9adbf45b953c3b0997107d010e7bad1d9b"
WEB_COUNT = 240
WEB_SHA256 = "2c97e25ebf4e0c2b16f50818bc3a577b569a5d18a0f623ed21e498ff26e4395c"
START = "        configureWebView();\n"
DESTROY = "    protected void onDestroy() {\n"
FIELD = "    private final Handler mainHandler = new Handler(Looper.getMainLooper());\n"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def prepare(directory, source, expected_source_sha=SUBJECT, expected_web_sha256=WEB_SHA256, expected_web_count=WEB_COUNT):
    root = Path(directory).resolve()
    source = Path(source).resolve()
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    require(revision == expected_source_sha, "observer requires the declared immutable subject")
    original = subprocess.check_output(["git", "show", f"{revision}:{ACTIVITY}"], cwd=source)
    manifest_bytes = (root / "fixture-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    assets = root / "android-native/app/src/main/assets"
    require((assets / "pinned-manifest.json").read_bytes() == manifest_bytes, "embedded manifest differs")
    require(manifest["source_sha"] == revision, "fixture subject differs")
    require(manifest["native_original_sha256"] == sha(original), "original source hash differs")
    transport = (root / ACTIVITY).read_bytes()
    require(manifest["native_instrumented_sha256"] == sha(transport), "transport source hash differs")
    require("rendering_observer" not in manifest, "observer is already installed")
    inventory = json.dumps(manifest["files"], sort_keys=True, separators=(",", ":")).encode()
    require(len(manifest["files"]) == expected_web_count and sha(inventory) == expected_web_sha256,
            "declared immutable web inventory differs")
    for entry in manifest["files"].values():
        data = (assets / "pinned-web" / entry["asset"]).read_bytes()
        require(sha(data) == entry["sha256"] and len(data) == entry["bytes"], "pinned asset bytes differ")

    trace_path = root / "trace-evidence/manifest.json"
    trace = json.loads(trace_path.read_bytes())
    capture = (root / "capture.sh").read_bytes()
    trace_capture = (root / "trace-capture.sh").read_bytes()
    require(trace["source_sha"] == revision, "system trace subject differs")
    require(trace["original_capture_sha256"] == sha(capture), "capture bytes differ")
    require(trace["trace_capture_sha256"] == sha(trace_capture), "trace capture bytes differ")
    text = transport.decode()
    for anchor in (FIELD, START, DESTROY):
        require(text.count(anchor) == 1, "observer insertion boundary changed: " + anchor.strip())
    observed = text.replace(FIELD, FIELD + "    private RobysRenderingTrace renderingTrace;\n", 1)
    observed = observed.replace(START, START + "        renderingTrace = RobysRenderingTrace.start(this);\n", 1)
    observed = observed.replace(DESTROY, DESTROY +
                                '        if (renderingTrace != null) renderingTrace.stop("activity_destroy");\n', 1)
    helper = (ROOT / "scripts/qa/RobysRenderingTrace.java").read_bytes()
    helper_path = (root / ACTIVITY).with_name("RobysRenderingTrace.java")
    products = ["rendering-observer-manifest.json", "rendering-preparation-summary.json",
                "native-original-source.java", "native-transport-source.java", "native-transport-manifest.json",
                "native-transport-instrumentation.diff", "rendering-observer.diff"]
    require(not helper_path.exists() and not any((root / name).exists() for name in products),
            "observer output already exists")
    old_diff = (root / "native-instrumentation.diff").read_bytes()
    observer = {
        "version": 1, "implementation": "recreated after workspace maintenance; revalidated",
        "source_sha": revision, "native_original_sha256": sha(original),
        "native_transport_sha256": sha(transport), "native_observer_sha256": sha(observed.encode()),
        "helper_sha256": sha(helper), "web_inventory_sha256": sha(inventory), "web_files": expected_web_count,
        "capture_sha256": sha(capture), "trace_capture_sha256": sha(trace_capture),
        "stop_after_ms": 35000, "mode": "RECORD_UNTIL_FULL",
        "categories": ["CATEGORIES_RENDERING", "CATEGORIES_ANDROID_WEBVIEW",
                       "disabled-by-default-gpu.service", "disabled-by-default-skia.shaders"],
        "scope": "WebView rendering observer adds overhead; no product performance waiver",
    }
    manifest["native_transport_sha256"] = sha(transport)
    manifest["native_instrumented_sha256"] = sha(observed.encode())
    manifest["rendering_observer"] = observer
    trace["app_instrumentation"] = "pinned transport plus declared WebView rendering observer"
    trace["rendering_observer_manifest_sha256"] = sha(encoded(observer))
    summary = {**observer, "capture_bytes_unchanged": True, "trace_capture_bytes_unchanged": True,
               "subject_worktree_modified": False}
    # All rejection gates above run before any write to the isolated fixture.
    (root / "native-original-source.java").write_bytes(original)
    (root / "native-transport-source.java").write_bytes(transport)
    (root / "native-transport-manifest.json").write_bytes(manifest_bytes)
    (root / "native-transport-instrumentation.diff").write_bytes(old_diff)
    (root / ACTIVITY).write_text(observed)
    helper_path.write_bytes(helper)
    updated = encoded(manifest)
    (root / "fixture-manifest.json").write_bytes(updated)
    (assets / "pinned-manifest.json").write_bytes(updated)
    (root / "rendering-observer-manifest.json").write_bytes(encoded(observer))
    (root / "rendering-preparation-summary.json").write_bytes(encoded(summary))
    trace_path.write_bytes(encoded(trace))
    def delta(before, after, name):
        return "".join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                          fromfile=name, tofile=name))
    helper_diff = delta("", helper.decode(), str(Path(ACTIVITY).with_name("RobysRenderingTrace.java")))
    (root / "rendering-observer.diff").write_text(delta(transport.decode(), observed, ACTIVITY) + helper_diff)
    (root / "native-instrumentation.diff").write_text(delta(original.decode(), observed, ACTIVITY) + helper_diff)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    parser.add_argument("--source", required=True)
    parser.add_argument("--expected-source-sha", default=SUBJECT)
    parser.add_argument("--expected-web-sha256", default=WEB_SHA256)
    parser.add_argument("--expected-web-count", type=int, default=WEB_COUNT)
    args = parser.parse_args()
    print(json.dumps(prepare(args.directory, args.source, args.expected_source_sha,
                             args.expected_web_sha256, args.expected_web_count), sort_keys=True))
