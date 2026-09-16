import { readFileSync } from "node:fs";

const fail = (message) => { throw new Error(`[ANDROID-HANDOFF-SOURCE-001] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const mainActivity = readFileSync("android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java", "utf8");
const mainManifest = readFileSync("android-native/app/src/main/AndroidManifest.xml", "utf8");
const mainNetwork = readFileSync("android-native/app/src/main/res/xml/network_security_config.xml", "utf8");
const debugManifest = readFileSync("android-native/app/src/debug/AndroidManifest.xml", "utf8");
const debugNetwork = readFileSync("android-native/app/src/debug/res/xml/network_security_config.xml", "utf8");
const capture = readFileSync(".github/scripts/capture-android-launch.sh", "utf8");

assert(mainActivity.includes('RELEASE_APP_URL_BASE = "https://safal207.github.io/robys-coffee-house-demo/?entry=android-handoff"'), "release WebView URL must stay HTTPS GitHub Pages");
assert(mainActivity.includes('DEBUG_APP_URL_BASE = "http://127.0.0.1:4173/?entry=android-handoff"'), "debug WebView URL must target adb-reversed localhost");
assert(mainActivity.includes('DEBUG_TRUSTED_HOST = "127.0.0.1"'), "debug trust boundary must be loopback-only");
assert(mainActivity.includes('isDebuggableBuild() ? DEBUG_APP_URL_BASE : RELEASE_APP_URL_BASE'), "runtime must select localhost only for debuggable APKs");
assert(mainActivity.includes('if (!"http".equalsIgnoreCase(uri.getScheme())) return false;'), "debug trust boundary must require HTTP loopback");
assert(mainActivity.includes('if (!"https".equalsIgnoreCase(uri.getScheme())) return false;'), "release trust boundary must require HTTPS");
assert(mainManifest.includes('android:usesCleartextTraffic="false"'), "release manifest must remain cleartext-deny");
assert(mainNetwork.includes('cleartextTrafficPermitted="false"'), "release network security config must remain cleartext-deny");
assert(debugManifest.includes('android:usesCleartextTraffic="true"'), "debug manifest must explicitly opt into localhost cleartext");
assert(debugNetwork.includes('cleartextTrafficPermitted="true"'), "debug source set must permit adb-reversed localhost HTTP");
assert(capture.includes('python3 -m http.server "$WEB_PORT" --bind 127.0.0.1'), "capture must serve the exact checkout locally");
assert(capture.includes('adb reverse "tcp:$WEB_PORT" "tcp:$WEB_PORT"'), "capture must bind emulator loopback to the runner checkout");
assert(capture.includes('web_source=exact-head-checkout'), "evidence must name the exact-head source");
assert(capture.includes('web_bytes_pinned_to_pr=true'), "evidence must fail closed unless web bytes are PR-pinned");
assert(capture.includes('web_source_sha=%s'), "evidence must record the web source SHA");
assert(!capture.includes('web_source=public-github-pages'), "mutable public Pages must not be the atomic evidence source");
assert(!capture.includes('web_bytes_pinned_to_pr=false'), "unpinned web evidence marker must not return");

console.log("✅ ANDROID-HANDOFF-SOURCE-001 passed: debug capture is exact-head pinned while release remains HTTPS-only.");
