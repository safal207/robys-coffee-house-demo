import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectReports, matchesReport } from "./collect-macos-webkit-crashes.mjs";

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
