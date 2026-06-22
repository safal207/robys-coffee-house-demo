import { existsSync, readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/live-smoke.yml", "utf8");
const runner = readFileSync("scripts/live-smoke.mjs", "utf8");
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`[LIVE-001] ${message}`);
}

assert(existsSync(".github/workflows/live-smoke.yml"), "workflow missing");
assert(workflow.includes("branches: [main]"), "main push trigger missing");
assert(workflow.includes("schedule:"), "schedule trigger missing");
assert(workflow.includes("playwright install --with-deps chromium"), "browser install missing");
assert(workflow.includes("ROBYS_LIVE_ATTEMPTS: 15"), "retry protection changed");
assert(workflow.includes("if: always()"), "failure evidence upload changed");

for (const marker of ["robys-build", "robots.txt", "sitemap.xml", ".hero-video", ".mobile-cta", ".map-live-frame", ".full-menu-item", "#menu-search", "Lotus", "Escape"]) {
  assert(runner.includes(marker), `runner check missing: ${marker}`);
}

const contract = dashboard.contracts?.find((item) => item.id === "LIVE-001");
assert(contract?.status === "gated", "dashboard contract missing or disabled");
assert(contract?.severity === "P0", "severity changed");
assert(contract?.owner === "QA", "owner changed");
assert(contract?.evidence === "post-merge Chromium + HTTP", "evidence changed");
assert(contract?.assertions?.length >= 8, "assertions incomplete");

console.log("✅ LIVE-001 workflow and smoke coverage are protected.");
