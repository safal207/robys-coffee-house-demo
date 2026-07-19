import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runnerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actualRunnerCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: runnerRoot,
  encoding: "utf8"
}).trim().toLowerCase();
const argumentIndex = process.argv.indexOf("--trusted-runner-commit");
const requestedRunnerCommit = argumentIndex >= 0 && argumentIndex + 1 < process.argv.length
  ? String(process.argv[argumentIndex + 1]).trim().toLowerCase()
  : "";

if (!/^[0-9a-f]{40}$/.test(requestedRunnerCommit) || requestedRunnerCommit !== actualRunnerCommit) {
  console.error(JSON.stringify({
    error: "TRUSTED_RUNNER_IDENTITY_MISMATCH",
    requestedRunnerCommit: requestedRunnerCommit || "missing",
    actualRunnerCommit
  }, null, 2));
  process.exit(1);
}

process.env.ROBYS_TRUSTED_RUNNER_ACTUAL = actualRunnerCommit;
await import("./run-product-lens-v1.mjs");
