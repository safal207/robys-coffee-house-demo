import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const expectedBytes = 25231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
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
assert(apk.length === expectedBytes, `APK size changed: ${apk.length}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK must be a ZIP-based Android package");
assert(createHash("sha256").update(apk).digest("hex") === expectedSha256, "APK checksum changed");
const archiveText = apk.toString("latin1");
for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
  assert(archiveText.includes(entry), `APK entry is missing: ${entry}`);
}

const upgrade = readFileSync("android-download.js", "utf8");
const css = readFileSync("android-app.css", "utf8");
const sw = readFileSync("sw.js", "utf8");
assert(upgrade.includes("Array.from({ length: 6 }") && upgrade.includes("downloads/android-v1.1/part-"), "Runtime must construct all six APK part URLs");
assert(upgrade.includes(expectedSha256), "Runtime must verify APK SHA-256");
assert(upgrade.includes("URL.createObjectURL"), "Runtime must prepare a download URL before the user clicks");
assert(upgrade.includes("link.download = APK_NAME"), "Download attribute is not wired");
assert(upgrade.includes("src/android-mark.svg"), "Android logo is missing from the device button");
assert(css.includes(".android-app-screen-pill img"), "Android logo styling is missing");
assert(sw.includes("Array.from({ length: 6 }") && sw.includes("./downloads/android-v1.1/part-"), "Offline cache must construct all six APK part URLs");
console.log(`✅ ${contract} passed: signed APK ${expectedSha256.slice(0, 12)}… is preloaded, verified and downloadable offline.`);
