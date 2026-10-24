import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gdbAvailability, runNativeStackReplay } from "./browser-native-stacks.mjs";
import { runCanonicalDiagnostics } from "./run-menu-lazy-images-diagnostics.mjs";

test("unavailable debugger removes stale receipt and never substitutes an unobserved execution", async () => {
  const output = mkdtempSync(join(tmpdir(), "robys-native-unavailable-"));
  try {
    const script = join(output, "must-not-run.mjs"), marker = join(output, "executed");
    writeFileSync(script, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'bad');`);
    writeFileSync(join(output, "native-stacks.json"), '{"complete":true}');
    const result = await runNativeStackReplay(script, { output, availability: { status: "UNAVAILABLE", reason: "Fixture" } });
    assert.equal(result.status, "NOT_RUN"); assert.equal(existsSync(marker), false);
    assert.equal(existsSync(join(output, "native-stacks.json")), false);
    assert.equal(JSON.parse(readFileSync(join(output, "execution.json"))).status, "NOT_RUN");
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("separate native replay success, timeout and observer error all preserve the original failure", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  for (const outcome of ["success", "timeout", "error", "dirty", "stale", "changed-bytes"]) {
    const output = mkdtempSync(join(tmpdir(), "robys-native-verdict-")); let calls = 0, replays = 0;
    try {
      const code = await runCanonicalDiagnostics({ output, nativeStackEnabled: true,
        execute: async () => {
          if (++calls === 1) writeFileSync(join(output, "report.json"), JSON.stringify({
            head: outcome === "stale" ? "0".repeat(40) : head, dirtyFilesAtStart: outcome === "dirty" ? [" M menu.html"] : [],
            boundBytesUnchanged: outcome !== "changed-bytes", complete: false,
            cases: [{ id: "redraw-ru", language: "ru", deviceScaleFactor: 1, status: "FAIL",
              lifecycleAfterCapture: { events: [{ event: "page-crash" }] } }] }));
          return { code: calls === 1 ? 1 : 0, signal: null };
        }, replay: async (script, options) => {
          replays++; assert(script.endsWith("/test-menu-lazy-images-browser.mjs"));
          assert.equal(options.output, join(output, "diagnostics/native-stack-replay"));
          assert.equal(options.env.ROBYS_LAZY_QA_DIR, options.output);
          if (outcome === "error") throw new Error("Observer failure");
          return { status: outcome === "timeout" ? "INCONCLUSIVE_TIMEOUT" : "COMPLETED", code: 0 };
        } });
      assert.equal(code, 1);
      const valid = !["dirty", "stale", "changed-bytes"].includes(outcome);
      assert.equal(replays, valid ? 1 : 0); assert.equal(calls, valid ? 3 : 1);
      const receipt = JSON.parse(readFileSync(join(output, "diagnostics/summary.json")));
      assert.equal(receipt.canonical.effectiveExitCode, 1);
      if (outcome === "error") assert.equal(receipt.nativeStackReplay.status, "INCOMPLETE");
    } finally { rmSync(output, { recursive: true, force: true }); }
  }
});

test("real GDB follows fork/exec and separates handled SIGSEGV from fatal child termination", async t => {
  const availability = gdbAvailability();
  if (process.env.ROBYS_REQUIRE_NATIVE_STACKS === "1") assert.equal(availability.status, "AVAILABLE", availability.reason);
  if (availability.status !== "AVAILABLE") { t.skip(availability.reason); return; }
  const output = mkdtempSync(join(tmpdir(), "robys-native-signal-"));
  try {
    const script = join(output, "fixture.mjs");
    writeFileSync(script, `import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const handled=spawnSync('/bin/sh',['-c','ulimit -c 0; trap "exit 0" SEGV; kill -s SEGV "$$"']);
assert.equal(handled.status,0);
const fatal=spawnSync('/bin/sh',['-c','ulimit -c 0; kill -s SEGV "$$"']);
assert.equal(fatal.signal,'SIGSEGV');process.exit(7);
`);
    const result = await runNativeStackReplay(script, { output, availability, timeoutMs: 20000 });
    if (result.status !== "COMPLETED" || result.code !== 7) t.diagnostic(JSON.stringify(result) + "\n" + readFileSync(join(output, "gdb.log"), "utf8").slice(-6000));
    assert.equal(result.status, "COMPLETED"); assert.equal(result.observerComplete, true); assert.equal(result.code, 7);
    const receipt = JSON.parse(readFileSync(join(output, "native-stacks.json")));
    const stopped = receipt.signals.filter(row => row.signal === "SIGSEGV");
    assert(stopped.length >= 2); assert(stopped.some(row => row.frames.length > 0));
    assert(stopped.every(row => row.fatal === "UNKNOWN_UNTIL_EXIT"));
    assert(stopped.some(row => receipt.exits.some(exit => exit.inferior === row.inferior && exit.exitCode === 0)));
    assert(stopped.some(row => receipt.exits.some(exit => exit.inferior === row.inferior && exit.signal === 11)));
    assert(receipt.signals.every(row => row.frames.every(frame => !('arguments' in frame) && !('locals' in frame))));
    assert.equal(receipt.rootExitCode, 7);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("real debugger deadline remains inconclusive and stops its own diagnostic invocation", async t => {
  const availability = gdbAvailability();
  if (process.env.ROBYS_REQUIRE_NATIVE_STACKS === "1") assert.equal(availability.status, "AVAILABLE", availability.reason);
  if (availability.status !== "AVAILABLE") { t.skip(availability.reason); return; }
  const output = mkdtempSync(join(tmpdir(), "robys-native-deadline-"));
  try {
    const script = join(output, "held.mjs"); writeFileSync(script, "setInterval(() => {}, 1000);\n");
    const result = await runNativeStackReplay(script, { output, availability, timeoutMs: 3000 });
    assert.equal(result.status, "INCONCLUSIVE_TIMEOUT");
    const receipt = JSON.parse(readFileSync(join(output, "native-stacks.json")));
    assert.equal(receipt.complete, false); assert.match(receipt.observerError, /KeyboardInterrupt/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
