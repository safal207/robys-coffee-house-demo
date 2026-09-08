#!/usr/bin/env python3
from __future__ import annotations
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

PRODUCT_SHA = "9e4e09d09affa28712b27bb6ca48961adc8cbca8"
PINNED_WEB_URL = "http://10.0.2.2:4199/?entry=android-handoff"
MAIN_ACTIVITY = Path("android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java")
MAIN_ACTIVITY_BLOB = "ddc68d69bae045c5202a4641a2f552ed79338ab8"
CAPTURE = Path(".github/scripts/capture-android-launch.sh")
CAPTURE_BLOB = "52222dbbee45bad86df5604bbc5acf5b3f5c1914"
OUT = Path(".artifacts/android-pinned-web")


def blob(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def replace_one(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError(f"expected exactly one match: {old[:100]!r}")
    return source.replace(old, new)


def apply_native() -> None:
    data = MAIN_ACTIVITY.read_bytes()
    if blob(data) != MAIN_ACTIVITY_BLOB:
        raise RuntimeError(f"unexpected MainActivity blob {blob(data)}")
    s = data.decode()
    s = replace_one(
        s,
        '    private static final String APP_URL_BASE = "https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff";\n',
        '    private static final String APP_URL_BASE = "https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff";\n'
        '    private static final String TEST_APP_URL_EXTRA = "robys.test.APP_URL";\n',
    )
    s = replace_one(
        s,
        "    private Runnable visualStateTimeout;\n",
        "    private Runnable visualStateTimeout;\n    private String appUrlBase = APP_URL_BASE;\n",
    )
    s = replace_one(
        s,
        "        super.onCreate(savedInstanceState);\n\n        root = new FrameLayout(this);",
        "        super.onCreate(savedInstanceState);\n        configureDebugTestUrl();\n\n        root = new FrameLayout(this);",
    )
    s = replace_one(
        s,
        '    private String appUrlForGeneration(int generation) {\n        return APP_URL_BASE + "&handoff-gen=" + generation;\n    }',
        '    private String appUrlForGeneration(int generation) {\n'
        '        String separator = appUrlBase.contains("?") ? "&" : "?";\n'
        '        return appUrlBase + separator + "handoff-gen=" + generation;\n'
        '    }',
    )
    old = """    private boolean isTrusted(Uri uri) {
        if (uri == null || !\"https\".equalsIgnoreCase(uri.getScheme())) return false;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String path = uri.getPath();
        return path != null && path.startsWith(TRUSTED_PATH_PREFIX);
    }
"""
    new = """    private void configureDebugTestUrl() {
        if (!isDebuggableBuild()) return;
        String override = getIntent().getStringExtra(TEST_APP_URL_EXTRA);
        if (override == null || override.isBlank()) return;
        Uri uri = Uri.parse(override);
        if (isPinnedDebugOrigin(uri)) appUrlBase = override;
    }

    private boolean isDebuggableBuild() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private boolean isPinnedDebugOrigin(Uri uri) {
        return uri != null
                && \"http\".equalsIgnoreCase(uri.getScheme())
                && \"10.0.2.2\".equals(uri.getHost())
                && uri.getPort() == 4199;
    }

    private boolean isTrusted(Uri uri) {
        if (uri == null) return false;
        if (isDebuggableBuild() && isPinnedDebugOrigin(uri)) return true;
        if (!\"https\".equalsIgnoreCase(uri.getScheme())) return false;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String path = uri.getPath();
        return path != null && path.startsWith(TRUSTED_PATH_PREFIX);
    }
"""
    s = replace_one(s, old, new)
    MAIN_ACTIVITY.write_text(s)

    debug_manifest = Path("android-native/app/src/debug/AndroidManifest.xml")
    debug_manifest.parent.mkdir(parents=True, exist_ok=True)
    debug_manifest.write_text("""<?xml version=\"1.0\" encoding=\"utf-8\"?>
<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\"
    xmlns:tools=\"http://schemas.android.com/tools\">
    <application
        android:usesCleartextTraffic=\"true\"
        tools:replace=\"android:usesCleartextTraffic\" />
</manifest>
""")
    debug_network = Path("android-native/app/src/debug/res/xml/network_security_config.xml")
    debug_network.parent.mkdir(parents=True, exist_ok=True)
    debug_network.write_text("""<?xml version=\"1.0\" encoding=\"utf-8\"?>
<network-security-config>
    <base-config cleartextTrafficPermitted=\"false\">
        <trust-anchors><certificates src=\"system\" /></trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted=\"true\">
        <domain includeSubdomains=\"false\">10.0.2.2</domain>
    </domain-config>
</network-security-config>
""")
    for required in (
        "BRIDGE_READY_TIMEOUT_MS = 3_500L",
        "VISUAL_CALLBACK_TIMEOUT_MS = 1_500L",
        "LOAD_COMMIT_HARD_TIMEOUT_MS = 24_000L",
    ):
        if required not in s:
            raise RuntimeError(f"deadline changed or missing: {required}")
    print("debug-only native harness applied")


def prepare_capture() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = CAPTURE.read_bytes()
    if blob(data) != CAPTURE_BLOB:
        raise RuntimeError(f"unexpected capture blob {blob(data)}")
    s = data.decode()
    old = "printf 'web_source=public-github-pages\\nweb_url=https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff\\nweb_bytes_pinned_to_pr=false\\n' > \"$OUT/source-boundary.txt\""
    new = "printf 'web_source=pinned-git-archive\\nweb_url=%s\\nweb_bytes_pinned_to_pr=true\\nweb_commit=%s\\n' \"$ROBYS_PINNED_WEB_URL\" \"$ROBYS_WEB_COMMIT\" > \"$OUT/source-boundary.txt\""
    s = replace_one(s, old, new)
    s = replace_one(
        s,
        'adb shell am start -W -n "$PACKAGE/$ACTIVITY" > "$OUT/activity-start.txt"',
        'adb shell am start -W -n "$PACKAGE/$ACTIVITY" --es robys.test.APP_URL "$ROBYS_PINNED_WEB_URL" > "$OUT/activity-start.txt"',
    )
    target = OUT / "capture-pinned.sh"
    target.write_text(s)
    target.chmod(0o755)
    for required in (
        "HANDOFF_WAIT_SECONDS=30",
        "LOAD_COMMIT_TIMEOUT|VISUAL_STATE_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR",
        "native_line < commit_line && commit_line < ready_line && ready_line < visual_line && visual_line < complete_line",
    ):
        if required not in s:
            raise RuntimeError(f"capture assertion changed: {required}")
    wrapper = OUT / "run-pinned.sh"
    wrapper.write_text(f"""#!/usr/bin/env bash
set -euo pipefail
mkdir -p android-native/build/visual-evidence
python3 -m http.server 4199 --bind 0.0.0.0 --directory /tmp/robys-pinned-web > android-native/build/visual-evidence/pinned-web-server.log 2>&1 &
server_pid=$!
cleanup_server() {{ kill \"$server_pid\" 2>/dev/null || true; }}
trap cleanup_server EXIT
for i in $(seq 1 40); do
  if curl --fail --silent 'http://127.0.0.1:4199/?entry=android-handoff' >/dev/null; then break; fi
  sleep .1
done
curl --fail --silent http://127.0.0.1:4199/android-handoff.js >/dev/null
export ROBYS_PINNED_WEB_URL='{PINNED_WEB_URL}'
export ROBYS_WEB_COMMIT='{PRODUCT_SHA}'
bash {target}
""")
    wrapper.chmod(0o755)
    print(target)


def analyze() -> None:
    evidence = Path("android-native/build/visual-evidence")
    boundary = (evidence / "source-boundary.txt").read_text().splitlines()
    required = {
        "web_source=pinned-git-archive",
        "web_bytes_pinned_to_pr=true",
        f"web_commit={PRODUCT_SHA}",
    }
    missing = required - set(boundary)
    if missing:
        raise RuntimeError(f"missing pinned provenance: {sorted(missing)}")
    states_path = evidence / "handoff-states.txt"
    text = states_path.read_text()
    if not re.search(r"HANDOFF_COMPLETE$", text, re.M):
        raise RuntimeError("HANDOFF_COMPLETE missing")
    if re.search(r"LOAD_COMMIT_TIMEOUT|VISUAL_STATE_TIMEOUT|MAIN_FRAME_ERROR|SSL_ERROR", text):
        raise RuntimeError("terminal state present")
    rows = []
    for line in text.splitlines():
        m = re.match(r"(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+) .*RobysHandoff: (.+)$", line)
        if m:
            t = datetime.datetime.strptime("2026-" + m.group(1) + " " + m.group(2), "%Y-%m-%d %H:%M:%S.%f")
            rows.append((t, m.group(3)))
    if not rows:
        raise RuntimeError("no timed states")
    timing = []
    for i, (t, state) in enumerate(rows):
        timing.append({
            "state": state,
            "from_start_ms": round((t - rows[0][0]).total_seconds() * 1000, 1),
            "from_previous_ms": 0 if i == 0 else round((t - rows[i-1][0]).total_seconds() * 1000, 1),
        })
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "state-timing.json").write_text(json.dumps(timing, indent=2) + "\n")
    for name in ("source-boundary.txt", "handoff-states.txt", "logcat.txt", "webview-provider.txt", "evidence-summary.txt", "activity-start.txt", "capture-exit.txt"):
        p = evidence / name
        if p.exists():
            (OUT / name).write_bytes(p.read_bytes())
    print(json.dumps(timing, indent=2))


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"apply-native", "prepare-capture", "analyze"}:
        raise SystemExit("usage: android-pinned-web-diagnostic.py apply-native|prepare-capture|analyze")
    {"apply-native": apply_native, "prepare-capture": prepare_capture, "analyze": analyze}[sys.argv[1]]()


if __name__ == "__main__":
    main()
