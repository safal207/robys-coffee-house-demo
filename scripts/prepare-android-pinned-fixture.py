#!/usr/bin/env python3
"""Build an isolated diagnostic source tree from committed bytes; never edit the subject."""
import argparse
import difflib
import hashlib
import io
import json
import mimetypes
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = "android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java"
CAPTURE = ".github/scripts/capture-android-launch.sh"
EXTENSIONS = {".html", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg",
              ".webp", ".woff", ".woff2", ".ttf", ".ico", ".mp4", ".webm", ".webmanifest", ".txt"}
EXCLUDED = {"android-native", "docs", "qa", "scripts", "tests", "tools"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"fixture injection boundary changed: {old[:70]}")
    return text.replace(old, new, 1)


def prepare(source, output):
    source = Path(source).resolve()
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("fixture output already exists; use a fresh directory")
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    archive = subprocess.check_output(["git", "archive", revision], cwd=source)
    committed = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar:
            p = PurePosixPath(member.name)
            if p.is_absolute() or ".." in p.parts:
                raise ValueError("invalid archive path")
            if member.isfile():
                committed[member.name] = tar.extractfile(member).read()
            elif not member.isdir():
                raise ValueError("fixture does not accept links or special files")
    files = {}
    for name, data in committed.items():
        path = PurePosixPath(name)
        if name.startswith("android-native/"):
            target = output / name
        elif not path.parts[0].startswith(".") and path.parts[0] not in EXCLUDED and path.suffix in EXTENSIONS:
            # AAPT normally ignores underscore-prefixed directories such as
            # src/products/menu-v1/_anchors. Flat digest names preserve EVERY
            # resource without changing Android packaging filters or the URL.
            asset = sha(data)
            target = output / "android-native/app/src/main/assets/pinned-web" / asset
            mime = {".js": "application/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json"}.get(path.suffix)
            files[name] = {"sha256": sha(data), "asset": asset, "bytes": len(data),
                           "mime": mime or mimetypes.guess_type(name)[0] or "application/octet-stream"}
        else:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    for required in ("index.html", "android-handoff.js", "bootstrap-v2.js", "sw.js"):
        if required not in files:
            raise ValueError(f"missing required pinned asset: {required}")

    original = committed[ACTIVITY].decode()
    marker = "        webView.setWebViewClient(new WebViewClient() {"
    hook = """
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return PinnedWebFixture.serve(MainActivity.this, request);
            }
"""
    worker = """        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            android.webkit.ServiceWorkerController.getInstance().setServiceWorkerClient(
                new android.webkit.ServiceWorkerClient() {
                    @Override
                    public android.webkit.WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        return PinnedWebFixture.serve(MainActivity.this, request);
                    }
                });
        }

"""
    instrumented = replace_once(original, marker, worker + marker + hook)
    (output / ACTIVITY).write_text(instrumented)
    adapter = (ROOT / "scripts/qa/PinnedWebFixture.java").read_bytes()
    (output / ACTIVITY).with_name("PinnedWebFixture.java").write_bytes(adapter)
    manifest = {"version": 1, "source_sha": revision, "native_instrumented": True,
                "transport": "WebView and ServiceWorker request interception from APK assets",
                "external_requests": "blocked with HTTP 503", "cache": "no-store; cold app",
                "native_original_sha256": sha(original.encode()),
                "native_instrumented_sha256": sha(instrumented.encode()),
                "adapter_sha256": sha(adapter), "files": files}
    manifest_data = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    assets = output / "android-native/app/src/main/assets"
    (assets / "pinned-manifest.json").write_bytes(manifest_data)
    (output / "fixture-manifest.json").write_bytes(manifest_data)
    (output / "native-instrumentation.diff").write_text("".join(difflib.unified_diff(
        original.splitlines(True), instrumented.splitlines(True), fromfile=ACTIVITY, tofile=ACTIVITY)))

    # Reuse all existing timing, recorder, terminal-failure and state-order checks.
    # Only source labels change in the isolated copy; the production smoke is unchanged.
    capture = (ROOT / CAPTURE).read_text()
    capture = replace_once(capture, 'git rev-parse HEAD > "$OUT/native-source.sha"',
                           f"printf '%s\\n' '{revision}' > \"$OUT/native-source.sha\"")
    capture = replace_once(capture, "web_source=public-github-pages\\n", "web_source=pinned-apk-fixture\\n")
    capture = replace_once(capture, "web_bytes_pinned_to_pr=false\\n",
                           "web_bytes_pinned_to_pr=true\\nnative_instrumented=true\\nexternal_requests=blocked\\n")
    script = output / "capture.sh"
    script.write_text(capture)
    script.chmod(0o755)
    print(json.dumps({"source_sha": revision, "web_files": len(files), "output": str(output),
                      "manifest_sha256": sha(manifest_data), "native_instrumented": True}))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    prepare(args.source, args.output)
