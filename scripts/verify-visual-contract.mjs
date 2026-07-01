import { existsSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("qa/visual-regression.json", "utf8"));
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const workflow = readFileSync(".github/workflows/visual-regression.yml", "utf8");
const runner = readFileSync("scripts/visual-regression.mjs", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[VISUAL-001] ${message}`);
}

assert(config.version === 2, "Visual configuration version changed unexpectedly");
assert(config.pixelThreshold > 0 && config.pixelThreshold <= 0.2, "Pixel threshold must stay conservative");
assert(config.defaultMaxDiffPixelRatio > 0 && config.defaultMaxDiffPixelRatio <= 0.01, "Default diff ratio must remain at or below 1%");

const expectedViewports = [
  { id: "phone-320", width: 320, height: 900 },
  { id: "phone-360-short", width: 360, height: 640 },
  { id: "phone-390", width: 390, height: 1000 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "laptop-1366", width: 1366, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1100 }
];
const viewportIds = config.viewports.map((viewport) => viewport.id);
assert(new Set(viewportIds).size === viewportIds.length, "Viewport ids must be unique");
assert(
  JSON.stringify(config.viewports) === JSON.stringify(expectedViewports),
  "Viewport matrix must match the approved phone, tablet, laptop and desktop coverage"
);
for (const viewport of config.viewports) {
  assert(Number.isInteger(viewport.width) && viewport.width > 0, `Invalid width for ${viewport.id}`);
  assert(Number.isInteger(viewport.height) && viewport.height > 0, `Invalid height for ${viewport.id}`);
}

const captures = new Map(config.captures.map((capture) => [capture.id, capture]));
for (const required of [
  "landing-full",
  "menu-full",
  "discover-full",
  "hero",
  "menu-preview",
  "visit-map",
  "social-offer",
  "menu-share",
  "discover-pairing",
  "mobile-cta"
]) {
  assert(captures.has(required), `Missing required capture ${required}`);
}
assert(captures.get("landing-full").viewports.length === 4, "Landing full-page capture must cover four responsive profiles");
assert(captures.get("menu-full").viewports.length === 4, "Menu full-page capture must cover four responsive profiles");
assert(captures.get("discover-full").viewports.length === 4, "Discover full-page capture must cover four responsive profiles");
assert(captures.get("menu-full").waitFor === ".full-menu-item", "Menu capture must wait for rendered products");
assert(captures.get("discover-full").waitFor === "#pairing-card", "Discover capture must wait for the pairing card");
assert(captures.get("hero").selector === ".hero", "Hero selector changed");
assert(captures.get("menu-preview").selector === ".menu-section", "Menu preview selector changed");
assert(captures.get("visit-map").selector === ".visit-section", "Visit/map selector changed");
assert(captures.get("social-offer").selector === "#daily-offer", "Social offer selector changed");
assert(captures.get("menu-share").selector === ".menu-share-card", "Menu share selector changed");
assert(captures.get("discover-pairing").selector === "#pairing-card", "Discover pairing selector changed");
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
assert(workflow.includes("scripts/ui-ux-matrix.mjs"), "Visual workflow must execute the UI/UX matrix");
assert(workflow.includes("scripts/verify-social-network-live.mjs"), "Visual workflow must recheck the live social destination");
assert(workflow.includes("playwright install --with-deps chromium"), "Visual workflow must install deterministic Chromium");
assert(workflow.includes("upload-artifact@6f51ac03b9356f520e9adb1b1b7802705f340c2b"), "Visual workflow must pin the artifact uploader");
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
