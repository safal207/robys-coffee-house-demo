#!/usr/bin/env python3
"""Exercise actual committed payload preparation and identity rejection boundaries."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


prepare = module("prepare-android-pinned-fixture").prepare
verify = module("verify-android-pinned-evidence").verify
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory) / "fixture"
    with contextlib.redirect_stdout(io.StringIO()):
        manifest = prepare(ROOT, root)
    for path in ("src/products/menu-v1/_anchors/cold-cup-branded.webp",
                 "src/pairings-data/final/cool-lime-macaron.webp.b64.txt",
                 "src/pairings-data/final/iced-san-sebastian.webp.b64.txt"):
        assert path in manifest["files"], f"previously omitted resource: {path}"
    assert all(re.fullmatch(r"[a-f0-9]{64}", e["asset"]) for e in manifest["files"].values())
    assets = root / "android-native/app/src/main/assets"
    apk = root / "android-native/app/build/outputs/apk/debug/app-debug.apk"
    apk.parent.mkdir(parents=True)
    log = root / "android-native/build/visual-evidence/logcat.txt"
    log.parent.mkdir(parents=True)
    valid = "\n".join("D RobysPinned: SERVED " + p + " sha256=" + manifest["files"][p]["sha256"] + " status=200"
                      for p in ("index.html", "android-handoff.js"))
    target = manifest["files"]["index.html"]["asset"]
    for case, expected in (("valid", True), ("missing-asset", False), ("extra-asset", False),
                           ("corrupt-asset", False), ("missing-request", False), ("missing-bridge", False)):
        with zipfile.ZipFile(apk, "w") as archive:
            archive.writestr("assets/pinned-manifest.json", (assets / "pinned-manifest.json").read_bytes())
            for asset in sorted({entry["asset"] for entry in manifest["files"].values()}):
                if case == "missing-asset" and asset == target:
                    continue
                data = (assets / "pinned-web" / asset).read_bytes()
                if case == "corrupt-asset" and asset == target:
                    data += b"corrupt"
                archive.writestr("assets/pinned-web/" + asset, data)
            if case == "extra-asset":
                archive.writestr("assets/pinned-web/unlisted", b"extra")
        text = valid
        if case == "missing-request":
            text += "\nD RobysPinned: MISSING asset.css\nD RobysHandoff: HANDOFF_COMPLETE"
        if case == "missing-bridge":
            text = valid.splitlines()[0]
        log.write_text(text)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                verify(root)
            actual = True
        except AssertionError:
            actual = False
        assert actual == expected, case
    print("PINNED-FIXTURE: 6/6 identity controls PASS; text/underscore resources retained")
