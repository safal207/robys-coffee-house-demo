import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const partPaths = Array.from(
  { length: 6 },
  (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`
);
const expectedBytes = 25231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

for (const path of partPaths) {
  assert(existsSync(path), `Missing APK part: ${path}`);
  assert(statSync(path).isFile() && statSync(path).size > 0, `APK part must be a non-empty file: ${path}`);
}

const base64 = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
const apk = Buffer.from(base64, "base64");
assert(apk.length === expectedBytes, `APK size changed: expected ${expectedBytes}, found ${apk.length}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK must be a valid ZIP-based Android package");
const sha256 = createHash("sha256").update(apk).digest("hex");
assert(sha256 === expectedSha256, `APK checksum changed: ${sha256}`);

const archiveText = apk.toString("latin1");
for (const entry of [
  "AndroidManifest.xml",
  "classes.dex",
  "resources.arsc",
  "META-INF/ROBYS-RE.SF",
  "META-INF/ROBYS-RE.RSA"
]) {
  assert(archiveText.includes(entry), `APK entry is missing: ${entry}`);
}

const runtime = readFileSync("conversion.js", "utf8");
const css = readFileSync("android-app.css", "utf8");

for (const path of partPaths) assert(runtime.includes(path), `Runtime does not request APK part: ${path}`);
assert(runtime.includes(expectedSha256), "Runtime must verify the reviewed APK SHA-256");
assert(runtime.includes(`const androidApkBytes = ${expectedBytes}`), "Runtime must verify the reviewed APK byte size");
assert(runtime.includes('application/vnd.android.package-archive'), "Runtime must create an Android package Blob");
assert(runtime.includes('robys-coffee-house-v1.1.apk'), "Runtime must use a versioned APK filename");
assert(runtime.includes('crypto.subtle.digest("SHA-256"'), "Runtime must verify SHA-256 before download");
assert(runtime.includes('setupAndroidAppDownload'), "Android download section must be connected to the page runtime");
assert(runtime.includes('Download the Android app'), "English download copy is missing");
assert(runtime.includes('Скачать приложение для Android'), "Russian download copy is missing");
assert(runtime.includes('Android uygulamasını indir'), "Turkish download copy is missing");
assert(!/iphone|app store/i.test(runtime), "The Android-only section must not advertise iPhone or App Store availability");
assert(css.includes(".android-download-button") && css.includes(".android-app-device"), "Android section visual contract is incomplete");

console.log(`✅ ${contract} passed: signed APK ${expectedSha256.slice(0, 12)}… is reconstructed, verified and downloaded from the localized Android section.`);
