import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = new URL(process.env.ROBY_BASE_URL ?? "https://safal207.github.io/robys-coffee-house-demo/");
const ATTEMPTS = Number(process.env.INTEGRITY_ATTEMPTS ?? 15);
const DELAY_MS = Number(process.env.INTEGRITY_DELAY_MS ?? 20000);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL.href,
  attempts: [],
  passed: false
};

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBytes(pathname, nonce) {
  const requestUrl = new URL(pathname, BASE_URL);
  requestUrl.searchParams.set("integrity", nonce);
  const response = await fetch(requestUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: { "user-agent": "robys-integrity-verifier/1.0", "cache-control": "no-cache" }
  });
  if (!response.ok) throw new Error(`${requestUrl.pathname} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function verifyAttempt(attempt) {
  const nonce = `${Date.now().toString(36)}-${attempt}`;
  const manifestBytes = await fetchBytes("integrity-manifest.json", nonce);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.version !== 1 || manifest.algorithm !== "sha256" || !Array.isArray(manifest.files)) {
    throw new Error("Unsupported or malformed integrity manifest");
  }

  const checked = [];
  const failures = [];
  const concurrency = 6;

  for (let offset = 0; offset < manifest.files.length; offset += concurrency) {
    const batch = manifest.files.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async (entry) => {
      try {
        const bytes = await fetchBytes(entry.path, nonce);
        const actual = { bytes: bytes.byteLength, sha256: digest(bytes) };
        return {
          path: entry.path,
          passed: actual.bytes === entry.bytes && actual.sha256 === entry.sha256,
          expected: { bytes: entry.bytes, sha256: entry.sha256 },
          actual
        };
      } catch (error) {
        return { path: entry.path, passed: false, error: String(error.message ?? error) };
      }
    }));
    for (const result of results) {
      checked.push(result);
      if (!result.passed) failures.push(result);
    }
  }

  for (const page of ["index.html", "menu.html"]) {
    const html = (await fetchBytes(page, nonce)).toString("utf8");
    const build = html.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (build !== manifest.build) failures.push({ path: page, error: `build ${build} != manifest ${manifest.build}` });
  }

  return { build: manifest.build, checked, failures };
}

let lastError;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const attemptReport = { attempt, startedAt: new Date().toISOString() };
  try {
    const result = await verifyAttempt(attempt);
    attemptReport.build = result.build;
    attemptReport.checked = result.checked;
    attemptReport.failures = result.failures;
    attemptReport.passed = result.failures.length === 0;
    report.attempts.push(attemptReport);

    if (attemptReport.passed) {
      report.passed = true;
      report.build = result.build;
      break;
    }

    lastError = new Error(`${result.failures.length} live file mismatch(es)`);
  } catch (error) {
    lastError = error;
    attemptReport.passed = false;
    attemptReport.error = String(error.message ?? error);
    report.attempts.push(attemptReport);
  }

  if (attempt < ATTEMPTS) await sleep(DELAY_MS);
}

report.completedAt = new Date().toISOString();
mkdirSync(".artifacts", { recursive: true });
writeFileSync(".artifacts/live-integrity-report.json", `${JSON.stringify(report, null, 2)}\n`);

if (!report.passed) {
  throw lastError ?? new Error("INTEGRITY-001 live verification failed");
}

const last = report.attempts.at(-1);
console.log(`✅ INTEGRITY-001 live verification passed: ${last.checked.length} files, build ${report.build}.`);
