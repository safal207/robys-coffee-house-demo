import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ACTIVE_HERO_PATH } from "./media-contract-config.mjs";

const profile = process.argv[2];
if (!["mobile", "desktop"].includes(profile)) throw new Error("profile must be mobile or desktop");
const version = process.env.LHCI_VERSION ?? "0.15.1";
const config = `lighthouse/lighthouserc.${profile}.cjs`;
const reportDir = "lighthouse/reports";
mkdirSync(reportDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(result.error);
    return 99;
  }
  return result.status ?? 99;
}

const collectExit = run("npx", ["--yes", `@lhci/cli@${version}`, "collect", `--config=${config}`]);
const hardAssertExit = run("npx", ["--yes", `@lhci/cli@${version}`, "assert", `--config=${config}`]);
const uploadExit = run("npx", ["--yes", `@lhci/cli@${version}`, "upload", `--config=${config}`]);
const summaryExit = run(process.execPath, [
  "scripts/summarize-lighthouse.mjs",
  "--profile", profile,
  "--input", ".lighthouseci",
  "--output", `${reportDir}/${profile}-summary.json`,
  "--hero", ACTIVE_HERO_PATH,
]);
const regressionExit = run(process.execPath, [
  "scripts/compare-lighthouse.mjs",
  "--profile", profile,
  "--summary", `${reportDir}/${profile}-summary.json`,
  "--output", `${reportDir}/${profile}-regression-report.json`,
]);

const status = {
  profile,
  active_hero_path: ACTIVE_HERO_PATH,
  collect_exit: collectExit,
  hard_assert_exit: hardAssertExit,
  upload_exit: uploadExit,
  summary_exit: summaryExit,
  regression_exit: regressionExit,
};
writeFileSync(`${reportDir}/${profile}-status.json`, `${JSON.stringify(status, null, 2)}\n`);
console.log(status);

if (process.env.LIGHTHOUSE_ENFORCE !== "true") {
  console.warn(`Lighthouse observability mode: gate not enforced for ${profile}`);
  process.exit(0);
}
if ([collectExit, hardAssertExit, summaryExit, regressionExit].some((code) => code !== 0)) {
  console.error(`Lighthouse performance gate failed for ${profile}`);
  process.exit(1);
}
