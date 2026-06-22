import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = new URL(process.env.ROBY_BASE_URL ?? "https://safal207.github.io/robys-coffee-house-demo/");
const MANIFEST_URL = new URL("integrity-manifest.json", BASE_URL);
const nonce = Date.now().toString(36);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL.href,
  manifestUrl: MANIFEST_URL.href,
  build: null,
  checked: [],
  failures: []
};

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fetchBytes(url) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("integrity", nonce);
  const response = await fetch(requestUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: { "user-agent": "robys-integrity-verifier/1.0" }
  });
  if (!response.ok) throw new Error(`${requestUrl.href} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

let manifest;
try {
  const manifestBytes = await fetchBytes(MANIFEST_URL);
  manifest = JSON.parse(manifestBytes.toString("utf8"));
} catch (error) {
  report.failures.push({ path: "integrity-manifest.json", error: String(error.message ?? error) });
}

if (manifest) {
  report.build = manifest.build ?? null;
  if (manifest.version !== 1 || manifest.algorithm !== "sha256" || !Array.isArray(manifest.files)) {
    report.failures.push({ path: "integrity-manifest.json", error: "Unsupported or malformed manifest" });
  } else {
    const concurrency = 6;
    for (let offset = 0; offset < manifest.files.length; offset += concurrency) {
      const batch = manifest.files.slice(offset, offset + concurrency);
      const results = await Promise.all(batch.map(async (entry) => {
        try {
          const bytes = await fetchBytes(new URL(entry.path, BASE_URL));
          const actual = { bytes: bytes.byteLength, sha256: digest(bytes) };
          const passed = actual.bytes === entry.bytes && actual.sha256 === entry.sha256;
          return { path: entry.path, passed, expected: { bytes: entry.bytes, sha256: entry.sha256 }, actual };
        } catch (error) {
          return { path: entry.path, passed: false, error: String(error.message ?? error) };
        }
      }));
      for (const result of results) {
        report.checked.push(result);
        if (!result.passed) report.failures.push(result);
      }
    }

    for (const page of ["index.html", "menu.html"]) {
      try {
        const html = (await fetchBytes(new URL(page, BASE_URL))).toString("utf8");
        const build = html.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
        if (build !== manifest.build) report.failures.push({ path: page, error: `build ${build} != manifest ${manifest.build}` });
      } catch (error) {
        report.failures.push({ path: page, error: String(error.message ?? error) });
      }
    }
  }
}

mkdirSync(".artifacts", { recursive: true });
writeFileSync(".artifacts/live-integrity-report.json", `${JSON.stringify(report, null, 2)}\n`);

if (report.failures.length) {
  report.failures.forEach((failure) => console.error(`❌ [INTEGRITY-001] ${failure.path}: ${failure.error ?? "digest mismatch"}`));
  throw new Error(`Live integrity verification failed: ${report.failures.length} mismatch(es)`);
}

console.log(`✅ INTEGRITY-001 live verification passed: ${report.checked.length} files, build ${report.build}.`);
