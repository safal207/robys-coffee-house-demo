import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const apkPath = "downloads/robys-coffee-house-v1.1.apk";
const expectedBytes = 25231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

assert(existsSync(apkPath), `Missing downloadable APK: ${apkPath}`);
assert(statSync(apkPath).isFile(), "APK path must resolve to a file");
assert(statSync(apkPath).size === expectedBytes, `APK size changed: expected ${expectedBytes}, found ${statSync(apkPath).size}`);

const apk = readFileSync(apkPath);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK must be a valid ZIP-based Android package");
const sha256 = createHash("sha256").update(apk).digest("hex");
assert(sha256 === expectedSha256, `APK checksum changed: ${sha256}`);

const archiveListing = execFileSync("unzip", ["-l", apkPath], { encoding: "utf8" });
for (const entry of [
  "AndroidManifest.xml",
  "classes.dex",
  "resources.arsc",
  "META-INF/ROBYS-RE.SF",
  "META-INF/ROBYS-RE.RSA"
]) {
  assert(archiveListing.includes(entry), `APK entry is missing: ${entry}`);
}
execFileSync("unzip", ["-t", apkPath], { stdio: "pipe" });

const html = readFileSync("index.html", "utf8");
const css = readFileSync("android-app.css", "utf8");
const section = html.match(/<section\b[^>]*class=["'][^"']*\bandroid-app-section\b[^"']*["'][^>]*>[\s\S]*?<\/section>/i)?.[0] ?? "";

assert(section, "Android download section is missing from index.html");
assert(section.includes(`href="${apkPath}"`), "Download CTA must target the versioned local APK");
assert(/\bdownload(?:=["'][^"']*["'])?/i.test(section), "Download CTA must include the download attribute");
assert(/data-tr=["']Android uygulamasını indir["']/i.test(section), "Turkish download copy is missing");
assert(/data-en=["']Download the Android app["']/i.test(section), "English download copy is missing");
assert(/data-ru=["']Скачать приложение для Android["']/i.test(section), "Russian download copy is missing");
assert(!/iphone|\bios\b|app store/i.test(section), "The Android-only section must not advertise iPhone or App Store availability");
assert(html.includes('href="android-app.css?v='), "Android download stylesheet is not connected");
assert(css.includes(".android-download-button") && css.includes(".android-app-device"), "Android section visual contract is incomplete");

console.log(`✅ ${contract} passed: signed APK ${expectedSha256.slice(0, 12)}… is downloadable from the localized Android section.`);
