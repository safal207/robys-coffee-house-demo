import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { appendFile, mkdtemp, mkdir, open, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectReports, matchesReport, readCandidate } from "./collect-macos-webkit-crashes.mjs";

function report(name, path) {
  return JSON.stringify({ app_name: name }) + "\n" + JSON.stringify({ procName: name, procPath: path, pid: 17,
    extraRunnerMetadata: "fixture-unneeded-field", exception: { signal: "SIGSEGV" },
    threads: [{ triggered: true, frames: [{ imageIndex: 0, imageOffset: 42, symbol: "crash" }] }],
    usedImages: [{ name: "Playwright", uuid: "abc", path: "/private/runner" }] });
}

test("only a new report for the bound Playwright executable is preserved", async () => {
  const temp = await mkdtemp(join(tmpdir(), "webkit-reports-"));
  try {
    const source = join(temp, "source"), output = join(temp, "output"), browser = join(temp, "webkit-2203");
    await mkdir(source);
    const matching = report("Playwright", join(browser, "Playwright.app", "Contents", "MacOS", "Playwright"));
    await writeFile(join(source, "matching.ips"), matching);
    await writeFile(join(source, "unrelated.ips"), report("Playwright", join(temp, "other", "Playwright")));
    await writeFile(join(source, "bad.ips"), "not valid JSON");
    await writeFile(join(source, "stale.ips"), matching);
    const startedAt = Date.now() - 1000;
    await utimes(join(source, "stale.ips"), new Date(startedAt - 5000), new Date(startedAt - 5000));
    const receipt = await collectReports({ directories: [source, join(temp, "missing")], browserRoot: browser, startedAt, output, waitMs: 0 });
    assert.equal(receipt.status, "captured");
    assert.deepEqual(receipt.files, [{ sourceName: "matching.ips", file: "webkit-crash-1.json" }]);
    const saved = await readFile(join(output, "webkit-crash-1.json"), "utf8");
    const summary = JSON.parse(saved);
    assert.equal(summary.exception.signal, "SIGSEGV");
    assert.equal(summary.threads[0].frames[0].imageOffset, 42);
    assert.equal(saved.includes("fixture-unneeded-field"), false);
    assert.equal(saved.includes("/private/runner"), false);
    assert.match(receipt.association, /not correlated/);
    assert.equal(matchesReport(report("WebKit", join(browser, "WebKit")), browser), false);
    assert.equal(matchesReport(report("Playwright", `${browser}-other/Playwright`), browser), false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("wait is bounded and an absent report remains explicitly inconclusive", async () => {
  const temp = await mkdtemp(join(tmpdir(), "webkit-empty-"));
  try {
    let time = 10000;
    const receipt = await collectReports({ directories: [join(temp, "missing")], browserRoot: join(temp, "webkit-2203"),
      startedAt: time - 1000, output: join(temp, "output"), waitMs: 3000, pollMs: 2000,
      now: () => time, pause: async ms => { time += ms; } });
    assert.equal(time, 13000);
    assert.equal(receipt.status, "not-found");
    assert.deepEqual(receipt.files, []);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("a report written after the first scan is captured before the deadline", async () => {
  const temp = await mkdtemp(join(tmpdir(), "webkit-late-"));
  try {
    const source = join(temp, "source"), browser = join(temp, "webkit-2203");
    await mkdir(source);
    let time = Date.now();
    const startedAt = time - 1000;
    const receipt = await collectReports({ directories: [source], browserRoot: browser, startedAt,
      output: join(temp, "output"), waitMs: 3000, pollMs: 1000, now: () => time,
      pause: async ms => { time += ms; await writeFile(join(source, "late.ips"), report("Playwright", join(browser, "Playwright"))); } });
    assert.equal(receipt.status, "captured");
    assert.equal(receipt.files[0].sourceName, "late.ips");
    assert.equal(time, startedAt + 2000);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("a replacement after open cannot change the file being read", { skip: process.platform === "win32" }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "webkit-replaced-"));
  try {
    const path = join(temp, "report.ips"), original = "original report";
    await writeFile(path, original);
    const result = await readCandidate(path, Date.now() - 5000, { openFile: async (...args) => {
      const file = await open(...args);
      await rename(path, join(temp, "original.ips"));
      await writeFile(path, "replacement report");
      return file;
    } });
    assert.equal(result, original);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("a final-path symlink substituted before open is not followed", { skip: process.platform === "win32" }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "webkit-symlink-"));
  try {
    const path = join(temp, "report.ips"), target = join(temp, "target.ips");
    await writeFile(path, "old"); await writeFile(target, "outside");
    await assert.rejects(readCandidate(path, 0, { openFile: async (...args) => {
      await rm(path); await symlink(target, path);
      return open(...args);
    } }), error => error.code === "ELOOP");
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("a substituted FIFO is opened nonblocking and rejected before reading", { skip: process.platform === "win32" }, async () => {
  let closed = false, observedFlags;
  const result = await readCandidate("substituted-fifo.ips", 0, { openFile: async (_path, flags) => {
    observedFlags = flags;
    return {
      async stat() { return { isFile: () => false }; },
      async read() { throw new Error("FIFO must never be read"); },
      async close() { closed = true; }
    };
  } });
  assert.ok((observedFlags & constants.O_NONBLOCK) !== 0);
  assert.equal(result, null);
  assert.equal(closed, true);
});

test("growth during reading is bounded and discarded", async () => {
  const temp = await mkdtemp(join(tmpdir(), "webkit-growth-"));
  try {
    const path = join(temp, "report.ips"); await writeFile(path, "abc");
    let readBytes = 0, firstRead = true;
    const result = await readCandidate(path, 0, { maxBytes: 8, openFile: async (...args) => {
      const file = await open(...args);
      return { stat: () => file.stat(), close: () => file.close(), async read(...readArgs) {
        const result = await file.read(...readArgs); readBytes += result.bytesRead;
        if (firstRead) { firstRead = false; await appendFile(path, "01234567890123456789"); }
        return result;
      } };
    } });
    assert.equal(result, null);
    assert.equal(readBytes, 9);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("a close error cannot replace the original read error", async () => {
  const original = new Error("read failed"); let closeCalled = false;
  await assert.rejects(readCandidate("unused", 0, { maxBytes: 8, openFile: async () => ({
    async stat() { return { isFile: () => true, mtimeMs: 1, ctimeMs: 1, size: 3 }; },
    async read() { throw original; }, async close() { closeCalled = true; throw new Error("close failed"); }
  }) }), error => error === original);
  assert.equal(closeCalled, true);
});
