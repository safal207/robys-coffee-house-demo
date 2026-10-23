import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runObservedNode, startStartupDiagnostics } from "./browser-failure-diagnostics.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const self = fileURLToPath(import.meta.url);
const canonical = join(root, "scripts/test-menu-lazy-images-browser.mjs");
const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

export function canonicalVerdict(execution, report, expectedHead) {
  return execution.code === 0 && !execution.signal && report?.complete === true && report.boundBytesUnchanged === true
    && report.sourceParityVerified === true && report.bundleParityVerified === true
    && /^[a-f0-9]{40}$/.test(report.head ?? "") && report.head === expectedHead && report.expectedCases === 12 && report.cases?.length === 12
    && report.cases.every(row => row.status === "PASS") ? 0 : execution.code || 1;
}

export async function runCanonicalDiagnostics({ output, execute = runObservedNode } = {}) {
  const sidecar = join(output, "diagnostics"); mkdirSync(sidecar, { recursive: true });
  const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  rmSync(join(output, "report.json"), { force: true });
  const execution = await execute(canonical, { output: join(sidecar, "canonical"),
    env: { ...process.env, ROBYS_LAZY_BROWSER: "webkit", ROBYS_LAZY_BROWSERS: "webkit", ROBYS_LAZY_QA_DIR: output,
      ROBYS_BROWSER_STARTUP_DIAGNOSTICS: "1" } });
  let report, reportError;
  try { report = JSON.parse(readFileSync(join(output, "report.json"), "utf8")); }
  catch (error) { reportError = error.code ?? error.name; }
  const code = canonicalVerdict(execution, report, expectedHead);
  const crashed = report?.cases?.find(row => row.status === "FAIL" && [row.lifecycle, row.lifecycleAfterCapture]
    .some(lifecycle => lifecycle?.events?.some(event => event.event === "page-crash")));
  const language = crashed?.language ?? "tr", scale = crashed?.deviceScaleFactor ?? 1;
  const validFixture = report?.head === expectedHead && report.boundBytesUnchanged === true
    && Array.isArray(report.dirtyFilesAtStart) && report.dirtyFilesAtStart.length === 0
    && ["tr", "en", "ru"].includes(language) && [1, 2].includes(scale);
  const receipt = { schemaVersion: 1, canonical: { execution, effectiveExitCode: code, reportError },
    controls: [], acceptance: "Only the canonical execution decides the exit code; sidecar controls never replace a failure" };
  if (code !== 0 && crashed && validFixture) {
    receipt.controlCase = { id: crashed.id, language, deviceScaleFactor: scale };
    for (const mode of ["native", "audit"]) {
      const result = await execute(self, { args: [`--control=${mode}`, `--language=${language}`, `--scale=${scale}`], output: join(sidecar, mode),
        env: { ...process.env, ROBYS_DIAGNOSTIC_OUTPUT: join(sidecar, mode) } });
      receipt.controls.push({ mode, execution: result }); write(join(sidecar, "summary.json"), receipt);
    }
  } else receipt.controlDisposition = { status: "NOT_RUN", reason: code === 0 ? "Canonical passed"
    : !crashed ? "No observed page-crash receipt" : "Unbound source or unsupported diagnostic fixture" };
  write(join(sidecar, "summary.json"), receipt);
  return code;
}

async function startupControl(mode, output, { language, scale }) {
  assert(["native", "audit"].includes(mode) && ["tr", "en", "ru"].includes(language) && [1, 2].includes(scale));
  mkdirSync(output, { recursive: true });
  const source = readFileSync(canonical, "utf8"), start = source.indexOf("function installIoAudit("), end = source.indexOf("\nlet certificate,", start);
  assert(start >= 0 && end > start, "Canonical IO audit source must be identifiable");
  const audit = source.slice(start, end).trim();
  const report = { schemaVersion: 1, role: "Diagnostic startup control only; cannot certify the canonical suite", mode, language, deviceScaleFactor: scale,
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    auditSha256: createHash("sha256").update(audit).digest("hex"), startedAt: new Date().toISOString(), stages: [], events: [] };
  const save = () => write(join(output, "control.json"), report);
  const mark = name => { report.stages.push({ at: new Date().toISOString(), name }); save(); };
  const telemetry = startStartupDiagnostics(output);
  let server, browser, certificate, expired = false, forceExit;
  const timeout = setTimeout(() => {
    expired = true; process.exitCode = 124;
    report.outcome = "INCONCLUSIVE_TIMEOUT"; report.telemetry = telemetry.finish("control-time-limit"); save();
    void browser?.close().catch(() => {}); forceExit = setTimeout(() => process.exit(124), 3000); forceExit.unref();
  }, 30000); timeout.unref();
  try {
    certificate = mkdtempSync(join(tmpdir(), "robys-startup-control-"));
    execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
      "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
    const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
      ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
    server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
      try { const file = resolve(root, "." + decodeURIComponent(new URL(request.url, "https://localhost").pathname));
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
        response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
        createReadStream(file).pipe(response);
      } catch { response.writeHead(400).end(); }
    });
    await new Promise(done => server.listen(0, "127.0.0.1", done));
    const origin = `https://127.0.0.1:${server.address().port}`;
    const { webkit } = await import("playwright");
    mark("before-browser-launch"); browser = await webkit.launch({ headless: true }); report.browserVersion = browser.version();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: scale,
      ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce" });
    if (mode === "audit") await context.addInitScript({ content: `(${audit})(${JSON.stringify({ language, mode: "native" })});` });
    else await context.addInitScript(language => localStorage.setItem("robys-language", language), language);
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    for (const event of ["crash", "close", "pageerror"]) page.on(event, error => {
      report.events.push({ at: new Date().toISOString(), event,
        ...(event === "pageerror" && typeof error?.message === "string" ? { error: error.message.slice(0, 1000) } : {}) }); save();
    });
    mark("goto-start"); await page.goto(`${origin}/menu.html?entry=off`, { waitUntil: "networkidle" });
    mark("goto-networkidle"); await page.locator('#menu-root[data-ready="true"]').waitFor();
    mark("root-ready"); await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    mark("two-raf-complete"); assert(!expired, "Diagnostic control deadline expired"); report.outcome = "PASS";
    await context.close();
  } catch (error) { report.outcome = expired ? "INCONCLUSIVE_TIMEOUT" : "FAIL"; report.error = error.stack; process.exitCode = expired ? 124 : 1; }
  finally {
    report.telemetry = telemetry.finish("control-finished"); report.finishedAt = new Date().toISOString(); save();
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    if (certificate) rmSync(certificate, { recursive: true, force: true });
    clearTimeout(timeout); clearTimeout(forceExit);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.chdir(root);
  const control = process.argv[2]?.match(/^--control=(native|audit)$/)?.[1];
  if (control) {
    assert([3, 5].includes(process.argv.length), "Unexpected diagnostic arguments");
    const language = process.argv[3]?.match(/^--language=(tr|en|ru)$/)?.[1] ?? (process.argv.length === 3 ? "tr" : null);
    const scale = process.argv[4]?.match(/^--scale=(1|2)$/)?.[1] ?? (process.argv.length === 3 ? "1" : null);
    await startupControl(control, resolve(process.env.ROBYS_DIAGNOSTIC_OUTPUT), { language, scale: Number(scale) });
  }
  else {
    assert(process.argv.length === 2 && (process.env.ROBYS_LAZY_BROWSERS ?? process.env.ROBYS_LAZY_BROWSER) === "webkit",
      "The diagnostic launcher requires the canonical single-WebKit selection");
    process.exitCode = await runCanonicalDiagnostics({ output: resolve(process.env.ROBYS_LAZY_QA_DIR ?? ".artifacts/menu-lazy-images") });
  }
}
