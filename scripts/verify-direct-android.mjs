import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const contract = "ANDROID-DIRECT-001";
const expectedBytes = 25231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const partPaths = Array.from({ length: 9 }, (_, index) => `downloads/android-v1.1-packed/a-${String(index + 1).padStart(2, "0")}.txt`);

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

for (const path of partPaths) {
  assert(existsSync(path), `Missing encoded APK part: ${path}`);
  assert(statSync(path).isFile() && statSync(path).size > 0, `Encoded APK part is empty: ${path}`);
}

const encoded = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
assert(encoded.length % 2 === 0 && /^[a-p]+$/.test(encoded), "Encoded APK payload is invalid");

const compressed = Buffer.alloc(encoded.length / 2);
for (let offset = 0; offset < encoded.length; offset += 2) {
  const high = encoded.charCodeAt(offset) - 97;
  const low = encoded.charCodeAt(offset + 1) - 97;
  compressed[offset / 2] = ((high << 4) | low) ^ 0xa5;
}

const apk = gunzipSync(compressed);
const sha256 = createHash("sha256").update(apk).digest("hex");
assert(apk.length === expectedBytes, `APK size changed: ${apk.length}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK is not ZIP based");
assert(sha256 === expectedSha256, `APK checksum changed: ${sha256}`);
for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
  assert(apk.toString("latin1").includes(entry), `APK entry is missing: ${entry}`);
}

const bootstrap = readFileSync("bootstrap.js", "utf8");
const worker = readFileSync("sw.js", "utf8");
const bridge = readFileSync("sw-register.js", "utf8");
const fallback = readFileSync("404.html", "utf8");
assert(bootstrap.includes("downloads/android-v1.1-packed/a-") && bootstrap.includes("DecompressionStream(\"gzip\")"), "Verified APK reconstruction is missing");
assert(bootstrap.includes(expectedSha256), "Pinned APK checksum is missing from the browser runtime");
assert(bootstrap.includes("link.download = ROBYS_APK_NAME"), "Download attribute is missing");
assert(bootstrap.includes('link.dataset.apkDownload = "verified-blob"'), "Verified download marker is missing");
assert(bootstrap.includes("src/android-mark.svg") && bootstrap.includes("android-download-logo"), "Android logo is missing from the button");
assert(bridge.includes("navigator.serviceWorker.register") && bridge.includes('{ scope: "./" }'), "Offline registration bridge is missing");
assert(worker.includes('"./menu.html"') && worker.includes('"./404.html"'), "Offline menu and fallback are not cached");
assert(fallback.includes("Нет интернета") && fallback.includes('href="menu.html"'), "Offline page does not lead to the menu");

console.log(`✅ ${contract} passed: APK ${sha256.slice(0, 12)}… is reconstructed, verified before download and backed by an offline menu.`);
