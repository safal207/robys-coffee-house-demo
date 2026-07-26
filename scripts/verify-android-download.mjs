import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const contract = "ANDROID-APP-001";
const expectedBytes = 25231;
const packedBytes = 25927;
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const partPaths = Array.from({ length: 6 }, (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);

function assert(condition, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

function repairPackedApk(packed) {
  assert(packed.length === packedBytes, `Packed APK size changed: expected ${packedBytes}, got ${packed.length}`);
  const repaired = Buffer.alloc(expectedBytes);
  packed.copy(repaired, 0, 0, 3145);
  packed.copy(repaired, 3157, 3145, 16372);
  packed.copy(repaired, 16384, 17242, 25248);
  packed.copy(repaired, 24552, 25248);
  return repaired;
}

for (const path of partPaths) {
  assert(existsSync(path), `Missing APK part: ${path}`);
  assert(statSync(path).size > 0, `APK part is empty: ${path}`);
}
const base64 = partPaths.map((path) => readFileSync(path, "utf8")).join("").replace(/\s+/g, "");
const packed = Buffer.from(base64, "base64");
const apk = repairPackedApk(packed);
const actualSha256 = createHash("sha256").update(apk).digest("hex");
assert(apk.length === expectedBytes, `APK size changed: expected ${expectedBytes}, got ${apk.length}`);
assert(apk.subarray(0, 2).toString("ascii") === "PK", "APK must be a ZIP-based Android package");
assert(actualSha256 === expectedSha256, `APK checksum changed: expected ${expectedSha256}, got ${actualSha256}`);
const archiveText = apk.toString("latin1");
for (const entry of ["AndroidManifest.xml", "classes.dex", "resources.arsc", "META-INF/ROBYS-RE.SF", "META-INF/ROBYS-RE.RSA"]) {
  assert(archiveText.includes(entry), `APK entry is missing: ${entry}`);
}

const upgrade = readFileSync("android-download.js", "utf8");
const bootstrap = readFileSync("bootstrap.js", "utf8");
const css = readFileSync("android-app.css", "utf8");
const mobileInstall = readFileSync("mobile-install.js", "utf8");
const mobileInstallCss = readFileSync("mobile-install.css", "utf8");
const pwa = readFileSync("pwa.js", "utf8");
const sw = readFileSync("sw.js", "utf8");
assert(upgrade.includes("Array.from({ length: 6 }") && upgrade.includes("downloads/android-v1.1/part-"), "Runtime must construct all six APK part URLs");
assert(upgrade.includes("repairPackedApk") && upgrade.includes("packed.subarray(17242, 25248)"), "Runtime must repair the reviewed multipart package deterministically");
assert(upgrade.includes(expectedSha256), "Runtime must verify APK SHA-256");
assert(upgrade.includes("URL.createObjectURL"), "Runtime must prepare a download URL before the user clicks");
assert(upgrade.includes("link.download = APK_NAME"), "Download attribute is not wired");
assert(upgrade.includes("src/android-mark.svg"), "Android logo is missing from the device button");
assert(bootstrap.includes(".android-download-button .android-download-icon"), "Android button placeholder selector is missing");
assert(bootstrap.includes("android-download-logo") && bootstrap.includes("src/android-mark.svg"), "Real Android logo is missing from the download button");
assert(bootstrap.includes("placeholder.replaceWith(logo)"), "Legacy CSS Android icon is not replaced by the real logo");
assert(css.includes(".android-app-screen-pill img"), "Android logo styling is missing");
assert(mobileInstall.includes('icon.src = "apple-touch-icon.png?v=20260726-approved-v4"'), "iPhone install button must show the reviewed Roby's app image");
assert(mobileInstall.includes('icon.alt = ""') && mobileInstall.includes('icon.setAttribute("aria-hidden", "true")'), "Decorative iPhone app image must stay accessibility-neutral");
assert(mobileInstall.includes('const shouldOfferIosInstall = section.dataset.platform !== "android" && !isStandaloneMode()'), "Android users must be excluded from the iPhone install offer before it is created");
assert(mobileInstall.includes("if (shouldOfferIosInstall) actions.prepend(createIosInstallAction())"), "iPhone install action must be conditionally inserted");
assert(!mobileInstall.includes('icon.textContent = ""'), "Unreliable font-only Apple glyph must not return");
assert(mobileInstallCss.includes(".ios-install-icon") && mobileInstallCss.includes("object-fit:cover") && mobileInstallCss.includes("border-radius:9px"), "iPhone app image styling is missing");
assert(pwa.includes("mobile-install.js?v=platform-install-20260727-1") && pwa.includes("mobile-install.css?v=platform-install-20260727-1"), "PWA bootstrap must load the revised install assets");
assert(sw.includes("Array.from({ length: 6 }") && sw.includes("./downloads/android-v1.1/part-"), "Offline cache must construct all six APK part URLs");
console.log(`✅ ${contract} passed: Android gets only its verified APK action, while the iPhone action uses the real Roby's image and is omitted on Android.`);
