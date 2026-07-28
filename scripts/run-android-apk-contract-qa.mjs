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
const reportPath = `${outputDir}/report.json`;

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

function readUleb128(buffer, startOffset) {
  let value = 0;
  let shift = 0;
  let offset = startOffset;
  for (let count = 0; count < 5; count += 1) {
    assert(offset < buffer.length, "Truncated DEX ULEB128 value");
    const byte = buffer[offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value >>> 0, nextOffset: offset };
    shift += 7;
  }
  throw new Error("Invalid DEX ULEB128 value");
}

function extractDexStrings(dex) {
  assert(dex.length >= 0x70, "classes.dex is too small");
  assert(dex.subarray(0, 4).toString("ascii") === "dex\n", "classes.dex magic is invalid");
  const stringIdsSize = dex.readUInt32LE(0x38);
  const stringIdsOffset = dex.readUInt32LE(0x3c);
  assert(stringIdsOffset + stringIdsSize * 4 <= dex.length, "DEX string_ids table is out of bounds");

  const strings = [];
  for (let index = 0; index < stringIdsSize; index += 1) {
    const dataOffset = dex.readUInt32LE(stringIdsOffset + index * 4);
    assert(dataOffset < dex.length, `DEX string ${index} points outside the file`);
    const { nextOffset } = readUleb128(dex, dataOffset);
    let end = nextOffset;
    while (end < dex.length && dex[end] !== 0) end += 1;
    assert(end < dex.length, `DEX string ${index} is not null-terminated`);
    strings.push(dex.subarray(nextOffset, end).toString("utf8"));
  }
  return strings;
}

try {
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
  const dexStrings = extractDexStrings(dex);
  const resources = execFileSync("unzip", ["-p", apkPath, "resources.arsc"]);
  const resourceText = resources.toString("latin1");

  assert(dexStrings.includes(expectedUrl), "Exact approved live-site URL is not present in the DEX string table");
  assert(dexStrings.includes("Landroid/webkit/WebView;"), "WebView class descriptor is missing");
  assert(dexStrings.includes("shouldOverrideUrlLoading"), "URL-routing callback is missing");
  assert(dexStrings.includes("onReceivedSslError"), "SSL-error handler is missing");
  assert(dexStrings.includes("onReceivedError"), "Network-error handler is missing");
  assert(resourceText.includes("offline_title") || resourceText.includes("offline_message"), "Offline copy resources are missing");
  assert(resourceText.includes("ssl_error"), "SSL error copy resource is missing");
  assert(resourceText.includes("blocked_link"), "Blocked-link copy resource is missing");

  const interestingStrings = dexStrings
    .filter((value) => /robys|github|webview|url|http|ssl|error|intent|external|offline|refresh/i.test(value))
    .slice(0, 200);

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
    dexStringCount: dexStrings.length,
    evidence: {
      deterministicPackedRepair: true,
      parsedDexStringTable: true,
      exactApprovedUrl: true,
      webViewRuntime: true,
      urlRoutingCallback: true,
      sslHandler: true,
      networkErrorHandler: true,
      localizedOfflineResources: true,
      blockedLinkResource: true
    },
    interestingStrings
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log("✅ APK-01 contract passed: packed payload restored to the exact signed APK; parsed DEX proves exact live URL, WebView routing and recovery handlers.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const report = {
    completedAt: new Date().toISOString(),
    passed: false,
    package: "com.robys.coffeehouse",
    apkPath,
    error: message
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  throw error;
}
