import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-DIRECT-001";
const partPaths = Array.from({ length: 6 }, (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

for (const path of partPaths) {
  assert(existsSync(path), `Missing APK part: ${path}`);
  assert(statSync(path).isFile() && statSync(path).size > 0, `APK part is empty: ${path}`);
}

const base64 = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
const apk = Buffer.from(base64, "base64");
const sha256 = createHash("sha256").update(apk).digest("hex");
assert(apk.length === 25231, `APK size changed: ${apk.length}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK is not ZIP based");
for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
  assert(apk.toString("latin1").includes(entry), `APK entry is missing: ${entry}`);
}

const checksumPath = "downloads/android-v1.1/SHA256.txt";
if (existsSync(checksumPath)) {
  const pinned = readFileSync(checksumPath, "utf8").trim();
  assert(/^[a-f0-9]{64}$/.test(pinned), "Pinned APK checksum is invalid");
  assert(pinned === sha256, `Pinned APK checksum changed: ${sha256}`);
}

const bootstrap = readFileSync("bootstrap.js", "utf8");
const worker = readFileSync("sw.js", "utf8");
const bridge = readFileSync("sw-register.js", "utf8");
const fallback = readFileSync("404.html", "utf8");
assert(bootstrap.includes("downloads/robys-coffee-house-v1.1.apk"), "Direct APK URL is missing");
assert(bootstrap.includes("link.download = ROBYS_APK_NAME"), "Download attribute is missing");
assert(bootstrap.includes('link.dataset.apkDownload = "direct-apk"'), "Direct download marker is missing");
assert(bootstrap.includes("src/android-mark.svg") && bootstrap.includes("android-download-logo"), "Android logo is missing from the button");
assert(bridge.includes("navigator.serviceWorker.register") && bridge.includes('{ scope: "./" }'), "Offline registration bridge is missing");
assert(worker.includes('"./menu.html"') && worker.includes('"./404.html"'), "Offline menu and fallback are not cached");
assert(fallback.includes("Нет интернета") && fallback.includes('href="menu.html"'), "Offline page does not lead to the menu");

console.log(`✅ ${contract} passed: APK ${sha256.slice(0, 12)}… is valid, directly downloadable and backed by an offline menu.`);
