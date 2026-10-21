import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const verifier = fileURLToPath(new URL("./verify-live-integrity.mjs", import.meta.url));
const build = "same-build";
const current = {
  "index.html": Buffer.from(`<meta name="robys-build" content="${build}">`),
  "menu.html": Buffer.from(`<meta name="robys-build" content="${build}"><p>Menu</p>`),
  "sw-core-v64.js": Buffer.from('const CACHE_VERSION = "new";\n'),
  "photo.png": Buffer.from([0, 255, 10, 13, 0, 128])
};
const old = { ...current, "sw-core-v64.js": Buffer.from('const CACHE_VERSION = "old";\n') };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (files) => Buffer.from(`${JSON.stringify({
  version: 1, algorithm: "sha256", build,
  files: Object.entries(files).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) }))
})}\n`);

async function runFixture(t, respond, { files = current, waitMs = 0 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "robys-live-integrity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "integrity-manifest.json"), serialize(files));
  for (const [path, bytes] of Object.entries(files)) writeFileSync(join(directory, path), bytes);
  const requests = [];
  let attempt = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.slice(1);
    if (path === "integrity-manifest.json") attempt += 1;
    requests.push({ path, nonce: url.searchParams.get("integrity"), headers: req.headers, attempt });
    const result = respond(path, attempt);
    res.writeHead(result?.status ?? (result?.bytes ? 200 : 404), {
      "cache-control": "max-age=600", age: "42", etag: '"fixture"', "x-cache": "HIT"
    });
    res.end(result?.bytes ?? "missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, [verifier], {
    cwd: directory,
    env: {
      ...process.env,
      ROBY_BASE_URL: `http://127.0.0.1:${server.address().port}/`,
      ROBY_INTEGRITY_WAIT_MS: String(waitMs),
      ROBY_INTEGRITY_RETRY_MS: "20"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const killTimer = setTimeout(() => child.kill(), 10000);
  t.after(() => clearTimeout(killTimer));
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  const report = JSON.parse(readFileSync(join(directory, ".artifacts/live-integrity-report.json"), "utf8"));
  return { code, output, report, requests };
}

const serve = (files) => (path) => ({ bytes: path === "integrity-manifest.json" ? serialize(files) : files[path] });

test("an exact publication checks every local manifest entry, including binary bytes", async (t) => {
  const { code, output, report, requests } = await runFixture(t, serve(current));
  assert.equal(code, 0, output);
  assert.equal(report.checked.length, Object.keys(current).length);
  assert.ok(report.checked.every((entry) => entry.passed));
  assert.equal(report.expectedManifest.sha256, digest(serialize(current)));
  assert.equal(report.attempts[0].manifest.sha256, report.expectedManifest.sha256);
  assert.equal(new Set(requests.map((request) => request.nonce)).size, 1);
  assert.ok(requests.every((request) => request.nonce && request.headers["cache-control"].includes("no-cache")));
});

test("a self-consistent older deployment cannot pass with the same build and menu", async (t) => {
  const { code, output, report } = await runFixture(t, serve(old));
  assert.equal(code, 1, output);
  assert.equal(report.failures[0].path, "integrity-manifest.json");
  assert.equal(report.failures[0].actual.sha256, digest(serialize(old)));
  assert.equal(report.failures[0].expected.sha256, digest(serialize(current)));
});

test("the historical old-manifest/new-worker race is rejected before trusting remote entries", async (t) => {
  const { code, output, report } = await runFixture(t, (path) => ({
    bytes: path === "integrity-manifest.json" ? serialize(old) : current[path]
  }));
  assert.equal(code, 1, output);
  assert.equal(report.failures[0].path, "integrity-manifest.json");
  assert.equal(report.checked.length, 0);
});

test("publication waiting retries a stale manifest and preserves evidence of both attempts", async (t) => {
  const { code, output, report, requests } = await runFixture(t, (path, attempt) =>
    serve(attempt === 1 ? old : current)(path), { waitMs: 1500 });
  assert.equal(code, 0, output);
  assert.equal(report.attempts.length, 2);
  assert.equal(report.attempts[0].failures[0].path, "integrity-manifest.json");
  assert.equal(report.attempts[0].manifest.response.headers.age, "42");
  assert.equal(report.attempts[1].failures.length, 0);
  assert.equal(report.checked.length, Object.keys(current).length);
  const nonces = requests.filter((request) => request.path === "integrity-manifest.json").map((request) => request.nonce);
  assert.equal(new Set(nonces).size, 2);
});

test("a current manifest with a stale worker cannot pass until every digest matches", async (t) => {
  const { code, output, report } = await runFixture(t, (path, attempt) => ({
    bytes: path === "integrity-manifest.json" ? serialize(current) : (attempt === 1 ? old : current)[path]
  }), { waitMs: 1500 });
  assert.equal(code, 0, output);
  assert.equal(report.attempts.length, 2);
  const failure = report.attempts[0].failures[0];
  assert.equal(failure.path, "sw-core-v64.js");
  assert.equal(failure.expected.bytes, failure.actual.bytes);
  assert.notEqual(failure.expected.sha256, failure.actual.sha256);
  assert.ok(failure.byteDiagnostics);
  assert.equal(failure.response.headers["x-cache"], "HIT");
  assert.equal(report.checked.length, Object.keys(current).length);
  assert.equal(report.failures.length, 0);
});

test("persistent same-size corruption still fails after a bounded publication wait", async (t) => {
  const { code, output, report } = await runFixture(t, (path) => ({
    bytes: path === "integrity-manifest.json" ? serialize(current) : old[path]
  }), { waitMs: 350 });
  assert.equal(code, 1, output);
  assert.ok(report.attempts.length >= 2);
  assert.ok(report.attempts.every((attempt) => attempt.failures.length > 0));
  assert.ok(report.failures.length > 0);
  assert.ok(report.attempts.some((attempt) => attempt.failures.some((entry) => entry.path === "sw-core-v64.js")));
});

test("a size mismatch in any public file is still a failure", async (t) => {
  const { code, output, report } = await runFixture(t, (path) => ({
    bytes: path === "photo.png" ? Buffer.from([0]) : serve(current)(path).bytes
  }));
  assert.equal(code, 1, output);
  assert.equal(report.checked.length, Object.keys(current).length);
  assert.equal(report.failures[0].path, "photo.png");
  assert.equal(report.failures[0].actual.bytes, 1);
});

test("a missing public resource is not skipped", async (t) => {
  const { code, output, report } = await runFixture(t, (path) => path === "sw-core-v64.js" ? {} : serve(current)(path));
  assert.equal(code, 1, output);
  assert.equal(report.checked.length, Object.keys(current).length);
  assert.equal(report.failures[0].path, "sw-core-v64.js");
  assert.match(report.failures[0].error, /404/);
});

test("matching file hashes do not waive the page build marker contract", async (t) => {
  const files = { ...current, "menu.html": Buffer.from('<meta name="robys-build" content="wrong-build">') };
  const { code, output, report } = await runFixture(t, serve(files), { files });
  assert.equal(code, 1, output);
  assert.ok(report.checked.every((entry) => entry.passed));
  assert.match(report.failures[0].error, /build wrong-build != manifest same-build/);
});
