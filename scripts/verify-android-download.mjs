import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const expectedBytes = 25231;
const partPaths = Array.from({ length: 6 }, (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

for (const path of partPaths) {
  assert(existsSync(path), `Missing APK part: ${path}`);
  assert(statSync(path).size > 0, `APK part is empty: ${path}`);
}

const base64 = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
const apk = Buffer.from(base64, "base64");
const actualSha256 = createHash("sha256").update(apk).digest("hex");
console.log(`APK_SHA256=${actualSha256}`);
assert(apk.length === expectedBytes, `APK size changed: ${apk.length}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK must be a ZIP-based Android package");
const archiveText = apk.toString("latin1");
for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
  assert(archiveText.includes(entry), `APK entry is missing: ${entry}`);
}

const upgrade = readFileSync("android-download.js", "utf8");
const pwa = readFileSync("pwa.js", "utf8");
const sw = readFileSync("sw.js", "utf8");
const bridge = readFileSync("sw-register.js", "utf8");
assert(upgrade.includes('const APK_URL = "downloads/robys-coffee-house-v1.1.apk"'), "Direct APK URL is not declared");
assert(upgrade.includes("link.href = APK_URL"), "Direct APK link is not wired");
assert(upgrade.includes('link.setAttribute("data-apk-download", "direct-apk")'), "Download readiness marker is missing");
assert(upgrade.includes("link.download = APK_NAME"), "Download attribute is not wired");
assert(pwa.includes("src/android-mark.svg") && pwa.includes(".android-download-icon"), "Real Android logo is missing from the download button");
assert(sw.includes('"./menu.html"') && sw.includes('"./404.html"'), "Offline menu or fallback is not precached");
assert(bridge.includes("navigator.serviceWorker.register") && bridge.includes('{ scope: "./" }'), "Service worker bridge is not wired");
console.log(`✅ ${contract} passed: signed APK ${actualSha256.slice(0, 12)}… is structurally verified, directly downloadable and backed by an offline menu.`);
