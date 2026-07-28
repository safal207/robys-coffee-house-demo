import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outputDir = process.env.ROBYS_QA_OUTPUT ?? "qa-artifacts/apk";
mkdirSync(outputDir, { recursive: true });

const partPaths = Array.from({ length: 6 }, (_, index) =>
  `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`
);
const packedBytes = 25_927;
const expectedBytes = 25_231;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const expectedUrl = "https://safal207.github.io/robys-coffee-house-demo/";
const apkPath = `${outputDir}/robys-coffee-house-v1.1.apk`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// The public multipart payload is deliberately packed. Keep this byte-for-byte
// identical to the reviewed repair contract in scripts/verify-android-download.mjs.
function repairPackedApk(packed) {
  assert(packed.length === packedBytes, `Packed APK size mismatch: ${packed.length}`);
  const repaired = Buffer.alloc(expectedBytes);
  packed.copy(repaired, 0, 0, 3145);
  packed.copy(repaired, 3157, 3145, 16372);
  packed.copy(repaired, 16384, 17242, 25248);
  packed.copy(repaired, 24552, 25248);
  return repaired;
}

const base64 = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
const packed = Buffer.from(base64, "base64");
const apk = repairPackedApk(packed);
writeFileSync(apkPath, apk);

const sha256 = createHash("sha256").update(apk).digest("hex");
assert(apk.length === expectedBytes, `APK size mismatch: ${apk.length}`);
assert(sha256 === expectedSha256, `APK SHA-256 mismatch: ${sha256}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK is not ZIP based");

const entries = execFileSync("unzip", ["-Z1", apkPath], { encoding: "utf8" })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
for (const expected of [
  "AndroidManifest.xml",
  "classes.dex",
  "resources.arsc",
  "META-INF/ROBYS-RE.SF",
  "META-INF/ROBYS-RE.RSA"
]) {
  assert(entries.includes(expected), `Missing APK entry: ${expected}`);
}

const dex = execFileSync("unzip", ["-p", apkPath, "classes.dex"]);
const dexText = dex.toString("latin1");
const resources = execFileSync("unzip", ["-p", apkPath, "resources.arsc"]);
const resourceText = resources.toString("latin1");

assert(dexText.includes(expectedUrl), "Approved live-site URL is not embedded in classes.dex");
assert(dexText.includes("safal207.github.io"), "Approved host is missing from classes.dex");
assert(dexText.includes("WebView"), "WebView runtime marker is missing");
assert(dexText.includes("shouldOverrideUrlLoading"), "URL-routing callback is missing");
assert(dexText.includes("onReceivedSslError"), "SSL-error handler is missing");
assert(dexText.includes("onReceivedError"), "Network-error handler is missing");
assert(resourceText.includes("offline_title") || resourceText.includes("offline_message"), "Offline copy resources are missing");
assert(resourceText.includes("ssl_error"), "SSL error copy resource is missing");
assert(resourceText.includes("blocked_link"), "Blocked-link copy resource is missing");

const interestingStrings = [...new Set(
  (dexText.match(/[\x20-\x7E]{5,}/g) ?? []).filter((value) =>
    /robys|github|webview|url|http|ssl|error|intent|external|offline|refresh/i.test(value)
  )
)].slice(0, 200);

const report = {
  completedAt: new Date().toISOString(),
  passed: true,
  package: "com.robys.coffeehouse",
  apkPath,
  packedBytes: packed.length,
  bytes: apk.length,
  sha256,
  expectedUrl,
  entries,
  evidence: {
    deterministicPackedRepair: true,
    webViewRuntime: true,
    urlRoutingCallback: true,
    sslHandler: true,
    networkErrorHandler: true,
    localizedOfflineResources: true,
    blockedLinkResource: true
  },
  interestingStrings
};
writeFileSync(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log("✅ APK-01 contract passed: packed payload restored to the exact signed APK; live URL, WebView routing and recovery resources verified.");
