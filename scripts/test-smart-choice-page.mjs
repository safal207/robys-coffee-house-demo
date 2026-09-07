import { existsSync, readFileSync } from "node:fs";

// This contract validates both authored source and the exact generated static assets shipped by hosting.
function assert(condition, message) {
  if (!condition) throw new Error(`[SMART-CHOICE-PAGE-TEST] ${message}`);
}

for (const path of [
  "smart-choice/index.html",
  "smart-choice/style.css",
  "smart-choice/app-v2.js",
  "src/smart-choice/page.ts"
]) {
  assert(existsSync(path), `${path} is missing`);
}

const html = readFileSync("smart-choice/index.html", "utf8");
const css = readFileSync("smart-choice/style.css", "utf8");
const source = readFileSync("src/smart-choice/page.ts", "utf8");
const bundle = readFileSync("smart-choice/app-v2.js", "utf8");
const homepageEnhancements = readFileSync("src/social-offer.ts", "utf8");

assert(/<main\b[^>]*id="smart-choice-main"/.test(html), "Smart Choice main landmark is missing");
assert(/id="smart-choice-app"/.test(html), "Smart Choice app root is missing");
assert(/href="\.\.\/menu\.html"/.test(html), "Safe full-menu exit is missing");
assert(/src="app-v2\.js\?v=[a-f0-9]{12}"/.test(html), "Smart Choice app revision is not synchronized");
assert(/href="style\.css\?v=[a-f0-9]{12}"/.test(html), "Smart Choice stylesheet revision is not synchronized");
assert(!/<script(?![^>]*src=)[^>]*>\s*[^<]/i.test(html), "Inline executable script is not allowed");
assert(!/<style\b/i.test(html), "Inline styles are not allowed");
assert(!/unsafe-inline/.test(html), "CSP must not allow unsafe-inline");

assert(source.includes('from "@robys/order"'), "Page source must import the shared Recommendation Engine");
assert(source.includes("recommendSmartChoice"), "Page source must call recommendSmartChoice");
assert(source.includes("sessionStorage"), "Session-scoped recovery is missing");
assert(source.includes("window.addEventListener(\"popstate\""), "Browser back-button handler is missing");
assert(source.includes("const questions: readonly QuestionDefinition[]"), "Question flow must be configuration-driven");
assert((source.match(/\n\s*id: "(?:intent|temperature|taste|partySize|budgetKey)"/g) ?? []).length === 5, "Expected exactly five configured questions");
assert(!source.includes("innerHTML"), "Page must not write untrusted HTML");
assert(!source.includes("insertAdjacentHTML"), "Page must not insert raw HTML");
assert(!source.includes("fetch("), "MVP flow must not depend on network requests");
assert(!source.includes("Math.random"), "Flow must remain deterministic");
assert(!source.includes(".style."), "Strict CSP forbids runtime inline style writes");
assert(source.includes("heading.tabIndex = -1"), "Rendered headings must receive programmatic focus");
for (const breakfastPromise of [
  "İçecek veya doyurucu eşlikçi",
  "A drink or a satisfying bite",
  "Напиток или сытное дополнение"
]) {
  assert(source.includes(breakfastPromise), `Breakfast copy must allow a single-item recommendation: ${breakfastPromise}`);
}
for (const staleBreakfastPromise of [
  "İçecek ve doyurucu eşlikçi",
  "Drink and a satisfying bite",
  "Напиток и сытное дополнение"
]) {
  assert(!source.includes(staleBreakfastPromise), `Breakfast copy must not promise a two-item pairing: ${staleBreakfastPromise}`);
}

assert(css.includes(":focus-visible"), "Visible keyboard focus styling is missing");
assert(css.includes("prefers-reduced-motion"), "Reduced-motion support is missing");
assert(css.includes("min-width: 320px"), "Narrow-mobile floor is missing");
assert(!/width:\s*\d{4,}px/.test(css), "Suspicious fixed desktop width may cause horizontal scrolling");

assert(bundle.length > 5_000, "Generated Smart Choice bundle is unexpectedly small");
assert(!bundle.includes("sourceMappingURL"), "Production bundle must not expose a source map URL");
assert(homepageEnhancements.includes('link.href = "smart-choice/"'), "Homepage Smart Choice CTA is missing");
assert(homepageEnhancements.includes("data.smartChoiceEntry") || homepageEnhancements.includes("dataset.smartChoiceEntry"), "Homepage CTA needs an idempotency marker");

console.log(
  `✅ SMART-CHOICE-PAGE passed: direct page, five configured questions, engine integration, ` +
  `session recovery, browser-back contract, accessibility and safe menu fallback verified.`
);
