import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const size = (file) => statSync(path.join(root, file)).size;

const html = read("smart-choice/index.html");
const baseCss = read("smart-choice/style.css");
const releaseCss = read("smart-choice/release-qa.css");
const packageJson = JSON.parse(read("package.json"));
const pageSource = read("src/smart-choice/page.ts");
const cartSource = read("src/smart-choice/cart.ts");
const releaseRuntime = read("src/smart-choice/release-qa.ts");
const releaseDomain = read("src/smart-choice/release-qa-domain.ts");

function requireText(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message ?? `Missing required text: ${needle}`);
}

function collectTsFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...collectTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) output.push(full);
  }
  return output;
}

function propertyName(property) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

const localeErrors = [];
for (const file of collectTsFiles(path.join(root, "src", "smart-choice"))) {
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set(node.properties.map(propertyName).filter(Boolean));
      const localeCount = ["tr", "en", "ru"].filter((locale) => names.has(locale)).length;
      if (localeCount > 0 && localeCount < 3) {
        const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        localeErrors.push(`${path.relative(root, file)}:${line} has an incomplete TR/EN/RU object`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
assert.deepEqual(localeErrors, [], `Incomplete locale objects:\n${localeErrors.join("\n")}`);

requireText(html, 'id="smart-choice-status"', "polite status live region is required");
requireText(html, 'role="status"', "status region role is required");
requireText(html, 'aria-live="polite"', "polite announcements are required");
requireText(html, 'id="smart-choice-alert"', "assertive fallback region is required");
requireText(html, 'role="alert"', "alert role is required");
requireText(html, 'aria-live="assertive"', "fatal errors must be announced assertively");
requireText(html, 'href="../menu.html"', "safe full-menu fallback is required");
requireText(html, 'class="skip-link"', "skip link is required");
assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(html), "inline scripts are forbidden");
assert.ok(!/style\s*=/i.test(html), "inline styles are forbidden");
assert.ok(!/tabindex\s*=\s*["']?[1-9]/i.test(html), "positive tabindex is forbidden");

const releaseIndex = html.indexOf("release-qa.js");
const appIndex = html.indexOf("app.js");
const analyticsIndex = html.indexOf("analytics.js");
assert.ok(releaseIndex >= 0 && releaseIndex < appIndex, "release QA runtime must load before the app");
assert.ok(appIndex >= 0 && appIndex < analyticsIndex, "app must load before analytics");

requireText(baseCss, "overflow-x: hidden", "320px layout must suppress horizontal document overflow");
requireText(baseCss, "@media (prefers-reduced-motion: reduce)", "reduced motion support is required");
requireText(releaseCss, "@media (max-width: 360px)", "narrow mobile hardening is required");
requireText(releaseCss, "overflow-wrap: anywhere", "long TR/RU strings must wrap safely");
requireText(releaseCss, ".visually-hidden", "screen-reader-only utility is required");

requireText(pageSource, "sessionStorage", "session restore support is required");
requireText(pageSource, "window.history", "browser back/deep-link support is required");
requireText(pageSource, "focus", "focus management is required");
requireText(pageSource + cartSource + releaseDomain, 'currency: "TRY"', "TRY formatting must use Intl currency semantics");
requireText(releaseRuntime, 'window.addEventListener("offline"', "offline fallback is required");
requireText(releaseRuntime, 'window.addEventListener("unhandledrejection"', "fatal promise fallback is required");
requireText(releaseRuntime, "MutationObserver", "dynamic price/live-region updates are required");
requireText(releaseRuntime, "textContent", "release messages must use safe text rendering");
assert.ok(!releaseRuntime.includes("innerHTML"), "release runtime must not use innerHTML");

assert.ok(packageJson.scripts["verify:smart-choice"], "verify:smart-choice script is required");
assert.ok(packageJson.scripts["test:smart-choice"], "test:smart-choice script is required");
requireText(packageJson.scripts.check, "verify:smart-choice", "npm run check must include verify:smart-choice");
requireText(packageJson.scripts.check, "test:smart-choice", "npm run check must include test:smart-choice");

const jsFiles = [
  "smart-choice/app.js",
  "smart-choice/cart.js",
  "smart-choice/experiments.js",
  "smart-choice/analytics.js",
  "smart-choice/decision-trace.js",
  "smart-choice/release-qa.js"
];
const cssFiles = [
  "smart-choice/style.css",
  "smart-choice/cart.css",
  "smart-choice/decision-trace.css",
  "smart-choice/release-qa.css"
];
const totalJs = jsFiles.reduce((sum, file) => sum + size(file), 0);
const totalCss = cssFiles.reduce((sum, file) => sum + size(file), 0);
for (const file of jsFiles) {
  assert.ok(size(file) <= 90_000, `${file} exceeds the 90 KB per-bundle pilot budget`);
}
assert.ok(totalJs <= 300_000, `Smart Choice JS total ${totalJs} exceeds the 300 KB pilot budget`);
assert.ok(totalCss <= 100_000, `Smart Choice CSS total ${totalCss} exceeds the 100 KB pilot budget`);
assert.ok(size("smart-choice/index.html") <= 30_000, "Smart Choice HTML exceeds the 30 KB pilot budget");

console.log(
  `[SMART-CHOICE-RELEASE] verified locales, TRY, a11y, fallback, navigation, 320px and budgets: ` +
  `${totalJs} B JS / ${totalCss} B CSS`
);
