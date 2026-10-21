import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = new URL(process.env.ROBY_BASE_URL ?? "https://safal207.github.io/robys-coffee-house-demo/");
const MANIFEST_URL = new URL("integrity-manifest.json", BASE_URL);
const waitMs = Number(process.env.ROBY_INTEGRITY_WAIT_MS ?? 0);
const retryMs = Number(process.env.ROBY_INTEGRITY_RETRY_MS ?? 10000);
if (!Number.isSafeInteger(waitMs) || waitMs < 0 || !Number.isSafeInteger(retryMs) || retryMs <= 0) {
  throw new Error("Integrity wait/retry intervals must be non-negative/positive integer milliseconds");
}
const expectedManifestBytes = readFileSync("integrity-manifest.json");
const manifest = JSON.parse(expectedManifestBytes.toString("utf8"));
if (manifest.version !== 1 || manifest.algorithm !== "sha256" || !manifest.build || !Array.isArray(manifest.files)
  || !["index.html", "menu.html"].every((page) => manifest.files.some((entry) => entry.path === page))
  || manifest.files.some((entry) => typeof entry.path !== "string" || !/^[a-zA-Z0-9._/-]+$/.test(entry.path)
    || entry.path.startsWith("/") || entry.path.includes("..") || !/^[a-f0-9]{64}$/.test(entry.sha256)
    || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0)
  || new Set(manifest.files.map((entry) => entry.path)).size !== manifest.files.length) {
  throw new Error("Unsupported or malformed local integrity manifest");
}
const report = {
  generatedAt: new Date().toISOString(),
  workflowSha: process.env.GITHUB_SHA ?? null,
  baseUrl: BASE_URL.href,
  manifestUrl: MANIFEST_URL.href,
  build: manifest.build,
  expectedManifest: { bytes: expectedManifestBytes.length, sha256: digest(expectedManifestBytes) },
  attempts: [],
  checked: [],
  failures: []
};
const deadline = Date.now() + waitMs;

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fetchBytes(url, nonce) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("integrity", nonce);
  const response = await fetch(requestUrl, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(waitMs ? Math.max(1, Math.min(20000, deadline - Date.now())) : 20000),
    headers: {
      "user-agent": "robys-integrity-verifier/1.0",
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache"
    }
  });
  const metadata = {
    url: response.url,
    status: response.status,
    headers: Object.fromEntries(["date", "age", "etag", "last-modified", "cache-control", "x-cache", "x-proxy-cache", "x-served-by", "x-github-request-id"]
      .map((name) => [name, response.headers.get(name)]))
  };
  try {
    if (!response.ok) throw new Error(`${requestUrl.href} returned ${response.status}`);
    return { bytes: Buffer.from(await response.arrayBuffer()), response: metadata };
  } catch (error) {
    // Preserve response evidence for HTTP errors and failures while reading the body.
    throw Object.assign(error, { response: metadata });
  }
}

function failureDetails(error) {
  return {
    error: String(error.message ?? error),
    ...(error.response ? { response: error.response } : {})
  };
}

function byteDiagnostics(localBytes, publishedBytes) {
  const sharedLength = Math.min(localBytes.length, publishedBytes.length);
  let firstDifference = 0;
  while (firstDifference < sharedLength && localBytes[firstDifference] === publishedBytes[firstDifference]) {
    firstDifference += 1;
  }
  if (firstDifference === sharedLength && localBytes.length === publishedBytes.length) return null;

  const start = Math.max(0, firstDifference - 16);
  const end = Math.min(Math.max(localBytes.length, publishedBytes.length), firstDifference + 17);
  return {
    firstDifference,
    localByte: firstDifference < localBytes.length ? localBytes[firstDifference] : null,
    publishedByte: firstDifference < publishedBytes.length ? publishedBytes[firstDifference] : null,
    localLength: localBytes.length,
    publishedLength: publishedBytes.length,
    localWindowHex: localBytes.subarray(start, Math.min(end, localBytes.length)).toString("hex"),
    publishedWindowHex: publishedBytes.subarray(start, Math.min(end, publishedBytes.length)).toString("hex"),
    localTailHex: localBytes.subarray(Math.max(0, localBytes.length - 32)).toString("hex"),
    publishedTailHex: publishedBytes.subarray(Math.max(0, publishedBytes.length - 32)).toString("hex")
  };
}

async function verifyAttempt() {
  const nonce = `${Date.now().toString(36)}-${randomUUID()}`;
  const attempt = { startedAt: new Date().toISOString(), nonce, checked: [], failures: [] };
  try {
    const { bytes, response } = await fetchBytes(MANIFEST_URL, nonce);
    const actual = { bytes: bytes.length, sha256: digest(bytes) };
    attempt.manifest = { ...actual, response };
    // A self-consistent older deployment must never certify the checked-out revision.
    if (actual.bytes !== report.expectedManifest.bytes || actual.sha256 !== report.expectedManifest.sha256) {
      attempt.failures.push({ path: "integrity-manifest.json", error: "Published manifest does not match the local revision", expected: report.expectedManifest, actual, response });
      return attempt;
    }
  } catch (error) {
    attempt.failures.push({ path: "integrity-manifest.json", ...failureDetails(error) });
    return attempt;
  }

  const concurrency = 6;
  for (let offset = 0; offset < manifest.files.length; offset += concurrency) {
    const batch = manifest.files.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async (entry) => {
      try {
        const { bytes, response } = await fetchBytes(new URL(entry.path, BASE_URL), nonce);
        const actual = { bytes: bytes.byteLength, sha256: digest(bytes) };
        const passed = actual.bytes === entry.bytes && actual.sha256 === entry.sha256;
        const result = {
          path: entry.path,
          passed,
          expected: { bytes: entry.bytes, sha256: entry.sha256 },
          actual
        };
        if (!passed && existsSync(entry.path)) {
          result.byteDiagnostics = byteDiagnostics(readFileSync(entry.path), bytes);
        }
        if (!passed) result.response = response;
        return result;
      } catch (error) {
        return { path: entry.path, passed: false, ...failureDetails(error) };
      }
    }));
    for (const result of results) {
      attempt.checked.push(result);
      if (!result.passed) attempt.failures.push(result);
    }
  }

  for (const page of ["index.html", "menu.html"]) {
    try {
      const { bytes } = await fetchBytes(new URL(page, BASE_URL), nonce);
      const html = bytes.toString("utf8");
      const build = html.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
      if (build !== manifest.build) attempt.failures.push({ path: page, error: `build ${build} != manifest ${manifest.build}` });
    } catch (error) {
      attempt.failures.push({ path: page, ...failureDetails(error) });
    }
  }
  return attempt;
}

mkdirSync(".artifacts", { recursive: true });
do {
  const attempt = await verifyAttempt();
  report.checked = attempt.checked;
  report.failures = attempt.failures;
  report.attempts.push({ ...attempt, checked: attempt.checked.length, completedAt: new Date().toISOString() });
  writeFileSync(".artifacts/live-integrity-report.json", `${JSON.stringify(report, null, 2)}\n`);
  if (!report.failures.length || Date.now() >= deadline) break;
  console.log(`Waiting for exact publication: attempt ${report.attempts.length}, ${report.failures.length} mismatch(es).`);
  await delay(Math.min(retryMs, deadline - Date.now()));
} while (Date.now() < deadline);

if (report.failures.length) {
  report.failures.forEach((failure) => console.error(`❌ [INTEGRITY-001] ${failure.path}: ${failure.error ?? "digest mismatch"}`));
  throw new Error(`Live integrity verification failed: ${report.failures.length} mismatch(es)`);
}

console.log(`✅ INTEGRITY-001 live verification passed: ${report.checked.length} files, build ${report.build}.`);
