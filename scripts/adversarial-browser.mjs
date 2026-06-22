import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.ADVERSARIAL_PORT ?? 4177);
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const report = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, checks: [], failures: [], networkOrigins: [] };
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
let browser;
let fatalError;

function check(id, condition, message, evidence = null) {
  const item = { id, passed: Boolean(condition), message, evidence };
  report.checks.push(item);
  if (!condition) report.failures.push(item);
}

async function waitForServer(attempts = 40) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    serviceWorkers: "block",
    bypassCSP: false
  });

  await context.addInitScript(() => {
    window.__mythosViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      window.__mythosViolations.push({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition
      });
    });
  });

  const networkOrigins = new Set();
  let recordBaselineNetwork = true;
  context.on("request", (request) => {
    if (!recordBaselineNetwork) return;
    try { networkOrigins.add(new URL(request.url()).origin); } catch { /* browser-internal URL */ }
  });
  await context.route("https://maps.google.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>embedded map</title>"
  }));

  const landing = await context.newPage();
  await landing.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await landing.locator("#hero-title").waitFor({ state: "visible" });

  const menu = await context.newPage();
  await menu.goto(new URL("menu.html", BASE_URL).href, { waitUntil: "domcontentloaded" });
  await menu.locator("#menu-root .full-menu-item").first().waitFor({ state: "visible", timeout: 15000 });
  recordBaselineNetwork = false;

  const observedOrigins = [...networkOrigins].sort();
  report.networkOrigins = observedOrigins;
  const allowedOrigins = new Set([new URL(BASE_URL).origin, "https://maps.google.com"]);
  check("ADV-001", observedOrigins.every((origin) => allowedOrigins.has(origin)), "Page-load network stays inside the explicit origin allowlist", observedOrigins);

  const richTree = await landing.locator("[data-i18n-rich]").evaluateAll((nodes) => nodes.map((node) => ({
    key: node.getAttribute("data-i18n-rich"),
    tags: Array.from(node.querySelectorAll("*")).map((child) => child.tagName)
  })));
  check("ADV-001", richTree.length >= 4, "All safe rich-text headings are present", richTree);
  check("ADV-001", richTree.every((entry) => entry.tags.every((tag) => tag === "BR" || tag === "EM")), "Rich translations contain only BR and EM descendants", richTree);

  const trustedTypesProbe = await landing.evaluate(() => {
    const target = document.querySelector("#hero-title");
    try {
      target.innerHTML = "<svg data-mythos-probe=\"true\"></svg>";
      return { threw: false, injected: Boolean(target.querySelector("[data-mythos-probe]")) };
    } catch (error) {
      return { threw: true, name: error?.name, injected: Boolean(target.querySelector("[data-mythos-probe]")) };
    }
  });
  check("ADV-001", trustedTypesProbe.threw && !trustedTypesProbe.injected, "Trusted Types blocks direct markup injection", trustedTypesProbe);

  const inlineProbe = await landing.evaluate(() => {
    window.__mythosInline = 0;
    try {
      const script = document.createElement("script");
      script.textContent = ["window", ".__mythosInline", "=1"].join("");
      document.head.append(script);
      return { threw: false, executed: window.__mythosInline === 1 };
    } catch (error) {
      return { threw: true, name: error?.name, executed: window.__mythosInline === 1 };
    }
  });
  await landing.waitForTimeout(100);
  check("ADV-001", !inlineProbe.executed, "Inline script probe did not execute", inlineProbe);

  const externalProbe = await landing.evaluate(() => {
    window.__mythosExternal = 0;
    try {
      const script = document.createElement("script");
      script.src = "https://example.invalid/mythos-probe.js";
      script.onload = () => { window.__mythosExternal = 1; };
      document.head.append(script);
      return { threw: false, executed: window.__mythosExternal === 1 };
    } catch (error) {
      return { threw: true, name: error?.name, executed: window.__mythosExternal === 1 };
    }
  });
  await landing.waitForTimeout(150);
  check("ADV-001", !await landing.evaluate(() => window.__mythosExternal === 1), "External script outside the CSP allowlist did not execute", externalProbe);

  const violations = await landing.evaluate(() => window.__mythosViolations ?? []);
  check("ADV-001", violations.some((item) =>
    item.disposition === "enforce" && ["script-src", "script-src-elem", "require-trusted-types-for"].includes(item.directive)
  ), "Browser emitted an enforcing script or Trusted Types violation", violations);

  await landing.evaluate((value) => localStorage.setItem("robys-language", value), "<svg data-storage-probe=\"true\"></svg>");
  await landing.reload({ waitUntil: "domcontentloaded" });
  await landing.locator("#hero-title").waitFor({ state: "visible" });
  const storageResult = await landing.evaluate(() => ({
    lang: document.documentElement.lang,
    injected: Boolean(document.querySelector("[data-storage-probe]")),
    keys: Object.keys(localStorage)
  }));
  check("ADV-001", storageResult.lang === "tr" && !storageResult.injected, "Untrusted stored language value falls back safely", storageResult);
  check("PRIVACY-001", storageResult.keys.every((key) => key === "robys-language"), "Only the approved storage key exists", storageResult.keys);

  const searchPayload = "<svg data-search-probe=\"true\"></svg>";
  await menu.locator("#menu-search").fill(searchPayload);
  const searchResult = await menu.evaluate(() => ({
    injected: Boolean(document.querySelector("[data-search-probe]")),
    value: document.querySelector("#menu-search")?.value
  }));
  check("ADV-001", !searchResult.injected && searchResult.value === searchPayload, "Markup-like menu search remains inert text", searchResult);

  const hashPayload = encodeURIComponent("<svg data-hash-probe=\"true\"></svg>");
  await menu.goto(`${new URL("menu.html", BASE_URL).href}#${hashPayload}`, { waitUntil: "domcontentloaded" });
  const hashResult = await menu.evaluate(() => ({
    injected: Boolean(document.querySelector("[data-hash-probe]")),
    hash: location.hash
  }));
  check("ADV-001", !hashResult.injected, "Markup-like URL fragment does not become DOM", hashResult);

  if (report.failures.length) {
    report.failures.forEach((failure) => console.error(`❌ [${failure.id}] ${failure.message}`));
    throw new Error(`Adversarial browser checks failed: ${report.failures.length}`);
  }
  console.log(`✅ ADV-001 passed: ${report.checks.length} adversarial browser checks.`);
} catch (error) {
  fatalError = error;
  if (!report.failures.length) report.failures.push({
    id: "ADV-001",
    passed: false,
    message: "Browser probe runtime failed",
    evidence: String(error?.stack ?? error)
  });
} finally {
  mkdirSync(".artifacts", { recursive: true });
  writeFileSync(".artifacts/adversarial-browser-report.json", `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
  server.kill("SIGTERM");
}

if (fatalError) throw fatalError;
