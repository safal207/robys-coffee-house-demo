import { existsSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("qa/visual-regression.json", "utf8"));
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const workflow = readFileSync(".github/workflows/visual-regression.yml", "utf8");
const runner = readFileSync("scripts/visual-regression.mjs", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[VISUAL-001] ${message}`);
}

assert(config.version === 1, "Visual configuration version changed unexpectedly");
assert(config.pixelThreshold > 0 && config.pixelThreshold <= 0.2, "Pixel threshold must stay conservative");
assert(config.defaultMaxDiffPixelRatio > 0 && config.defaultMaxDiffPixelRatio <= 0.01, "Default diff ratio must remain at or below 1%");

const viewportIds = config.viewports.map((viewport) => viewport.id);
const widths = config.viewports.map((viewport) => viewport.width).sort((a, b) => a - b);
assert(JSON.stringify(widths) === JSON.stringify([320, 390, 768, 1440]), "Viewport matrix must remain 320, 390, 768 and 1440 pixels wide");
assert(new Set(viewportIds).size === viewportIds.length, "Viewport ids must be unique");
for (const viewport of config.viewports) {
  assert(Number.isInteger(viewport.width) && viewport.width > 0, `Invalid width for ${viewport.id}`);
  assert(Number.isInteger(viewport.height) && viewport.height >= 800, `Invalid height for ${viewport.id}`);
}

const captures = new Map(config.captures.map((capture) => [capture.id, capture]));
for (const required of ["landing-full", "menu-full", "hero", "menu-preview", "visit-map", "mobile-cta"]) {
  assert(captures.has(required), `Missing required capture ${required}`);
}
assert(captures.get("landing-full").viewports.length === 4, "Landing full-page capture must cover all viewports");
assert(captures.get("menu-full").viewports.length === 4, "Menu full-page capture must cover all viewports");
assert(captures.get("menu-full").waitFor === ".full-menu-item", "Menu capture must wait for rendered products");
assert(captures.get("hero").selector === ".hero", "Hero selector changed");
assert(captures.get("menu-preview").selector === ".menu-section", "Menu preview selector changed");
assert(captures.get("visit-map").selector === ".visit-section", "Visit/map selector changed");
assert(captures.get("mobile-cta").selector === ".mobile-cta", "Mobile CTA selector changed");
for (const capture of config.captures) {
  assert(capture.viewports.length > 0, `${capture.id} has no viewports`);
  assert(capture.viewports.every((id) => viewportIds.includes(id)), `${capture.id} references an unknown viewport`);
  assert((capture.maxDiffPixelRatio ?? config.defaultMaxDiffPixelRatio) <= 0.01, `${capture.id} diff tolerance exceeds 1%`);
}

assert(existsSync(".github/workflows/visual-regression.yml"), "Visual workflow is missing");
assert(/pull_request:/i.test(workflow), "Visual workflow must run on pull requests");
assert(workflow.includes("github.event.pull_request.base.sha"), "Visual workflow must compare against the PR base SHA");
assert(workflow.includes("scripts/visual-regression.mjs"), "Visual workflow must execute the comparator");
assert(workflow.includes("playwright install --with-deps chromium"), "Visual workflow must install deterministic Chromium");
assert(workflow.includes("upload-artifact"), "Visual workflow must upload screenshots and diffs");
assert(workflow.includes("if: always()"), "Visual artifacts must be uploaded even when comparison fails");

for (const requiredToken of ["pixelmatch", "PNG.sync.read", "deviceScaleFactor: 1", "reducedMotion: \"reduce\"", "hero-video", "map-live-frame", "summary.json"]) {
  assert(runner.includes(requiredToken), `Visual runner lost required stabilization/comparison token: ${requiredToken}`);
}

const contract = dashboard.contracts?.find((item) => item.id === "VISUAL-001");
assert(contract, "VISUAL-001 is missing from the regression dashboard");
assert(contract.status === "gated", "Dashboard status must remain gated");
assert(contract.severity === "P1", "Dashboard severity must remain P1");
assert(contract.owner === "QA", "Dashboard owner must remain QA");
assert(contract.evidence === "CI screenshot diff", "Dashboard evidence must remain CI screenshot diff");
assert(contract.devices?.includes("mobile") && contract.devices?.includes("desktop"), "Dashboard must cover mobile and desktop");
assert(Array.isArray(contract.assertions) && contract.assertions.length >= 7, "Dashboard assertions are incomplete");

console.log("✅ VISUAL-001 configuration is wired, bounded and protected.");
