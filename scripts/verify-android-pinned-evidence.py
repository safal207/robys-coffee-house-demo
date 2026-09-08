#!/usr/bin/env python3
"""Check diagnostic APK resource identity; never turn a handoff failure into PASS."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


ENTRY_MODULES = ("android-handoff.js", "android-native-product-frame.js")


def verify(directory, entry_module="android-handoff.js"):
    assert entry_module in ENTRY_MODULES, "unsupported entry module"
    root = Path(directory)
    manifest_bytes = (root / "fixture-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    assert entry_module in manifest["files"], "required entry module absent from inventory"
    apk = root / "android-native/app/build/outputs/apk/debug/app-debug.apk"
    with zipfile.ZipFile(apk) as archive:
        assert archive.read("assets/pinned-manifest.json") == manifest_bytes, "APK manifest mismatch"
        names = {n.removeprefix("assets/pinned-web/") for n in archive.namelist()
                 if n.startswith("assets/pinned-web/") and not n.endswith("/")}
        expected = {entry["asset"] for entry in manifest["files"].values()}
        inventory = {"expected_assets": sorted(expected), "actual_assets": sorted(names),
                     "missing": sorted(expected - names), "unexpected": sorted(names - expected)}
        (root / "apk-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
        assert names == expected, f"APK resource inventory mismatch: {inventory['missing']} missing; {inventory['unexpected']} unexpected"
        for path, entry in manifest["files"].items():
            data = archive.read("assets/pinned-web/" + entry["asset"])
            assert len(data) == entry["bytes"], f"APK size mismatch: {path}"
            assert hashlib.sha256(data).hexdigest() == entry["sha256"], f"APK hash mismatch: {path}"
    log = (root / "android-native/build/visual-evidence/logcat.txt").read_text()
    assert not re.search(r"RobysPinned\s*: (MISSING|HASH_MISMATCH|ERROR|METHOD|RANGE_ERROR)\b", log), "fixture delivery error"
    served = re.findall(r"RobysPinned\s*: SERVED (\S+) sha256=([a-f0-9]{64}) status=(200|206)", log)
    assert {"index.html", entry_module} <= {p for p, _, _ in served}, "required launch resources not observed"
    for path, digest, _ in served:
        assert path in manifest["files"] and digest == manifest["files"][path]["sha256"], "served resource mismatch"
    result = {"source_sha": manifest["source_sha"], "apk_sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
              "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(), "web_files": len(manifest["files"]),
              "entry_module": entry_module,
              "served_requests": len(served), "served_paths": sorted({p for p, _, _ in served}),
              "scope": "pinned resource identity only; capture.sh independently enforces handoff", "status": "PASS"}
    (root / "pinned-evidence-summary.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    parser.add_argument("--entry-module", choices=ENTRY_MODULES, default="android-handoff.js",
                        help="entry module whose exact delivery is required")
    args = parser.parse_args()
    verify(args.directory, args.entry_module)
