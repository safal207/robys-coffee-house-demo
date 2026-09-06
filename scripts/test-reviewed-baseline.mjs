import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const verifier = path.resolve("scripts/verify-reviewed-visual-change.mjs");
const root = mkdtempSync(path.join(os.tmpdir(), "reviewed-baseline-"));
const base = path.join(root, "baseline");
mkdirSync(base);
mkdirSync(path.join(root, "qa"));
mkdirSync(path.join(root, "visual-results"));
const git = (...args) => execFileSync("git", args, { cwd: base, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const json = (name, data) => writeFileSync(path.join(root, name), JSON.stringify(data));
let checks = 0;
try {
  writeFileSync(path.join(base, "page.css"), "body{color:red}");
  writeFileSync(path.join(root, "page.css"), "body{color:blue}");
  git("init"); git("add", "page.css");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "baseline");
  const head = git("rev-parse", "HEAD");
  const failure = { id: "menu-full", viewport: "phone-320", reason: "dimension mismatch 320x100 vs 320x120", passed: false };
  const summary = { baselineDirectory: base, results: [failure] };
  const change = { id: "test", reviewUrl: "fixture", baselineHead: head,
    contentBindings: { "page.css": git("hash-object", path.join(root, "page.css")) },
    baselineBindings: { "page.css": git("hash-object", "page.css") },
    expectedFailures: [{ capture: failure.id, viewport: failure.viewport, reason: failure.reason }] };
  const check = (name, expected) => {
    json("qa/reviewed-visual-changes.json", { version: 1, reviewedChanges: [change] });
    json("visual-results/summary.json", summary);
    const result = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8",
      env: { ...process.env, VISUAL_RESULTS_DIR: path.join(root, "visual-results") } });
    assert.equal(result.status === 0, expected, `${name}: ${result.stderr}`);
    checks++;
  };
  check("exact content and baseline", true);
  writeFileSync(path.join(base, "page.css"), "body{color:green}");
  check("uncommitted baseline drift", false);
  writeFileSync(path.join(base, "page.css"), "body{color:red}");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "new baseline identity");
  check("different base SHA with identical bytes", false);
  change.baselineHead = git("rev-parse", "HEAD");
  check("explicitly rebound base", true);
  writeFileSync(path.join(root, "page.css"), "body{color:green}");
  check("current content drift", false);
  writeFileSync(path.join(root, "page.css"), "body{color:blue}");
  summary.results.push({ ...failure, id: "menu-share" });
  check("unexpected additional failure", false);
  summary.results.pop();
  summary.results[0] = { ...failure, reason: "dimension mismatch 320x100 vs 320x121" };
  check("different page height", false);
  console.log(`REVIEWED-BASELINE: ${checks}/7 PASS`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
