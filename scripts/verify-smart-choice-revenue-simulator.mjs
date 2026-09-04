import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const required = [
  "src/smart-choice/revenue-simulator-domain.ts",
  "src/smart-choice/revenue-simulator.ts",
  "smart-choice/simulator.html",
  "smart-choice/simulator.css",
  "smart-choice/simulator-v2.js"
];
for (const file of required) assert.ok(existsSync(file), `${file} is missing`);

const html = readFileSync("smart-choice/simulator.html", "utf8");
const css = readFileSync("smart-choice/simulator.css", "utf8");
const source = readFileSync("src/smart-choice/revenue-simulator.ts", "utf8");
const domain = readFileSync("src/smart-choice/revenue-simulator-domain.ts", "utf8");
const bundle = readFileSync("smart-choice/simulator-v2.js", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(html, /meta name="robots" content="noindex,nofollow,noarchive"/, "owner tool must not be indexed");
assert.match(html, /connect-src 'none'/, "simulator must not send data to a network endpoint");
assert.match(html, /src="simulator-v2\.js\?v=[a-f0-9]{12}"/, "cache-new simulator bundle revision must be synchronized");
assert.ok(!html.includes('src="simulator.js'), "owner simulator must not request the legacy cache-colliding bundle");
assert.match(html, /href="simulator\.css\?v=[a-f0-9]{12}"/, "simulator CSS revision must be synchronized");
assert.match(html, /id="revenue-simulator-form"/, "owner input form is missing");
assert.match(html, /id="revenue-simulator-status"[^>]*role="status"[^>]*aria-live="polite"/, "accessible live status is missing");
assert.match(html, /Owner approval required/, "owner-approval boundary is missing");
assert.match(html, /name="locale" value="ru-RU"/, "owner UI must use its declared Russian locale");
assert.ok(!html.includes('option value="tr-TR"') && !html.includes('option value="en-US"'), "untranslated locale options must not be exposed");
assert.match(html, /<noscript>[\s\S]*целевая выручка = текущая выручка/, "manual no-JavaScript formula fallback is required");
assert.ok(!/<script(?![^>]*src=)[^>]*>\s*[^<]/i.test(html), "inline executable scripts are forbidden");
assert.ok(!/<style\b/i.test(html), "inline styles are forbidden");
assert.ok(!/style\s*=/i.test(html), "inline style attributes are forbidden");

assert.ok(source.includes('from "./catalog.js"'), "simulator must use the verified catalog");
assert.ok(source.includes("deriveAvailableMechanisms"), "simulator must use the tested mechanism classifier");
assert.ok(domain.includes('sourceStatus === "confirmed"'), "only confirmed mechanisms may be used");
assert.ok(domain.includes('availability === "available"'), "only available mechanisms may be used");
assert.ok(domain.includes('pricingMode !== "menu-item"'), "single menu items must not be classified as pairing mechanisms");
assert.ok(source.includes("exportRevenueSimulationJson"), "JSON export is missing");
assert.ok(source.includes("exportRevenueSimulationMarkdown"), "Markdown export is missing");
assert.ok(source.includes("Blob"), "local export must use a browser Blob");
assert.ok(!source.includes("fetch("), "simulator UI must not send network requests");
assert.ok(!source.includes("innerHTML"), "simulator UI must not write raw HTML");
assert.ok(!source.includes("Math.random"), "simulator must remain deterministic");
assert.ok(source.includes('heading.id = "results-placeholder-title"'), "results region label must remain valid after rendering");
assert.ok(source.includes("runSimulation(false)"), "initial calculation must not steal focus");
assert.ok(source.includes("scenario.financials"), "computed gross-profit and margin fields must be rendered");

assert.ok(domain.includes('claimLevel: "scenario-only"'), "scenario-only claim boundary is missing");
assert.ok(domain.includes("automaticPriceChangesAllowed: false"), "automatic price changes must be forbidden");
assert.ok(domain.includes("ownerApprovalRequired: true"), "owner approval must be required");
assert.ok(domain.includes("proposedDiscountBps: 0"), "simulator must not propose a discount");
assert.ok(domain.includes("average-cogs-per-order"), "revenue-only missing-data warning is missing");
assert.ok(domain.includes("futureExperimentId"), "hypotheses must link to future experiments");
assert.ok(domain.includes("revenue × conversion"), "explicit revenue formula is missing");
assert.ok(domain.includes("Gross profit / margin"), "human-readable financial export is missing");

assert.ok(css.includes("min-width: 320px"), "320px mobile floor is missing");
assert.ok(css.includes("overflow-x: hidden"), "horizontal overflow guard is missing");
assert.ok(css.includes("overflow-wrap: anywhere"), "long-value wrapping is missing");
assert.ok(css.includes("prefers-reduced-motion"), "reduced-motion support is missing");
assert.ok(css.includes(":focus-visible"), "visible keyboard focus is missing");

assert.ok(packageJson.scripts["test:smart-choice-revenue-simulator"], "revenue simulator test command is missing");
assert.ok(packageJson.scripts["verify:smart-choice-revenue-simulator"], "revenue simulator verify command is missing");
assert.ok(packageJson.scripts.build.includes("test:smart-choice-revenue-simulator"), "build must execute simulator arithmetic tests");
assert.ok(packageJson.scripts.build.includes("verify:smart-choice-revenue-simulator"), "build must verify generated simulator assets");
assert.ok(packageJson.scripts.check.includes("smart-choice/simulator-v2.js"), "check must syntax-check the cache-new simulator bundle");

assert.ok(statSync("smart-choice/simulator-v2.js").size <= 100_000, "simulator JS exceeds the 100 KB owner-tool budget");
assert.ok(statSync("smart-choice/simulator.css").size <= 80_000, "simulator CSS exceeds the 80 KB owner-tool budget");
assert.ok(statSync("smart-choice/simulator.html").size <= 30_000, "simulator HTML exceeds the 30 KB owner-tool budget");
assert.ok(bundle.length > 5_000, "generated simulator bundle is unexpectedly small");
assert.ok(!bundle.includes("sourceMappingURL"), "production simulator bundle must not expose a source map URL");

console.log("✅ SMART-CHOICE-REVENUE-SIMULATOR verified: owner-only page, catalog parity, exports, guardrails and budgets passed.");
