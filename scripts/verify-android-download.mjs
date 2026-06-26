import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const apkPath = "downloads/robys-coffee-house-v1.1.apk";
const expectedBytes = 25231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

assert(existsSync(apkPath), `Missing direct APK: ${apkPath}`);
assert(statSync(apkPath).size === expectedBytes, `APK size changed: ${statSync(apkPath).size}`);
const apk = readFileSync(apkPath);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK must be a ZIP-based Android package");
assert(createHash("sha256").update(apk).digest("hex") === expectedSha256, "APK checksum changed");
const archiveText = apk.toString("latin1");
for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
  assert(archiveText.includes(entry), `APK entry is missing: ${entry}`);
}

const upgrade = readFileSync("android-download.js", "utf8");
const css = readFileSync("android-app.css", "utf8");
const sw = readFileSync("sw.js", "utf8");
assert(upgrade.includes(`const APK_URL = "${apkPath}"`), "Direct APK URL is not wired");
assert(upgrade.includes("link.download = APK_NAME"), "Download attribute is not wired");
assert(upgrade.includes("src/android-mark.svg"), "Android logo is missing from the device button");
assert(css.includes(".android-app-screen-pill img"), "Android logo styling is missing");
assert(sw.includes(`./${apkPath}`), "APK must be available in the offline cache");
console.log(`✅ ${contract} passed: direct signed APK ${expectedSha256.slice(0, 12)}… is downloadable and cached offline.`);
