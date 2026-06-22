import { existsSync, readFileSync } from "node:fs";

const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

function assert(condition, id, message) {
  if (!condition) throw new Error(`[${id}] ${message}`);
}

for (const file of [
  "scripts/adversarial-browser.mjs",
  "scripts/generate-integrity-manifest.mjs",
  "scripts/verify-integrity-manifest.mjs",
  "scripts/verify-live-integrity.mjs",
  ".github/workflows/adversarial-browser.yml",
  ".github/workflows/zap-baseline.yml",
  ".github/workflows/live-integrity.yml",
  "docs/adversarial-test-plan.md",
  "integrity-manifest.json"
]) assert(existsSync(file), "ADV-001", `Missing adversarial security control: ${file}`);

const browserScript = readFileSync("scripts/adversarial-browser.mjs", "utf8");
assert(browserScript.includes("bypassCSP: false"), "ADV-001", "Browser probes must use the production CSP");
assert(browserScript.includes("securitypolicyviolation"), "ADV-001", "CSP violation evidence is missing");
assert(browserScript.includes("data-search-probe"), "ADV-001", "Search-input markup probe is missing");
assert(browserScript.includes("data-hash-probe"), "ADV-001", "URL-fragment markup probe is missing");
assert(browserScript.includes("networkOrigins"), "ADV-001", "Network origin allowlist probe is missing");
assert(browserScript.includes("robys-language"), "ADV-001", "Persisted language abuse case is missing");

const zapWorkflow = readFileSync(".github/workflows/zap-baseline.yml", "utf8");
assert(zapWorkflow.includes("zaproxy/action-baseline@"), "DAST-001", "OWASP ZAP baseline action is missing");
assert(zapWorkflow.includes("allow_issue_writing: false"), "DAST-001", "ZAP must not create public issues automatically");
assert(zapWorkflow.includes("contents: read"), "DAST-001", "ZAP workflow permissions are not read-only");
assert(zapWorkflow.includes("-I"), "DAST-001", "Passive warnings must remain evidence without becoming noisy false-positive failures");

const manifest = JSON.parse(readFileSync("integrity-manifest.json", "utf8"));
assert(manifest.version === 1 && manifest.algorithm === "sha256", "INTEGRITY-001", "Integrity manifest format changed");
assert(Array.isArray(manifest.files) && manifest.files.length >= 10, "INTEGRITY-001", "Integrity manifest is unexpectedly small");
assert(manifest.files.some((entry) => entry.path === "index.html"), "INTEGRITY-001", "Landing page is not protected by the manifest");
assert(manifest.files.some((entry) => entry.path === "menu.html"), "INTEGRITY-001", "Menu page is not protected by the manifest");
assert(manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)), "INTEGRITY-001", "Manifest contains an invalid SHA-256 digest");

assert(packageJson.scripts?.["verify:adversarial"] === "node scripts/verify-adversarial-contracts.mjs", "ADV-001", "verify:adversarial package script changed");
assert(packageJson.scripts?.["verify:integrity"] === "node scripts/generate-integrity-manifest.mjs --check && node scripts/verify-integrity-manifest.mjs", "INTEGRITY-001", "verify:integrity package script changed");
assert(packageJson.scripts?.["verify:integrity:live"] === "node scripts/verify-live-integrity.mjs", "INTEGRITY-001", "live integrity package script changed");

for (const id of ["ADV-001", "DAST-001", "INTEGRITY-001"]) {
  const contract = dashboard.contracts?.find((item) => item.id === id);
  assert(contract?.status === "gated", id, `${id} is missing or disabled in the dashboard`);
  assert(contract?.owner === "Security + QA", id, `${id} owner changed`);
  assert(Array.isArray(contract?.assertions) && contract.assertions.length >= 5, id, `${id} assertions are incomplete`);
}

console.log("✅ ADV-001, DAST-001 and INTEGRITY-001 control wiring passed.");
