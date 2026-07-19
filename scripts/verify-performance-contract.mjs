import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  ACTIVE_HERO_PATH,
  MAX_FILE_BYTES,
  attributeValue,
  fileReference,
} from "./media-contract-config.mjs";

const ROOT = process.cwd();
const budgets = JSON.parse(readFileSync("lighthouse/budgets.json", "utf8"));
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const mobileConfig = readFileSync("lighthouse/lighthouserc.mobile.cjs", "utf8");
const desktopConfig = readFileSync("lighthouse/lighthouserc.desktop.cjs", "utf8");
const pages = ["index.html", "menu.html"];

function assert(condition, message) {
  if (!condition) throw new Error(`[PERF-001] ${message}`);
}

function repositoryFile(reference, label = "Asset reference") {
  assert(typeof reference === "string" && reference.length > 0, `${label} is missing`);
  assert(!path.isAbsolute(reference) && !/^(?:[a-z]:[\\/]|[\\/])/i.test(reference), `${label} must be repository-relative: ${reference}`);
  const clean = fileReference(reference, label);
  const fullPath = path.resolve(ROOT, clean);
  const relativePath = path.relative(ROOT, fullPath);
  assert(
    relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath),
    `${label} escaped repository: ${reference}`,
  );
  return { clean, fullPath };
}

function tagAttributeReferences(html, tagName, attributeName, { predicate } = {}) {
  return Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi")), (match) => match[0])
    .filter((tag) => !predicate || predicate(tag))
    .map((tag) => attributeValue(tag, attributeName))
    .filter((reference) => reference !== null && !/^(?:https?:|data:|\/\/)/i.test(reference))
    .map((reference) => repositoryFile(reference, `${tagName}.${attributeName}`).clean);
}

function localReferences(html, tagName, attributeName) {
  return tagAttributeReferences(html, tagName, attributeName);
}

function bytes(file) {
  return statSync(repositoryFile(file).fullPath).size;
}

function expectRepositoryEscapeRejected(reference) {
  let rejected = false;
  try {
    repositoryFile(reference, "negative fixture");
  } catch (error) {
    rejected = String(error?.message ?? error).includes("[PERF-001]");
  }
  assert(rejected, `Repository escape fixture was accepted: ${reference}`);
}

function unique(values) {
  return [...new Set(values)];
}

expectRepositoryEscapeRejected("/etc/hosts");
expectRepositoryEscapeRejected("../outside.css");
expectRepositoryEscapeRejected("C:\\Windows\\system.ini");

assert(budgets.config_version === 2, "Performance budget version must remain 2");
assert(budgets.mobile.performance >= 0.85, "Mobile performance score floor is below 0.85");
assert(budgets.mobile.lcp <= 2500, "Mobile LCP budget exceeds 2500 ms");
assert(budgets.mobile.tbt <= 200, "Mobile TBT budget exceeds 200 ms");
assert(budgets.mobile.cls <= 0.1, "Mobile CLS budget exceeds 0.1");
assert(budgets.desktop.performance >= 0.95, "Desktop performance score floor is below 0.95");
assert(budgets.desktop.lcp <= 1500, "Desktop LCP budget exceeds 1500 ms");
assert(budgets.desktop.tbt <= 100, "Desktop TBT budget exceeds 100 ms");
assert(budgets.desktop.cls <= 0.05, "Desktop CLS budget exceeds 0.05");
assert(budgets.mobile.hero_file_bytes === MAX_FILE_BYTES, `Mobile hero budget drifted from ${MAX_FILE_BYTES}`);
assert(budgets.desktop.hero_file_bytes === MAX_FILE_BYTES, `Desktop hero budget drifted from ${MAX_FILE_BYTES}`);

for (const config of [mobileConfig, desktopConfig]) {
  assert(config.includes("http://localhost/index.html"), "Lighthouse must audit the landing page");
  assert(config.includes("http://localhost/menu.html"), "Lighthouse must audit the full menu page");
  for (const metric of [
    "categories:performance",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "first-contentful-paint",
    "speed-index",
  ]) {
    assert(config.includes(metric), `Lighthouse assertion is missing: ${metric}`);
  }
}

const htmlDocuments = pages.map((file) => ({ file, html: readFileSync(file, "utf8") }));
const scripts = unique(htmlDocuments.flatMap(({ html }) => localReferences(html, "script", "src")));
const stylesheets = unique(
  htmlDocuments.flatMap(({ html }) =>
    tagAttributeReferences(html, "link", "href", {
      predicate: (tag) => (attributeValue(tag, "rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .includes("stylesheet"),
    })
  )
);

const scriptSizes = scripts.map((file) => ({ file, size: bytes(file) }));
const totalJsBytes = scriptSizes.reduce((sum, item) => sum + item.size, 0);
const largestJs = scriptSizes.reduce((largest, item) => item.size > largest.size ? item : largest, { file: "", size: 0 });
const totalCssBytes = stylesheets.reduce((sum, file) => sum + bytes(file), 0);
const totalHtmlBytes = pages.reduce((sum, file) => sum + bytes(file), 0);
const heroBytes = bytes(ACTIVE_HERO_PATH);
const posterBytes = bytes("src/robys-hero-poster.jpg");
const hard = budgets.mobile;

assert(totalJsBytes <= hard.total_js_bytes, `Total referenced JS is ${totalJsBytes} bytes; limit ${hard.total_js_bytes}`);
assert(largestJs.size <= hard.largest_js_file_bytes, `Largest JS file ${largestJs.file} is ${largestJs.size} bytes; limit ${hard.largest_js_file_bytes}`);
assert(totalCssBytes <= hard.total_css_bytes, `Total referenced CSS is ${totalCssBytes} bytes; limit ${hard.total_css_bytes}`);
assert(totalHtmlBytes <= hard.total_html_bytes, `Total HTML is ${totalHtmlBytes} bytes; limit ${hard.total_html_bytes}`);
assert(heroBytes <= hard.hero_file_bytes, `Active hero ${ACTIVE_HERO_PATH} is ${heroBytes} bytes; limit ${hard.hero_file_bytes}`);
assert(posterBytes <= hard.poster_file_bytes, `Hero poster is ${posterBytes} bytes; limit ${hard.poster_file_bytes}`);

const contract = dashboard.contracts?.find((item) => item.id === "PERF-001");
assert(contract, "PERF-001 is missing from the regression dashboard");
assert(contract.status === "gated", "Dashboard status must remain gated");
assert(contract.severity === "P0", "Dashboard severity must remain P0");
assert(contract.owner === "QA", "Dashboard owner must remain QA");
assert(contract.evidence === "CI Lighthouse + byte budgets", "Dashboard evidence changed");
assert(contract.devices?.includes("mobile") && contract.devices?.includes("desktop"), "Dashboard device coverage is incomplete");
assert(Array.isArray(contract.assertions) && contract.assertions.length >= 8, "Dashboard assertions are incomplete");

console.log(JSON.stringify({
  totalJsBytes,
  largestJs,
  totalCssBytes,
  totalHtmlBytes,
  activeHero: ACTIVE_HERO_PATH,
  heroBytes,
  heroBudgetBytes: hard.hero_file_bytes,
  posterBytes,
  auditedPages: pages,
}, null, 2));
console.log("✅ PERF-001 passed: Core Web Vitals and static asset budgets are protected.");
