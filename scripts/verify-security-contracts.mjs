import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const RUNTIME_FILES = [
  "index.html",
  "menu.html",
  "bootstrap.js",
  "app.js",
  "conversion.js",
  "analytics.js",
  "qa.js",
  "menu-page.js",
  "menu-search-clear.js",
  "menu-ready.js",
  "menu-bootstrap.js",
  "android-download.js",
  "pwa.js",
  "sw.js",
  "src/app.ts"
];
const HTML_FILES = ["index.html", "menu.html"];
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const report = { generatedAt: new Date().toISOString(), checks: [], failures: [] };

function record(id, condition, message) {
  report.checks.push({ id, passed: Boolean(condition), message });
  if (!condition) report.failures.push({ id, message });
}

function must(id, condition, message) {
  record(id, condition, message);
}

function read(file) {
  must("SEC-001", existsSync(file), `Required security input is missing: ${file}`);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function attribute(tag, name) {
  const doubleQuoted = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1];
  if (doubleQuoted !== undefined) return doubleQuoted;
  return tag.match(new RegExp(`\\b${name}='([^']*)'`, "i"))?.[1] ?? "";
}

const runtime = RUNTIME_FILES.map((file) => ({ file, content: read(file) }));
const dangerousPatterns = [
  [/\.innerHTML\s*=/, "innerHTML assignment"],
  [/\.outerHTML\s*=/, "outerHTML assignment"],
  [/insertAdjacentHTML\s*\(/, "insertAdjacentHTML"],
  [/document\.write(?:ln)?\s*\(/, "document.write"],
  [/(^|[^\w])eval\s*\(/, "eval"],
  [/new\s+Function\s*\(/, "new Function"],
  [/set(?:Timeout|Interval)\s*\(\s*["'`]/, "string timer"],
  [/javascript\s*:/i, "javascript URL"]
];

for (const { file, content } of runtime) {
  for (const [pattern, label] of dangerousPatterns) {
    must("SEC-001", !pattern.test(content), `${file} contains forbidden ${label}`);
  }
}

const indexSource = read("src/app.ts");
must("SEC-001", indexSource.includes("appendSafeRichText"), "Safe rich-text renderer is missing");
must("SEC-001", indexSource.includes("document.createTextNode"), "Rich translations must append text nodes");
must("SEC-001", indexSource.includes("document.createElement(\"em\")"), "Rich translations must construct emphasis with DOM APIs");
must("SEC-001", !indexSource.includes("data-i18n-html"), "Legacy HTML translation attribute remains in source");
must("SEC-001", !read("index.html").includes("data-i18n-html"), "Legacy HTML translation attribute remains in HTML");

const requiredCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self'",
  "frame-src https://maps.google.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "worker-src 'self'",
  "upgrade-insecure-requests",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'"
];

for (const file of HTML_FILES) {
  const html = read(file);
  const cspTag = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0] ?? "";
  const csp = attribute(cspTag, "content");
  must("CSP-001", Boolean(csp), `${file} has no Content Security Policy`);
  for (const directive of requiredCsp) must("CSP-001", csp.includes(directive), `${file} CSP is missing ${directive}`);
  must("CSP-001", !csp.includes("'unsafe-inline'"), `${file} CSP allows unsafe-inline`);
  must("CSP-001", !csp.includes("'unsafe-eval'"), `${file} CSP allows unsafe-eval`);
  must("CSP-001", !/(?:^|\s)\*(?:\s|;|$)/.test(csp), `${file} CSP contains a wildcard source`);
  must("CSP-001", /<meta\b[^>]*name=["']referrer["'][^>]*content=["']strict-origin-when-cross-origin["']/i.test(html), `${file} referrer policy is missing`);

  const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
  for (const script of scripts) {
    const attrs = script[1];
    const executableInline = !/\bsrc=["']/i.test(attrs) && !/\btype=["']application\/ld\+json["']/i.test(attrs);
    must("CSP-001", !executableInline, `${file} contains an executable inline script`);
  }
  must("CSP-001", !/\sstyle=["']/i.test(html), `${file} contains an inline style attribute`);
  must("CSP-001", /<script\b[^>]*src=["']bootstrap\.js/i.test(html), `${file} does not load the external bootstrap`);

  const blankLinks = Array.from(html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi), (match) => match[0]);
  for (const link of blankLinks) {
    const rel = attribute(link, "rel");
    must("SEC-001", /\bnoopener\b/i.test(rel) && /\bnoreferrer\b/i.test(rel), `${file} has an unsafe target=_blank link`);
  }

  const eventHandlers = Array.from(html.matchAll(/\son[a-z]+\s*=/gi));
  must("SEC-001", eventHandlers.length === 0, `${file} contains inline event handlers`);
}

const serviceWorker = read("sw.js");
const pwaRuntime = read("pwa.js");
must("CSP-001", pwaRuntime.includes('navigator.serviceWorker.register'), "Offline runtime must register a service worker explicitly");
must("CSP-001", pwaRuntime.includes('{ scope: "./" }'), "Service worker scope must stay local to the site");
must("CSP-001", !/https?:\/\//i.test(serviceWorker), "Service worker cache must not include cross-origin assets");
must("CSP-001", serviceWorker.includes('url.origin !== self.location.origin'), "Service worker must ignore cross-origin fetches");

const iframe = read("index.html").match(/<iframe\b[^>]*>/i)?.[0] ?? "";
must("SEC-001", /src=["']https:\/\/maps\.google\.com\/maps/i.test(iframe), "Map iframe origin is outside the allowlist");
must("SEC-001", /title=["'][^"']+["']/i.test(iframe), "Map iframe is missing a title");
must("SEC-001", /referrerpolicy=["'][^"']+["']/i.test(iframe), "Map iframe is missing a referrer policy");
must("SEC-001", /loading=["']lazy["']/i.test(iframe), "Map iframe must remain lazy-loaded");

for (const { file, content } of runtime) {
  for (const match of content.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*["']([^"']+)["']/g)) {
    must("PRIVACY-001", match[1] === "robys-language", `${file} accesses an unapproved storage key: ${match[1]}`);
  }
}

for (const required of [
  ".github/workflows/security.yml",
  ".github/workflows/codeql.yml",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
  "SECURITY.md",
  "docs/threat-model.md",
  "scripts/scan-secrets.mjs"
]) must("CI-TRUST-001", existsSync(required), `Security control is missing: ${required}`);

const securityWorkflow = read(".github/workflows/security.yml");
must("CI-TRUST-001", /permissions:\s*\n\s*contents:\s*read/i.test(securityWorkflow), "Security workflow does not use read-only contents permission");
must("DEPSEC-001", securityWorkflow.includes("npm audit --audit-level=high"), "High-severity dependency audit is not blocking CI");
must("SECRET-001", securityWorkflow.includes("scan-secrets.mjs") || securityWorkflow.includes("npm run verify:security"), "Secret scanner is not wired into CI");

const codeql = read(".github/workflows/codeql.yml");
must("SAST-001", codeql.includes("javascript-typescript"), "CodeQL does not analyze JavaScript/TypeScript");
must("SAST-001", codeql.includes("security-events: write"), "CodeQL cannot publish security findings");

must("DEPSEC-001", packageJson.scripts?.["security:audit"] === "npm audit --audit-level=high", "security:audit package script changed");
must("SEC-001", packageJson.scripts?.["verify:security"] === "node scripts/verify-security-contracts.mjs && node scripts/scan-secrets.mjs", "verify:security package script changed");

for (const id of ["SEC-001", "CSP-001", "DEPSEC-001", "SECRET-001", "SAST-001", "CI-TRUST-001", "PRIVACY-001"]) {
  const contract = dashboard.contracts?.find((item) => item.id === id);
  must(id, contract?.status === "gated", `${id} is missing or disabled in the regression dashboard`);
  must(id, contract?.owner === "Security + QA", `${id} owner changed`);
  must(id, Array.isArray(contract?.assertions) && contract.assertions.length >= 5, `${id} assertions are incomplete`);
}

mkdirSync(".artifacts", { recursive: true });
writeFileSync(path.join(".artifacts", "security-contract-report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (report.failures.length) {
  for (const failure of report.failures) console.error(`❌ [${failure.id}] ${failure.message}`);
  throw new Error(`Security contracts failed: ${report.failures.length} violation(s)`);
}

console.log(`✅ Security contracts passed: ${report.checks.length} checks.`);
