import { chromium, devices } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [targetName = "exact-head", baseArg = "http://127.0.0.1:4173/"] = process.argv.slice(2);
const baseUrl = new URL(baseArg.endsWith("/") ? baseArg : `${baseArg}/`);
const outDir = resolve("qa-results", "deep-manual", targetName);
mkdirSync(outDir, { recursive: true });

const pages = [
  { id: "HOME", path: "" },
  { id: "MENU", path: "menu.html" },
  { id: "DISCOVER", path: "discover.html" },
  { id: "SMART", path: "smart-choice/" },
  { id: "SIM", path: "smart-choice/simulator.html" }
];

const profiles = [
  { id: "desktop", options: { viewport: { width: 1440, height: 1000 }, locale: "tr-TR", acceptDownloads: true } },
  { id: "mobile", options: { ...devices["Pixel 7"], locale: "tr-TR", acceptDownloads: true } }
];

const nodes = [];
const edges = [];
const findings = [];
const checks = [];
let sequence = 0;

function id(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function finding(severity, title, detail, evidence = {}) {
  sequence += 1;
  findings.push({ id: `INTERACTION-${String(sequence).padStart(3, "0")}`, severity, title, detail, evidence });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installStubs(context) {
  await context.addInitScript(() => {
    window.__qaEffects = [];
    const record = (type, payload = {}) => window.__qaEffects.push({ type, payload });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (payload) => record("share", payload) });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => record("clipboard", { text }) } });
    window.prompt = (message, value) => { record("prompt", { message, value }); return null; };
    window.open = (url, target, features) => { record("window-open", { url, target, features }); return null; };
  });
}

async function goto(page, pathOrUrl) {
  const url = /^https?:/i.test(pathOrUrl) ? pathOrUrl : new URL(pathOrUrl, baseUrl).href;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (response) assert(response.status() < 400, `${url} returned HTTP ${response.status()}`);
  await page.waitForTimeout(250);
}

async function snapshot(page, pageId, profileId, downloads) {
  const data = await page.evaluate(() => ({
    url: location.href,
    lang: document.documentElement.lang,
    title: document.title,
    heading: [...document.querySelectorAll("h1,h2,h3")].find((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    })?.textContent?.trim() ?? "",
    body: document.body.innerText.replace(/\s+/g, " ").slice(0, 1200),
    effects: window.__qaEffects ?? [],
    expanded: [...document.querySelectorAll("[aria-expanded]")].map((element) => [element.getAttribute("aria-label") || element.textContent?.trim() || element.id, element.getAttribute("aria-expanded")]),
    pressed: [...document.querySelectorAll("[aria-pressed]")].map((element) => [element.textContent?.trim() || element.id, element.getAttribute("aria-pressed")]),
    disabled: [...document.querySelectorAll("button:disabled,input:disabled,select:disabled")].map((element) => element.id || element.textContent?.trim() || element.getAttribute("name") || "disabled"),
    localStorage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
    sessionStorage: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]))
  }));
  const node = { id: id({ pageId, profileId, data, downloads }), pageId, profileId, downloads, ...data };
  if (!nodes.some((entry) => entry.id === node.id)) nodes.push(node);
  return node;
}

async function inventoryButtons(browser, pageDef, profile) {
  const seedContext = await browser.newContext(profile.options);
  await installStubs(seedContext);
  const seedPage = await seedContext.newPage();
  await goto(seedPage, pageDef.path);
  const inventory = await seedPage.locator("button:visible").evaluateAll((buttons) => buttons.map((button, index) => ({
    index,
    text: (button.getAttribute("aria-label") || button.textContent || "").trim().replace(/\s+/g, " "),
    disabled: button.disabled,
    pressed: button.getAttribute("aria-pressed"),
    lang: button.getAttribute("data-lang")
  })));
  await seedContext.close();

  for (const meta of inventory) {
    const context = await browser.newContext(profile.options);
    await installStubs(context);
    const page = await context.newPage();
    let downloads = 0;
    page.on("download", () => { downloads += 1; });
    try {
      await goto(page, pageDef.path);
      const button = page.locator("button:visible").nth(meta.index);
      if (!(await button.isVisible().catch(() => false))) continue;
      const actualDisabled = await button.isDisabled();
      const before = await snapshot(page, pageDef.id, profile.id, downloads);
      if (!actualDisabled) {
        await button.click({ timeout: 8_000, noWaitAfter: true });
        await page.waitForTimeout(400);
      }
      const after = await snapshot(page, pageDef.id, profile.id, downloads);
      const changed = before.id !== after.id;
      const expectedNoOp = actualDisabled || meta.pressed === "true" || (meta.lang && meta.lang === before.lang);
      edges.push({ from: before.id, to: after.id, action: `button:${meta.text}`, page: pageDef.id, profile: profile.id, disabled: actualDisabled, changed });
      checks.push({ page: pageDef.id, profile: profile.id, type: "button", label: meta.text, disabled: actualDisabled, changed });
      if (!changed && !expectedNoOp) finding("P2", "Enabled button produced no observable transition", `${pageDef.id}/${profile.id}: ${meta.text}`, { index: meta.index });
    } catch (error) {
      finding("P2", "Button interaction failed", `${pageDef.id}/${profile.id}: ${meta.text}: ${error instanceof Error ? error.message : String(error)}`, { index: meta.index });
    } finally {
      await context.close();
    }
  }
}

async function validateLinks(browser, pageDef, profile) {
  const context = await browser.newContext(profile.options);
  const page = await context.newPage();
  await goto(page, pageDef.path);
  const links = await page.locator("a[href]:visible").evaluateAll((elements) => elements.map((element) => ({
    text: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " "),
    href: element.href,
    target: element.target,
    rel: element.rel
  })));

  for (const link of links) {
    const url = new URL(link.href);
    if (url.origin !== baseUrl.origin) {
      if (url.protocol !== "https:") finding("P1", "External link is not HTTPS", link.href, { page: pageDef.id, profile: profile.id, text: link.text });
      if (link.target === "_blank" && !(link.rel.includes("noopener") && link.rel.includes("noreferrer"))) finding("P2", "External new-tab link lacks rel protection", link.href, { page: pageDef.id, profile: profile.id, text: link.text, rel: link.rel });
      continue;
    }

    const response = await context.request.get(url.href.split("#")[0], { failOnStatusCode: false });
    checks.push({ page: pageDef.id, profile: profile.id, type: "link", label: link.text, href: link.href, status: response.status() });
    if (response.status() >= 400) finding("P1", "Internal link returned an error", `${response.status()} ${link.href}`, { page: pageDef.id, profile: profile.id, text: link.text });
    if (url.hash) {
      await goto(page, url.href);
      const targetId = decodeURIComponent(url.hash.slice(1));
      const hasTarget = await page.evaluate((value) => Boolean(document.getElementById(value)), targetId);
      if (!hasTarget) finding("P2", "Fragment destination does not exist", link.href, { page: pageDef.id, profile: profile.id, text: link.text });
    }
  }
  await context.close();
}

async function pricingInvariant() {
  const { menuCategories } = await import(new URL("../../menu-data.js", import.meta.url));
  const allItems = menuCategories.flatMap((category) => category.items ?? category.groups.flatMap((group) => group.items));
  const pairings = menuCategories.find((category) => category.id === "pairing-offers")?.items ?? [];
  const byEnglish = (name) => allItems.find((item) => item.name?.en === name);
  const definitions = [
    { id: "cool-lime-macaron-pairing", parts: ["Cool Lime", "Macaron"] },
    { id: "iced-san-sebastian-pairing", parts: ["Iced Caffè Latte", "San Sebastian Cheesecake"] }
  ];
  for (const definition of definitions) {
    const pairing = pairings.find((entry) => entry.id === definition.id);
    const parts = definition.parts.map(byEnglish);
    assert(pairing && parts.every(Boolean), `Pricing source missing for ${definition.id}`);
    const total = parts.reduce((sum, entry) => sum + entry.price, 0);
    if (pairing.price !== total) finding("P1", "Pairing price differs from visible component total", `${definition.id}: ${pairing.price} ₺ versus ${total} ₺; delta ${pairing.price - total} ₺`, { pricingMode: pairing.pricingMode, parts: definition.parts });
  }
}

await pricingInvariant();
const browser = await chromium.launch({ headless: true });
for (const profile of profiles) {
  for (const pageDef of pages) {
    await inventoryButtons(browser, pageDef, profile);
    await validateLinks(browser, pageDef, profile);
  }
}
await browser.close();

const summary = {
  targetName,
  baseUrl: baseUrl.href,
  executedAt: new Date().toISOString(),
  pages: pages.length,
  profiles: profiles.length,
  controlsChecked: checks.filter((entry) => entry.type === "button").length,
  linksChecked: checks.filter((entry) => entry.type === "link").length,
  graph: { nodes: nodes.length, edges: edges.length },
  findings: Object.fromEntries(["P0", "P1", "P2", "P3"].map((severity) => [severity, findings.filter((entry) => entry.severity === severity).length]))
};
writeFileSync(resolve(outDir, "interaction-report.json"), JSON.stringify({ summary, findings, checks, graph: { nodes, edges } }, null, 2));
writeFileSync(resolve(outDir, "interaction-graph.json"), JSON.stringify({ nodes, edges }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (findings.some((entry) => ["P0", "P1", "P2"].includes(entry.severity))) process.exitCode = 1;
