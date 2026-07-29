import { chromium, firefox, devices } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [targetName = "exact-head", baseArg = "http://127.0.0.1:4173/"] = process.argv.slice(2);
const rootUrl = new URL(baseArg.endsWith("/") ? baseArg : `${baseArg}/`);
const output = resolve("qa-results", "deep-manual", targetName);
mkdirSync(output, { recursive: true });

const isPublished = targetName === "published";
const findings = [];
const cases = [];
const graph = { nodes: [], edges: [] };
let findingSequence = 0;

const surfaces = [
  { id: "HOME", path: "" },
  { id: "MENU", path: "menu.html" },
  { id: "DISCOVER", path: "discover.html" },
  { id: "SMART", path: "smart-choice/" },
  { id: "SIM", path: "smart-choice/simulator.html" }
];

const profiles = [
  { id: "chromium-desktop", engine: chromium, options: { viewport: { width: 1440, height: 1000 }, locale: "tr-TR" }, interactive: true },
  { id: "chromium-mobile", engine: chromium, options: { ...devices["Pixel 7"], locale: "tr-TR" }, interactive: true },
  { id: "firefox-desktop", engine: firefox, options: { viewport: { width: 1440, height: 1000 }, locale: "tr-TR" }, interactive: false },
  { id: "firefox-mobile", engine: firefox, options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "tr-TR" }, interactive: false }
];

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function addFinding(severity, category, title, detail, evidence = {}) {
  findingSequence += 1;
  findings.push({ id: `ROBYS-${String(findingSequence).padStart(3, "0")}`, severity, category, title, detail, evidence });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(id, title, body) {
  const start = Date.now();
  try {
    await body();
    cases.push({ id, title, status: "PASS", durationMs: Date.now() - start });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cases.push({ id, title, status: "FAIL", durationMs: Date.now() - start, error: message });
    addFinding("P2", "case", title, message, { caseId: id });
    console.error(`FAIL ${id} ${title}: ${message}`);
  }
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

async function go(page, pathOrUrl) {
  const url = /^https?:/i.test(pathOrUrl) ? pathOrUrl : new URL(pathOrUrl, rootUrl).href;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  assert(response, `No response for ${url}`);
  assert(response.status() < 400, `${url} returned HTTP ${response.status()}`);
  await page.waitForTimeout(180);
  return response;
}

async function state(page, surface, profile) {
  const value = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const heading = [...document.querySelectorAll("h1,h2,h3")].find(visible)?.textContent?.trim() ?? "";
    const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,[role='button']")]
      .filter(visible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id || "",
        text: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 120),
        href: element instanceof HTMLAnchorElement ? element.href : "",
        pressed: element.getAttribute("aria-pressed"),
        expanded: element.getAttribute("aria-expanded"),
        disabled: "disabled" in element ? Boolean(element.disabled) : false
      }));
    return {
      url: location.href,
      route: location.pathname + location.search + location.hash,
      lang: document.documentElement.lang,
      title: document.title,
      heading,
      controls,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 900),
      effects: window.__qaEffects ?? [],
      localStorage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
      sessionStorage: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]))
    };
  });
  const node = { id: digest({ surface, profile, value }), surface, profile, ...value };
  if (!graph.nodes.some((entry) => entry.id === node.id)) graph.nodes.push(node);
  return node;
}

function edge(before, after, action, meta = {}) {
  graph.edges.push({ from: before.id, to: after.id, action, changed: before.id !== after.id, ...meta });
}

async function shot(page, name) {
  const file = resolve(output, `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function staticAudit(browser, profile, surface) {
  const context = await browser.newContext(profile.options);
  await installStubs(context);
  const page = await context.newPage();
  const runtime = { console: [], page: [], response: [], request: [] };
  page.on("console", (message) => { if (message.type() === "error") runtime.console.push(message.text()); });
  page.on("pageerror", (error) => runtime.page.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(rootUrl.origin) && response.status() >= 400) runtime.response.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(rootUrl.origin)) runtime.request.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });

  await go(page, surface.path);
  const screenshot = await shot(page, `${profile.id}-${surface.id}`);
  const audit = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const name = (element) => {
      const aria = element.getAttribute("aria-label");
      if (aria) return aria.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) return labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return label.textContent?.trim() ?? "";
      }
      return (element.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || "").trim();
    };
    const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,[role='button']")].filter(visible);
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const viewport = window.innerWidth;
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      unnamed: controls.map((element, index) => ({ index, tag: element.tagName, id: element.id, name: name(element) })).filter((entry) => !entry.name),
      missingAlt: [...document.images].filter(visible).filter((image) => !image.alt).map((image) => image.currentSrc || image.src),
      duplicateIds,
      badTokens: document.body.innerText.match(/undefined|null|\[object Object\]|lorem ipsum|�/gi) ?? [],
      overflow: width - viewport,
      smallTargets: viewport <= 430 ? controls.map((element) => {
        const box = element.getBoundingClientRect();
        return { name: name(element), tag: element.tagName, width: Math.round(box.width), height: Math.round(box.height) };
      }).filter((entry) => !["INPUT", "SELECT", "TEXTAREA"].includes(entry.tag) && (entry.width < 40 || entry.height < 40)) : [],
      links: [...document.querySelectorAll("a[href]")].filter(visible).map((link) => ({ text: name(link), href: link.href, target: link.target, rel: link.rel }))
    };
  });

  if (audit.unnamed.length) addFinding("P2", "accessibility", `${surface.id}: unnamed visible controls`, JSON.stringify(audit.unnamed), { profile: profile.id, screenshot });
  if (audit.missingAlt.length) addFinding("P3", "accessibility", `${surface.id}: visible images missing alt`, JSON.stringify(audit.missingAlt), { profile: profile.id, screenshot });
  if (audit.duplicateIds.length) addFinding("P2", "markup", `${surface.id}: duplicate IDs`, audit.duplicateIds.join(", "), { profile: profile.id });
  if (audit.badTokens.length) addFinding("P1", "copy", `${surface.id}: unresolved implementation tokens`, audit.badTokens.join(", "), { profile: profile.id, screenshot });
  if (audit.overflow > 1) addFinding("P2", "responsive", `${surface.id}: horizontal overflow`, `${audit.overflow}px`, { profile: profile.id, screenshot });
  if (audit.smallTargets.length) addFinding("P3", "mobile-ux", `${surface.id}: touch targets below 40px`, JSON.stringify(audit.smallTargets.slice(0, 25)), { profile: profile.id, screenshot });
  if (Object.values(runtime).some((list) => list.length)) addFinding("P2", "runtime", `${surface.id}: browser/runtime failures`, JSON.stringify(runtime), { profile: profile.id, screenshot });

  for (const link of audit.links) {
    const url = new URL(link.href);
    if (url.origin !== rootUrl.origin && url.protocol !== "https:") addFinding("P1", "security", `${surface.id}: non-HTTPS external link`, link.href, { profile: profile.id, text: link.text });
    if (url.origin !== rootUrl.origin && link.target === "_blank" && !(link.rel.includes("noopener") && link.rel.includes("noreferrer"))) {
      addFinding("P2", "security", `${surface.id}: new-tab link lacks noopener/noreferrer`, link.href, { profile: profile.id, text: link.text, rel: link.rel });
    }
  }

  await state(page, surface.id, profile.id);
  await context.close();
}

async function auditLinks(browser, profile, surface) {
  const context = await browser.newContext(profile.options);
  const page = await context.newPage();
  await go(page, surface.path);
  const links = await page.locator("a[href]:visible").evaluateAll((elements) => elements.map((element) => ({
    text: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " "),
    href: element.href,
    target: element.target
  })));

  for (const link of links) {
    const url = new URL(link.href);
    if (url.origin !== rootUrl.origin || link.target === "_blank") continue;
    const response = await context.request.get(url.href.split("#")[0], { failOnStatusCode: false });
    if (response.status() >= 400) addFinding("P1", "navigation", `${surface.id}: broken internal link`, `${response.status()} ${link.href}`, { profile: profile.id, text: link.text });
    if (url.hash) {
      await go(page, url.href);
      const hash = decodeURIComponent(url.hash.slice(1));
      const valid = await page.evaluate((id) => {
        const target = document.getElementById(id);
        const activeChip = [...document.querySelectorAll(".menu-category-chip")].some((chip) => chip.getAttribute("aria-pressed") === "true" && document.getElementById(id));
        return Boolean(target || activeChip);
      }, hash);
      if (!valid) addFinding("P2", "navigation", `${surface.id}: fragment destination missing`, link.href, { profile: profile.id, text: link.text });
    }
  }
  await context.close();
}

async function clickInitialButtons(browser, profile, surface) {
  const seed = await browser.newContext(profile.options);
  await installStubs(seed);
  const seedPage = await seed.newPage();
  await go(seedPage, surface.path);
  const buttons = await seedPage.locator("button:visible").evaluateAll((elements) => elements.map((element, index) => ({
    index,
    text: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " "),
    disabled: element.disabled,
    pressed: element.getAttribute("aria-pressed"),
    lang: element.getAttribute("data-lang")
  })));
  await seed.close();

  for (const meta of buttons) {
    if (meta.disabled) continue;
    const context = await browser.newContext(profile.options);
    await installStubs(context);
    const page = await context.newPage();
    try {
      await go(page, surface.path);
      const locator = page.locator("button:visible").nth(meta.index);
      if (!(await locator.isVisible().catch(() => false))) continue;
      const before = await state(page, surface.id, profile.id);
      await locator.click({ timeout: 8_000 });
      await page.waitForTimeout(300);
      const after = await state(page, surface.id, profile.id);
      edge(before, after, `button:${meta.text}`, { surface: surface.id, profile: profile.id });
      const effect = after.effects.length > before.effects.length;
      const allowedNoOp = meta.pressed === "true" || (meta.lang && meta.lang === before.lang);
      if (before.id === after.id && !effect && !allowedNoOp) addFinding("P2", "interaction", `${surface.id}: button has no observable effect`, meta.text || `button ${meta.index + 1}`, { profile: profile.id });
    } catch (error) {
      addFinding("P2", "interaction", `${surface.id}: button click failed`, error instanceof Error ? error.message : String(error), { profile: profile.id, text: meta.text });
    } finally {
      await context.close();
    }
  }
}

async function homeBusiness(browser, profile) {
  await runCase(`${profile.id}-HOME-COPY`, "Home language and CTA destination semantics", async () => {
    const context = await browser.newContext(profile.options);
    const page = await context.newPage();
    await go(page, "");
    for (const lang of ["tr", "en", "ru"]) {
      await page.locator(`button[data-lang="${lang}"]`).click();
      assert(await page.locator("html").getAttribute("lang") === lang, `Home did not switch to ${lang}`);
      if (profile.id.includes("mobile")) {
        const toggle = page.locator(".menu-toggle");
        const label = await toggle.getAttribute("aria-label");
        const expected = lang === "tr" ? /menü/i : lang === "en" ? /menu/i : /меню/i;
        if (!expected.test(label ?? "")) addFinding("P2", "localisation", "Mobile menu accessible label stays in the wrong language", `lang=${lang}, aria-label=${label}`, { profile: profile.id });
      }
      const featuredLabels = await page.locator(".featured-card:visible").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? ""));
      if (lang === "ru" && featuredLabels.some((label) => /Turkish lira/i.test(label))) addFinding("P3", "localisation", "Featured-card accessible names remain English in Russian UI", JSON.stringify(featuredLabels), { profile: profile.id });
    }

    if (profile.id.includes("mobile")) {
      await page.locator('.lang-button[data-lang="ru"]').click();
      const toggle = page.locator(".menu-toggle");
      await toggle.click();
      assert(await toggle.getAttribute("aria-expanded") === "true", "Mobile menu did not open");
      await page.keyboard.press("Escape");
      if (await toggle.getAttribute("aria-expanded") !== "false") addFinding("P2", "accessibility", "Mobile navigation does not close on Escape", "aria-expanded remained true", { profile: profile.id });
    }

    const pairingHref = await page.locator('.hero-actions a[href*="pairing-offers"]').getAttribute("href");
    assert(pairingHref?.includes("pairing-offers"), "Today's pairing CTA is missing");
    addFinding("P2", "business-copy", "“Today's pairing” CTA opens a static list of two pairings", `Destination: ${pairingHref}`, { profile: profile.id });

    const teaCard = page.locator('a.menu-card[href*="brew-hot"]');
    const teaText = (await teaCard.innerText()).replace(/\s+/g, " ");
    if (/herbal|bitki|травян/i.test(teaText)) addFinding("P2", "navigation", "Tea card promises herbal tea but opens the brewed-hot category", teaText, { profile: profile.id, href: await teaCard.getAttribute("href") });
    await context.close();
  });
}

async function menuBusiness(browser, profile) {
  await runCase(`${profile.id}-MENU-BUSINESS`, "Menu languages, categories, search, share and price invariants", async () => {
    const context = await browser.newContext(profile.options);
    await installStubs(context);
    const page = await context.newPage();
    await go(page, "menu.html");
    const priceSets = [];
    for (const lang of ["tr", "en", "ru"]) {
      await page.locator(`button[data-lang="${lang}"]`).click();
      assert(await page.locator("html").getAttribute("lang") === lang, `Menu did not switch to ${lang}`);
      const prices = await page.locator(".full-menu-price").allTextContents();
      assert(prices.length > 20, `Too few menu prices in ${lang}`);
      assert(prices.every((value) => /^\s*\d[\d\s.,]*\s*₺\s*$/.test(value)), `Malformed menu price in ${lang}`);
      priceSets.push(prices.map((value) => value.replace(/\s/g, "")));
      const chips = page.locator(".menu-category-chip");
      const count = await chips.count();
      for (let index = 0; index < count; index += 1) {
        await chips.nth(index).click();
        assert(await chips.nth(index).getAttribute("aria-pressed") === "true", `Category ${index} did not activate`);
        assert(await page.locator(".full-menu-panel").count() > 0, `Category ${index} rendered no products`);
      }
      await chips.first().click();
    }
    assert(JSON.stringify(priceSets[0]) === JSON.stringify(priceSets[1]) && JSON.stringify(priceSets[1]) === JSON.stringify(priceSets[2]), "Price/order differs across languages");

    const categoryQueries = [
      ["tr", "Sıcak Kahveler"],
      ["en", "Hot Coffee"],
      ["ru", "Горячий кофе"]
    ];
    for (const [lang, query] of categoryQueries) {
      await page.locator(`button[data-lang="${lang}"]`).click();
      await page.locator("#menu-search").fill(query);
      if (await page.locator("#menu-empty").isVisible()) addFinding("P2", "search", "Menu category-name search returns no results", `${lang}: ${query}`, { profile: profile.id });
      await page.locator("#menu-search").fill("");
    }

    await page.locator("#menu-search").fill("zzzz-no-product");
    assert(await page.locator("#menu-empty").isVisible(), "No-results state is missing");
    await page.locator("#menu-search").fill("");
    await page.locator("#menu-share-button").click();
    const effects = await page.evaluate(() => window.__qaEffects ?? []);
    const share = effects.find((entry) => entry.type === "share");
    assert(share, "Share button did not invoke Web Share");
    assert(String(share.payload?.url ?? "").includes("menu.html"), "Share payload has the wrong URL");
    await context.close();
  });
}

async function discoverBusiness(browser, profile) {
  await runCase(`${profile.id}-DISCOVER-BUSINESS`, "Taste Journey rotation, persistence and weather race", async () => {
    const context = await browser.newContext(profile.options);
    let weatherResolve;
    await context.route("https://api.open-meteo.com/**", async (route) => {
      await new Promise((resolvePromise) => { weatherResolve = resolvePromise; });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ current: { temperature_2m: 31, precipitation: 0, weather_code: 0 } }) });
    });
    const page = await context.newPage();
    await go(page, "discover.html");
    await page.locator("#pairing-name").waitFor({ state: "visible", timeout: 10_000 });
    const first = (await page.locator("#pairing-name").innerText()).trim();
    await page.locator("#next-pairing").click();
    const second = (await page.locator("#pairing-name").innerText()).trim();
    assert(first && second && first !== second, "Another pairing did not change the pairing");
    await page.locator("#next-pairing").click();
    assert((await page.locator("#pairing-name").innerText()).trim() === first, "Pairing rotation did not cycle");
    weatherResolve?.();
    await page.waitForTimeout(300);
    const weather = (await page.locator("#weather-context").innerText()).trim();
    if (/unavailable|недоступ|kullanılam|○/i.test(weather)) addFinding("P2", "causality", "Early pairing interaction discards the weather result", weather, { profile: profile.id });

    for (const lang of ["ru", "en", "tr"]) {
      await page.locator(`button[data-lang="${lang}"]`).click();
      assert(await page.locator("html").getAttribute("lang") === lang, `Discover did not switch to ${lang}`);
    }

    const stepBefore = await page.locator("#relationship-step").innerText();
    await page.locator("#mark-discovered").click();
    assert(await page.locator("#mark-discovered").isDisabled(), "Marked pairing did not become disabled");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#pairing-name").waitFor({ state: "visible" });
    assert(await page.locator("#mark-discovered").isDisabled(), "Discovered state did not survive reload");
    const stepAfter = await page.locator("#relationship-step").innerText();
    assert(stepAfter === stepBefore, "Same-day reload unexpectedly changed relationship stage");
    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    assert(storageKeys.every((key) => !/email|phone|name|fingerprint|precise-location/i.test(key)), `Personal-data-like storage key: ${storageKeys.join(", ")}`);
    addFinding("P3", "business-copy", "Taste Journey says one pairing per visit but exposes an immediate “another pairing” action", "The current visit can cycle multiple pairings.", { profile: profile.id });
    addFinding("P3", "business-model", "Relationship visits are counted once per calendar day, not per visit", "Multiple same-day visits remain one visit.", { profile: profile.id });
    await context.close();
  });
}

async function smartStart(page) {
  await go(page, "smart-choice/");
  await page.locator('button[data-lang="ru"]').click();
  await page.getByRole("button", { name: "Начать выбор", exact: true }).click();
  await page.waitForTimeout(100);
}

async function selectSmart(page, answer) {
  const option = page.locator("#smart-choice-app button:visible").filter({ hasText: answer }).first();
  await option.click();
  const next = page.getByRole("button", { name: "Продолжить", exact: true });
  if (await next.isVisible().catch(() => false)) await next.click();
  await page.waitForTimeout(100);
}

const smartPaths = [
  ["Кофе", "Холодное", "Сладкое", "Один", "До 400 ₺"],
  ["Завтрак", "Горячее", "Нейтральное", "Двое", "До 600 ₺"],
  ["Освежиться", "Холодное", "Без разницы", "Семья", "До 250 ₺"],
  ["Десерт", "Без разницы", "Сладкое", "Один", "Гибкий"],
  ["Перекус", "Без разницы", "Нейтральное", "Семья", "До 400 ₺"]
];

async function smartBusiness(browser, profile) {
  await runCase(`${profile.id}-SMART-BUSINESS`, "Smart Choice edge coverage, trust, history and persistence", async () => {
    const context = await browser.newContext(profile.options);
    const page = await context.newPage();
    for (const path of smartPaths) {
      await smartStart(page);
      let previous = await state(page, "SMART", profile.id);
      for (const answer of path) {
        await selectSmart(page, answer);
        const next = await state(page, "SMART", profile.id);
        edge(previous, next, `answer:${answer}`, { surface: "SMART", profile: profile.id });
        previous = next;
      }
      const resultText = await page.locator("#smart-choice-app").innerText();
      assert(/₺/.test(resultText), `No TRY price for path ${path.join(" > ")}`);
      assert(!/заказ подтвержд[её]н|оплата (прошла|принята)|order confirmed|payment accepted/i.test(resultText), "False order/payment confirmation");
      const choose = page.getByRole("button", { name: "Выбрать", exact: true }).first();
      if (await choose.isVisible().catch(() => false)) {
        await choose.click();
        assert(/Заказ ещё не отправлен|Заказ не отправляется/i.test(await page.locator("#smart-choice-app").innerText()), "Selected state lost no-order boundary");
      }
    }

    await smartStart(page);
    await selectSmart(page, "Кофе");
    await selectSmart(page, "Холодное");
    const beforeReload = (await page.locator("#smart-choice-app h1, #smart-choice-app h2").first().innerText()).trim();
    await page.reload({ waitUntil: "domcontentloaded" });
    const afterReload = (await page.locator("#smart-choice-app h1, #smart-choice-app h2").first().innerText()).trim();
    assert(beforeReload === afterReload, "Current Smart Choice question did not survive reload");
    assert(await page.locator("html").getAttribute("lang") === "ru", "Smart Choice language did not survive reload");
    await page.goBack();
    assert(/Горячее или холодное|Чего хочется/.test(await page.locator("#smart-choice-app").innerText()), "Browser Back did not restore a prior question");
    await context.close();

    const noJs = await browser.newContext({ ...profile.options, javaScriptEnabled: false });
    const noJsPage = await noJs.newPage();
    await go(noJsPage, "smart-choice/");
    assert((await noJsPage.locator("body").innerText()).includes("Smart Choice için JavaScript gerekir"), "No-JavaScript fallback missing");
    assert(await noJsPage.getByRole("link", { name: "Tam menüyü aç", exact: true }).isVisible(), "No-JavaScript full-menu escape missing");
    await noJs.close();
  });
}

async function simulatorBusiness(browser, profile) {
  await runCase(`${profile.id}-SIM-BUSINESS`, "Revenue simulator arithmetic, validation, exports and network boundary", async () => {
    const context = await browser.newContext({ ...profile.options, acceptDownloads: true });
    const page = await context.newPage();
    const dataRequests = [];
    page.on("request", (request) => { if (["xhr", "fetch"].includes(request.resourceType())) dataRequests.push(request.url()); });
    await go(page, "smart-choice/simulator.html");
    assert(await page.locator("#export-simulation-json").isDisabled(), "JSON export is enabled before calculation");
    assert(await page.locator("#export-simulation-markdown").isDisabled(), "Markdown export is enabled before calculation");
    await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
    const text = (await page.locator("#revenue-simulator-results").innerText()).replace(/[\u00a0\u202f]/g, " ");
    for (const expected of ["3 600 000", "600 000", "2 000", "360"]) assert(text.includes(expected), `Simulator misses ${expected}`);
    assert(/conservative/i.test(text) && /expected/i.test(text) && /stretch/i.test(text), "Scenario tiers missing");
    assert(dataRequests.length === 0, `Simulator sent data requests: ${dataRequests.join(", ")}`);

    const jsonDownload = page.waitForEvent("download");
    await page.locator("#export-simulation-json").click();
    await (await jsonDownload).saveAs(resolve(output, `${profile.id}-simulation.json`));
    const markdownDownload = page.waitForEvent("download");
    await page.locator("#export-simulation-markdown").click();
    await (await markdownDownload).saveAs(resolve(output, `${profile.id}-simulation.md`));

    await page.locator('[name="currency"]').selectOption("RUB");
    await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
    assert(/₽|RUB/.test(await page.locator("#revenue-simulator-results").innerText()), "RUB output is not formatted as RUB");
    await page.locator('[name="monthlyOrders"]').fill("0");
    assert(!(await page.locator("#revenue-simulator-form").evaluate((form) => form.checkValidity())), "Zero monthly orders passed validation");
    await page.locator('[name="monthlyOrders"]').fill("10000");
    await page.locator('[name="averageOrderValue"]').fill("300");
    await page.locator('[name="averageCogs"]').fill("500");
    await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
    assert(/марж|себестоим|guardrail|отриц/i.test(await page.locator("#revenue-simulator-results").innerText()), "COGS above AOV produced no warning");
    await context.close();
  });
}

async function sourceBusinessInvariants() {
  if (isPublished) return;
  await runCase("SOURCE-PRICING", "Pairing prices versus visible component prices", async () => {
    const { menuCategories } = await import(new URL("../../menu-data.js", import.meta.url));
    const allItems = menuCategories.flatMap((category) => category.items ?? category.groups.flatMap((group) => group.items));
    const pairings = menuCategories.find((category) => category.id === "pairing-offers")?.items ?? [];
    const find = (englishName) => allItems.find((item) => item.name?.en === englishName);
    const checks = [
      { pairingId: "cool-lime-macaron-pairing", parts: ["Cool Lime", "Macaron"] },
      { pairingId: "iced-san-sebastian-pairing", parts: ["Iced Caffè Latte", "San Sebastian Cheesecake"] }
    ];
    for (const check of checks) {
      const pairing = pairings.find((item) => item.id === check.pairingId);
      assert(pairing, `Pairing missing: ${check.pairingId}`);
      const parts = check.parts.map(find);
      assert(parts.every(Boolean), `Component missing for ${check.pairingId}`);
      const componentTotal = parts.reduce((sum, item) => sum + item.price, 0);
      if (pairing.price !== componentTotal) {
        addFinding("P1", "pricing", "Pairing price differs from the sum of visible components without an explanation", `${check.pairingId}: pairing ${pairing.price} ₺, components ${componentTotal} ₺, delta ${pairing.price - componentTotal} ₺`, { pricingMode: pairing.pricingMode, parts: check.parts });
      }
    }
  });
}

await sourceBusinessInvariants();

for (const profile of profiles) {
  const browser = await profile.engine.launch({ headless: true });
  for (const surface of surfaces) {
    await runCase(`${profile.id}-${surface.id}-STATIC`, `${surface.id} text, controls, layout and runtime`, () => staticAudit(browser, profile, surface));
    if (profile.interactive && !isPublished) {
      await auditLinks(browser, profile, surface);
      await clickInitialButtons(browser, profile, surface);
    }
  }
  if (profile.interactive) {
    await homeBusiness(browser, profile);
    await menuBusiness(browser, profile);
    await discoverBusiness(browser, profile);
    await smartBusiness(browser, profile);
    await simulatorBusiness(browser, profile);
  }
  await browser.close();
}

const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
findings.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity] || left.id.localeCompare(right.id));
const summary = {
  targetName,
  baseUrl: rootUrl.href,
  executedAt: new Date().toISOString(),
  cases: { total: cases.length, passed: cases.filter((entry) => entry.status === "PASS").length, failed: cases.filter((entry) => entry.status === "FAIL").length },
  graph: { nodes: graph.nodes.length, edges: graph.edges.length },
  findings: Object.fromEntries(["P0", "P1", "P2", "P3"].map((severity) => [severity, findings.filter((entry) => entry.severity === severity).length]))
};

writeFileSync(resolve(output, "report.json"), JSON.stringify({ summary, cases, findings, graph }, null, 2));
writeFileSync(resolve(output, "graph.json"), JSON.stringify(graph, null, 2));

function markdownCell(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\r?\n/g, "<br>");
}

const report = [
  `# Roby's deep manual graph audit — ${markdownCell(targetName)}`,
  "",
  `- Base URL: ${markdownCell(rootUrl.href)}`,
  `- Executed: ${markdownCell(summary.executedAt)}`,
  `- Cases: ${summary.cases.passed}/${summary.cases.total} passed`,
  `- Graph: ${summary.graph.nodes} states, ${summary.graph.edges} transitions`,
  `- Findings: P0 ${summary.findings.P0} · P1 ${summary.findings.P1} · P2 ${summary.findings.P2} · P3 ${summary.findings.P3}`,
  "",
  "## Findings",
  "",
  "| ID | Severity | Category | Finding | Detail |",
  "|---|---:|---|---|---|",
  ...findings.map((entry) => `| ${markdownCell(entry.id)} | ${markdownCell(entry.severity)} | ${markdownCell(entry.category)} | ${markdownCell(entry.title)} | ${markdownCell(entry.detail)} |`),
  "",
  "## Cases",
  "",
  "| ID | Result | Scenario | Error |",
  "|---|---:|---|---|",
  ...cases.map((entry) => `| ${markdownCell(entry.id)} | ${markdownCell(entry.status)} | ${markdownCell(entry.title)} | ${markdownCell(entry.error ?? "—")} |`)
].join("\n");
writeFileSync(resolve(output, "report.md"), report);
console.log(JSON.stringify(summary, null, 2));

if (findings.some((entry) => ["P0", "P1", "P2"].includes(entry.severity)) || cases.some((entry) => entry.status === "FAIL")) process.exitCode = 1;
