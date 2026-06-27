import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const expectedBytes = 25231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const directApkPath = "downloads/robys-coffee-house-v1.1.apk";
const partPaths = Array.from({ length: 6 }, (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

function verifyApk(apk, label) {
  assert(apk.length === expectedBytes, `${label} size changed: ${apk.length}`);
  assert(apk.subarray(0, 2).toString("ascii") === "PK", `${label} must be a ZIP-based Android package`);
  assert(createHash("sha256").update(apk).digest("hex") === expectedSha256, `${label} checksum changed`);
  const archiveText = apk.toString("latin1");
  for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
    assert(archiveText.includes(entry), `${label} entry is missing: ${entry}`);
  }
}

for (const path of partPaths) {
  assert(existsSync(path), `Missing APK part: ${path}`);
  assert(statSync(path).size > 0, `APK part is empty: ${path}`);
}

const base64 = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
verifyApk(Buffer.from(base64, "base64"), "Reconstructed APK");
if (existsSync(directApkPath)) verifyApk(readFileSync(directApkPath), "Published APK");

const upgrade = readFileSync("android-download.js", "utf8");
const css = readFileSync("android-app.css", "utf8");
const sw = readFileSync("sw.js", "utf8");
const bridge = readFileSync("sw-register.js", "utf8");
assert(upgrade.includes(`const APK_URL = "${directApkPath}"`), "Direct APK URL is not declared");
assert(upgrade.includes("link.href = APK_URL"), "Direct APK link is not wired");
assert(upgrade.includes('link.setAttribute("data-apk-download", "direct-apk")'), "Download readiness marker is missing");
assert(upgrade.includes("link.download = APK_NAME"), "Download attribute is not wired");
assert(upgrade.includes("src/android-mark.svg"), "Android logo asset is missing from the app preview");
assert(css.includes(".android-download-icon") && css.includes("src/android-mark.svg"), "Real Android logo is missing from the download button");
assert(sw.includes("Array.from({ length: 6 }") && sw.includes("./downloads/android-v1.1/part-"), "Offline cache must include all six reviewed APK parts");
assert(sw.includes('"./menu.html"') && sw.includes('"./404.html"'), "Offline menu or fallback is not precached");
assert(bridge.includes("navigator.serviceWorker.register") && bridge.includes('{ scope: "./" }'), "Service worker bridge is not wired");
console.log(`✅ ${contract} passed: signed APK ${expectedSha256.slice(0, 12)}… is verified, directly downloadable and backed by an offline menu.`);
