import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { boundedLog, captureFailure, eventDelta, processStat, runObservedNode, startStartupDiagnostics, traceArguments } from "./browser-failure-diagnostics.mjs";
import { canonicalVerdict, runCanonicalDiagnostics } from "./run-menu-lazy-images-diagnostics.mjs";

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const pass = () => ({ head, dirtyFilesAtStart: [], complete: true, boundBytesUnchanged: true, sourceParityVerified: true,
  bundleParityVerified: true, expectedCases: 12, cases: Array.from({ length: 12 }, () => ({ status: "PASS" })) });

test("failure receipt is durable before a held screenshot and retains its capture error", async () => {
  const failure = { status: "FAIL", error: "Original browser crash" }, writes = [];
  let rejectCapture;
  const result = captureFailure(failure, () => writes.push(structuredClone(failure)),
    () => new Promise((_, reject) => { rejectCapture = reject; }));
  assert.equal(writes.length, 1); assert.equal(writes[0].status, "FAIL"); assert.equal(writes[0].screenshotCapture, "PENDING");
  rejectCapture(new Error("Target crashed; screenshot unavailable")); await result;
  assert.equal(writes.at(-1).status, "FAIL"); assert.equal(writes.at(-1).screenshotCapture, "FAILED");
  assert.deepEqual(writes.at(-1).captureErrors, ["Target crashed; screenshot unavailable"]);
  assert.equal(writes.at(-1).error, "Original browser crash");
});

test("a failed canonical run stays nonzero even when both separate controls pass", async () => {
  const output = mkdtempSync(join(tmpdir(), "robys-diagnostic-verdict-")), calls = [];
  try {
    const code = await runCanonicalDiagnostics({ output, execute: async (script, options) => {
      calls.push({ script, args: options.args, trace: options.trace });
      if (calls.length === 1) assert.equal(options.env.ROBYS_LAZY_QA_DIR, output);
      if (calls.length === 1) { const report = pass(); report.complete = false; report.cases[0] = {
        id: "withheld-and-approach-tr", status: "FAIL", lifecycle: { events: [{ event: "page-crash" }] } };
        writeFileSync(join(output, "report.json"), JSON.stringify(report)); return { code: 1, signal: null }; }
      return { code: 0, signal: null };
    } });
    assert.equal(code, 1); assert.equal(calls.length, 3);
    assert.equal(calls[0].trace, false, "The acceptance run must not execute under ptrace");
    assert(calls.slice(1).every(call => call.trace === true), "Native tracing remains available in separate controls");
    assert.deepEqual(calls.slice(1).map(call => call.args), [
      ["--control=native", "--language=tr", "--scale=1"], ["--control=audit", "--language=tr", "--scale=1"]]);
    assert.equal(JSON.parse(readFileSync(join(output, "diagnostics/summary.json"))).canonical.effectiveExitCode, 1);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("successful canonical assertions run without ptrace and preserve their bound receipt", async () => {
  const output = mkdtempSync(join(tmpdir(), "robys-diagnostic-untraced-")); let calls = 0;
  try {
    const code = await runCanonicalDiagnostics({ output, execute: async (script, options) => {
      calls++;
      assert(script.endsWith("/test-menu-lazy-images-browser.mjs"));
      assert.equal(options.trace, false);
      writeFileSync(join(output, "report.json"), JSON.stringify(pass()));
      return { code: 0, signal: null, trace: { status: "NOT_REQUESTED" } };
    } });
    assert.equal(code, 0); assert.equal(calls, 1);
    const receipt = JSON.parse(readFileSync(join(output, "diagnostics/summary.json")));
    assert.equal(receipt.canonical.execution.trace.status, "NOT_REQUESTED");
    assert.equal(receipt.canonical.effectiveExitCode, 0);
    assert.equal(receipt.controlDisposition.status, "NOT_RUN");
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("a late 2x crash during capture selects separate controls with the failed fixture, without promoting their success", async () => {
  const output = mkdtempSync(join(tmpdir(), "robys-diagnostic-dense-")), calls = [];
  try {
    const code = await runCanonicalDiagnostics({ output, execute: async (script, options) => {
      calls.push({ script, args: options.args });
      if (calls.length === 1) {
        const report = pass(); report.complete = false;
        report.cases[10] = { id: "high-density-original", language: "ru", deviceScaleFactor: 2, status: "FAIL",
          lifecycle: { events: [] }, lifecycleAfterCapture: { events: [{ event: "page-crash" }] } };
        writeFileSync(join(output, "report.json"), JSON.stringify(report)); return { code: 1, signal: null };
      }
      return { code: 0, signal: null };
    } });
    assert.equal(code, 1); assert.equal(calls.length, 3);
    assert.deepEqual(calls.slice(1).map(call => call.args), [
      ["--control=native", "--language=ru", "--scale=2"], ["--control=audit", "--language=ru", "--scale=2"]]);
    const receipt = JSON.parse(readFileSync(join(output, "diagnostics/summary.json")));
    assert.deepEqual(receipt.controlCase, { id: "high-density-original", language: "ru", deviceScaleFactor: 2 });
    assert.equal(receipt.canonical.effectiveExitCode, 1);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("missing, stale, incomplete reports and child signals fail closed without a fallback execution", async () => {
  assert.equal(canonicalVerdict({ code: 0, signal: null }, pass(), head), 0);
  for (const report of [undefined, { ...pass(), head: "0".repeat(40) }, { ...pass(), complete: false }, { ...pass(), cases: [] }]) {
    assert.notEqual(canonicalVerdict({ code: 0, signal: null }, report, head), 0);
  }
  assert.notEqual(canonicalVerdict({ code: 0, signal: "SIGSEGV" }, pass(), head), 0);
  const output = mkdtempSync(join(tmpdir(), "robys-diagnostic-missing-")); let calls = 0;
  try {
    writeFileSync(join(output, "report.json"), JSON.stringify(pass()));
    assert.equal(await runCanonicalDiagnostics({ output, execute: async () => { calls++; return { code: 0, signal: null }; } }), 1);
    assert.equal(calls, 1, "An old success cannot be reused and no browser retry is started");
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("crash controls reject stale source, dirty files and unsupported scale metadata", async () => {
  for (const invalid of [{ head: "0".repeat(40) }, { dirtyFilesAtStart: [" M menu-app.js"] }, { deviceScaleFactor: 99 }]) {
    const output = mkdtempSync(join(tmpdir(), "robys-diagnostic-unbound-")); let calls = 0;
    try {
      const code = await runCanonicalDiagnostics({ output, execute: async () => {
        calls++;
        const report = { ...pass(), ...invalid, complete: false };
        report.cases[10] = { id: "high-density-original", language: "ru", deviceScaleFactor: invalid.deviceScaleFactor ?? 2,
          status: "FAIL", lifecycleAfterCapture: { events: [{ event: "page-crash" }] } };
        writeFileSync(join(output, "report.json"), JSON.stringify(report)); return { code: 1, signal: null };
      } });
      assert.equal(code, 1); assert.equal(calls, 1, "Unbound or unsupported evidence must not launch controls");
    } finally { rmSync(output, { recursive: true, force: true }); }
  }
});

test("bounded native logs retain the first and last signal evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "robys-diagnostic-log-"));
  try {
    const file = join(directory, "native.log"), log = boundedLog(file, 128);
    log.append("FIRST-CHILD\n"); log.append("x".repeat(1024)); log.append("LAST-SIGSEGV\n");
    const result = log.finish(), contents = readFileSync(file, "utf8");
    assert(contents.startsWith("FIRST-CHILD")); assert(contents.endsWith("LAST-SIGSEGV\n"));
    assert.equal(result.truncated, true); assert.equal(result.retainedBytes, 128); assert(contents.length < 256);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("only a zombie wait status identifies an exit; aggregate memory counters use deltas", () => {
  const fields = Array(50).fill("0"); fields[0] = "Z"; fields[1] = "10"; fields[19] = "1234"; fields[21] = "42"; fields[49] = "139";
  const row = processStat(`99 (WebKitWebProcess) ${fields.join(" ")}`);
  assert.deepEqual(row.waitStatus, { raw: 139, signal: 11, exitCode: null, coreDumped: true });
  fields[0] = "S"; assert.equal(processStat(`99 (WebKitWebProcess) ${fields.join(" ")}`).waitStatus, undefined);
  assert.deepEqual(eventDelta({ oom_kill: 7, high: 1 }, { oom_kill: 7, high: 3 }), { oom_kill: 0, high: 2 });
});

test("real child signal is nonzero with optional native tracing and no argv/env syscall capture", async () => {
  assert.equal(traceArguments.includes("trace=wait4,waitid,kill,tgkill"), true);
  assert(!traceArguments.some(value => /execve|trace=process/.test(value)));
  const directory = mkdtempSync(join(tmpdir(), "robys-diagnostic-signal-"));
  try {
    const fixture = join(directory, "signal.mjs"); writeFileSync(fixture, "process.kill(process.pid, 'SIGTERM');\n");
    const result = await runObservedNode(fixture, { output: directory });
    assert.equal(result.code, 143);
    assert(["AVAILABLE", "UNAVAILABLE"].includes(result.trace.status));
    if (result.trace.status === "AVAILABLE") assert.match(readFileSync(result.traceLog.path, "utf8"), /SIGTERM/);
    else assert.equal(result.traceLog, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("resource samples attribute a real descendant through proc and namespace PIDs", { skip: process.platform !== "linux" }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "robys-diagnostic-process-"));
  const telemetry = startStartupDiagnostics(directory, { intervalMs: 10, maxSamples: 8 });
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 500)"], { stdio: "ignore" });
  try {
    await new Promise(done => setTimeout(done, 60)); telemetry.finish("fixture-observed");
    const report = JSON.parse(readFileSync(join(directory, "startup-resources.json")));
    assert.equal(report.rootPid, processStat(readFileSync("/proc/self/stat", "utf8")).pid);
    assert(report.samples.some(sample => sample.processes.current.some(row => row.pid === child.pid || row.namespacePids?.includes(child.pid))));
  } finally { child.kill(); telemetry.finish("cleanup"); rmSync(directory, { recursive: true, force: true }); }
});

test("available tracer FIFO transport is consumed and preserves the child code (explicit transport stub)", async () => {
  const directory = mkdtempSync(join(tmpdir(), "robys-diagnostic-pipe-")), originalPath = process.env.PATH;
  try {
    const tracer = join(directory, "strace"), fixture = join(directory, "fixture.mjs");
    writeFileSync(tracer, `#!/usr/bin/env node
const {spawnSync}=require('node:child_process'),{writeFileSync}=require('node:fs');
const args=process.argv.slice(2),split=args.indexOf('--'),output=args[args.indexOf('-o')+1];
const result=spawnSync(args[split+1],args.slice(split+2),{stdio:'inherit'});
writeFileSync(output,'FIXTURE_ONLY FIFO transport\\n');process.exit(result.status??1);
`); chmodSync(tracer, 0o755); writeFileSync(fixture, "process.exit(7);\n");
    process.env.PATH = `${directory}:${originalPath}`;
    const result = await runObservedNode(fixture, { output: directory });
    assert.equal(result.trace.status, "AVAILABLE"); assert.equal(result.code, 7);
    assert.match(readFileSync(result.traceLog.path, "utf8"), /FIXTURE_ONLY FIFO transport/);
  } finally { process.env.PATH = originalPath; rmSync(directory, { recursive: true, force: true }); }
});
