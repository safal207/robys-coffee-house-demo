import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const profile = process.argv[2];
if (!["mobile", "desktop"].includes(profile)) throw new Error("profile must be mobile or desktop");
const version = process.env.LHCI_VERSION ?? "0.15.1";
// A newly resolved robots-parser@3.1.1 tarball returned npm 404 in both
// Lighthouse profiles on 2026-11-21. Keep the reviewed CLI version and
// freeze only its transient npx dependency resolution before that release.
// Fail closed if the pinned dependency graph cannot be installed.
const npmBefore = "2026-11-18T00:00:00.000Z";
const config = `lighthouse/lighthouserc.${profile}.cjs`;
const reportDir = "lighthouse/reports";
mkdirSync(reportDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) { console.error(result.error); return 99; }
  return result.status ?? 99;
}

const lhciArgs = command => ["--yes", `--before=${npmBefore}`, `@lhci/cli@${version}`, command, `--config=${config}`];
const collectExit = run("npx", lhciArgs("collect"));
const hardAssertExit = run("npx", lhciArgs("assert"));
const uploadExit = run("npx", lhciArgs("upload"));
const summaryExit = run(process.execPath, ["scripts/summarize-lighthouse.mjs", "--profile", profile, "--input", ".lighthouseci", "--output", `${reportDir}/${profile}-summary.json`]);
const regressionExit = run(process.execPath, ["scripts/compare-lighthouse.mjs", "--profile", profile, "--summary", `${reportDir}/${profile}-summary.json`, "--output", `${reportDir}/${profile}-regression-report.json`]);

const status = { profile, collect_exit: collectExit, hard_assert_exit: hardAssertExit, upload_exit: uploadExit, summary_exit: summaryExit, regression_exit: regressionExit };
writeFileSync(`${reportDir}/${profile}-status.json`, `${JSON.stringify(status, null, 2)}\n`);
console.log(status);

if (process.env.LIGHTHOUSE_ENFORCE !== "true") {
  console.warn(`Lighthouse observability mode: gate not enforced for ${profile}`);
  process.exit(0);
}
if ([collectExit, hardAssertExit, summaryExit, regressionExit].some(code => code !== 0)) {
  console.error(`Lighthouse performance gate failed for ${profile}`);
  process.exit(1);
}
