import { chromium, firefox, devices } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [targetName = "exact-head", baseArg = "http://127.0.0.1:4173/"] = process.argv.slice(2);
const baseUrl = new URL(baseArg.endsWith("/") ? baseArg : `${baseArg}/`);
const outDir = resolve("qa-results", "deep-manual", targetName);
mkdirSync(outDir, { recursive: true });

const findings = [];
const cases = [];
const graph = { nodes: [], edges: [] };
let findingCounter = 0;

const surfaces = [
  { id: "HOME", path: "" },
  { id: "MENU", path: "menu.html" },
  { id: "DISCOVER", path: "discover.html" },
  { id: "SMART", path: "smart-choice/" },
  { id: "SIM", path: "smart-choice/simulator.html" }
];

const profiles = [
  { id: "chromium-desktop", engine: chromium, context: { viewport: { width: 1440, height: 1000 }, locale: "tr-TR" }, deep: true },
  { id: "chromium-mobile", engine: chromium, context: { ...devices["Pixel 7"], locale: "tr-TR" }, deep: true },
  { id: "firefox-desktop", engine: firefox, context: { viewport: { width: 1440, height: 1000 }, locale: "tr-TR" }, deep: false },
  { id: "firefox-mobile", engine: firefox, context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "tr-TR" }, deep: false }
];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function finding(severity, category, title, detail, evidence = {}) {
  findingCounter += 1;
  findings.push({ id: `ROBYS-${String(findingCounter).padStart(3, "0")}`, severity, category, title, detail, evidence });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(id, title, body) {
  const started = Date.now();
  try {
    await body();
    cases.push({ id, title, status: "PASS", durationMs: Date.now() - started });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    cases.push({ id, title, status: "FAIL", durationMs: Date.now() - started, error: detail });
    finding("P2", "test-case", title, detail, { caseId: id });
    console.error(`FAIL ${id} ${title}: ${detail}`);
  }
}

async function goto(page, path) {
  const url = new URL(path, baseUrl).href;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  assert(response, `No response for ${url}`);
  assert(response.status() < 400, `${url} returned ${response.status()}`);
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  return response;
}

async function installEffectStubs(context) {
  await context.addInitScript(() => {
    window.__qaEffects = [];
    const record = (type, payload = {}) => window.__qaEffects.push({ type, payload });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (payload) => record("share", payload) });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => record("clipboard", { text }) } });
    window.prompt = (message, value) => { record("prompt", { message, value }); return null; };
    window.open = (url, target, features) => { record("window-open", { url, target, features }); return null; };
    window.addEventListener("beforeunload", () => record("beforeunload"));
  });
}

async function snapshot(page, surface, profile) {
  const state = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    };
    const heading = [...document.querySelectorAll("h1,h2,h3")].find(visible)?.textContent?.trim() ?? "";
    const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,[role='button']")]
      .filter(visible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 140),
        id: element.id || "",
        href: element instanceof HTMLAnchorElement ? element.href : "",
        pressed: element.getAttribute("aria-pressed"),
        expanded: element.getAttribute("aria-expanded"),
        disabled: "disabled" in element ? Boolean(element.disabled) : false
      }));
    return {
      url: location.href,
      path: location.pathname + location.search + location.hash,
      lang: document.documentElement.lang,
      title: document.title,
      heading,
      controls,
      bodySample: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
      focus: document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 80) || "",
      effects: window.__qaEffects ?? [],
      storage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]))
    };
  });
  const node = { id: hash({ surface, profile, state }), surface, profile, ...state };
  if (!graph.nodes.some((item) => item.id === node.id)) graph.nodes.push(node);
  return node;
}

async function capture(page, name) {
  const file = resolve(outDir, `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function inspectStaticSurface(page, surface, profile) {
  const errors = { console: [], page: [], responses: [], requests: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(baseUrl.origin) && response.status() >= 400) errors.responses.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(baseUrl.origin)) errors.requests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });

  await goto(page, surface.path);
  const shot = await capture(page, `${profile.id}-${surface.id}-initial`);
  const audit = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    };
    const labelFor = (element) => {
      const aria = element.getAttribute("aria-label");
      if (aria) return aria.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) return labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return label.textContent?.trim() ?? "";
      }
      if (element instanceof HTMLImageElement) return element.alt.trim();
      return (element.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || "").trim();
    };
    const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,[role='button']")].filter(visible);
    const images = [...document.images].filter(visible);
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const viewport = window.innerWidth;
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      controlCount: controls.length,
      unnamedControls: controls.map((element, index) => ({ index, tag: element.tagName, id: element.id, label: labelFor(element) })).filter((item) => !item.label),
      imagesWithoutAlt: images.map((image) => ({ src: image.currentSrc || image.src, alt: image.alt })).filter((item) => !item.alt),
      duplicateIds: [...new Set(duplicateIds)],
      badText: document.body.innerText.match(/undefined|null|\[object Object\]|lorem ipsum|�/gi) ?? [],
      overflow: width - viewport,
      links: [...document.querySelectorAll("a[href]")].filter(visible).map((link) => ({
        text: labelFor(link), href: link.href, target: link.target, rel: link.rel
      })),
      mobileSmallTargets: window.innerWidth <= 430 ? controls.map((element) => {
        const box = element.getBoundingClientRect();
        return { label: labelFor(element), tag: element.tagName, width: box.width, height: box.height };
      }).filter((item) => item.tag !== "INPUT" && item.tag !== "SELECT" && (item.width < 40 || item.height < 40)) : []
    };
  });

  if (audit.unnamedControls.length) finding("P2", "accessibility", `${surface.id}: controls without accessible names`, JSON.stringify(audit.unnamedControls), { profile: profile.id, screenshot: shot });
  if (audit.imagesWithoutAlt.length) finding("P3", "accessibility", `${surface.id}: visible images without alt text`, JSON.stringify(audit.imagesWithoutAlt), { profile: profile.id, screenshot: shot });
  if (audit.duplicateIds.length) finding("P2", "markup", `${surface.id}: duplicate element IDs`, audit.duplicateIds.join(", "), { profile: profile.id });
  if (audit.badText.length) finding("P1", "copy", `${surface.id}: unresolved implementation text visible`, audit.badText.join(", "), { profile: profile.id, screenshot: shot });
  if (audit.overflow > 1) finding("P2", "responsive", `${surface.id}: horizontal overflow`, `${audit.overflow}px beyond viewport`, { profile: profile.id, screenshot: shot });
  if (audit.mobileSmallTargets.length) finding("P3", "mobile-ux", `${surface.id}: touch targets below 40px`, JSON.stringify(audit.mobileSmallTargets.slice(0, 20)), { profile: profile.id, screenshot: shot });

  for (const link of audit.links) {
    const parsed = new URL(link.href);
    const external = parsed.origin !== baseUrl.origin;
    if (external && parsed.protocol !== "https:") finding("P1", "security", `${surface.id}: external link is not HTTPS`, link.href, { profile: profile.id, text: link.text });
    if (external && link.target === "_blank" && !(link.rel.includes("noopener") && link.rel.includes("noreferrer"))) {
      finding("P2", "security", `${surface.id}: external new-tab link lacks rel protection`, link.href, { profile: profile.id, text: link.text, rel: link.rel });
    }
  }

  await page.waitForTimeout(500);
  if (errors.page.length || errors.responses.length || errors.requests.length || errors.console.length) {
    finding("P2", "runtime", `${surface.id}: browser/runtime errors`, JSON.stringify(errors), { profile: profile.id, screenshot: shot });
  }
  return { audit, initial: await snapshot(page, surface.id, profile.id) };
}

async function clickInitialButtons(browser, surface, profile) {
  const seedContext = await browser.newContext(profile.context);
  await installEffectStubs(seedContext);
  const seedPage = await seedContext.newPage();
  await goto(seedPage, surface.path);
  const count = await seedPage.locator("button:visible").count();
  await seedContext.close();

  for (let index = 0; index < count; index += 1) {
    const context = await browser.newContext(profile.context);
    await installEffectStubs(context);
    const page = await context.newPage();
    try {
      await goto(page, surface.path);
      const buttons = page.locator("button:visible");
      if (index >= await buttons.count()) continue;
      const button = buttons.nth(index);
      const meta = await button.evaluate((element) => ({
        text: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " "),
        id: element.id,
        disabled: element.disabled,
        pressed: element.getAttribute("aria-pressed"),
        lang: element.getAttribute("data-lang")
      }));
      if (meta.disabled) continue;
      const before = await snapshot(page, surface.id, profile.id);
      await button.click({ timeout: 10_000 });
      await page.waitForTimeout(650);
      const after = await snapshot(page, surface.id, profile.id);
      const changed = before.id !== after.id;
      const hasEffect = after.effects.length > before.effects.length;
      graph.edges.push({ from: before.id, to: after.id, surface: surface.id, profile: profile.id, action: `button:${meta.text}`, changed, effects: after.effects });
      const activeNoOp = meta.pressed === "true" || (meta.lang && meta.lang === before.lang);
      if (!changed && !hasEffect && !activeNoOp) {
        finding("P2", "interaction", `${surface.id}: button produced no observable effect`, meta.text || meta.id || `button ${index + 1}`, { profile: profile.id, index });
      }
    } catch (error) {
      finding("P2", "interaction", `${surface.id}: button click failed`, error instanceof Error ? error.message : String(error), { profile: profile.id, index });
    } finally {
      await context.close();
    }
  }
}

async function auditInternalLinks(browser, surface, profile) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  await goto(page, surface.path);
  const links = await page.locator("a[href]:visible").evaluateAll((elements) => elements.map((link, index) => ({ index, text: (link.getAttribute("aria-label") || link.textContent || "").trim(), href: link.href, target: link.target })));
  await context.close();

  for (const link of links) {
    const url = new URL(link.href);
    if (url.origin !== baseUrl.origin || link.target === "_blank") continue;
    const testContext = await browser.newContext(profile.context);
    const testPage = await testContext.newPage();
    try {
      await goto(testPage, surface.path);
      const locator = testPage.locator("a[href]:visible").nth(link.index);
      const before = await snapshot(testPage, surface.id, profile.id);
      const responsePromise = testPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8_000 }).catch(() => null);
      await locator.click();
      const response = await responsePromise;
      await testPage.waitForTimeout(300);
      const after = await snapshot(testPage, surface.id, profile.id);
      graph.edges.push({ from: before.id, to: after.id, surface: surface.id, profile: profile.id, action: `link:${link.text}`, href: link.href });
      if (response && response.status() >= 400) finding("P1", "navigation", `${surface.id}: internal link returned ${response.status()}`, link.href, { profile: profile.id, text: link.text });
      if (link.href.includes("#") && before.focus === after.focus && before.path === after.path) finding("P3", "accessibility", `${surface.id}: fragment link did not move focus or location`, link.href, { profile: profile.id, text: link.text });
    } catch (error) {
      finding("P2", "navigation", `${surface.id}: internal link failed`, error instanceof Error ? error.message : String(error), { profile: profile.id, href: link.href, text: link.text });
    } finally {
      await testContext.close();
    }
  }
}

async function auditMenu(browser, profile) {
  await runCase(`${profile.id}-MENU-LANG`, "Menu language, catalog and price invariants", async () => {
    const context = await browser.newContext(profile.context);
    await installEffectStubs(context);
    const page = await context.newPage();
    await goto(page, "menu.html");
    const priceSets = [];
    for (const lang of ["tr", "en", "ru"]) {
      await page.locator(`button[data-lang="${lang}"]`).click();
      await page.waitForTimeout(150);
      assert(await page.locator("html").getAttribute("lang") === lang, `Menu did not switch to ${lang}`);
      const prices = await page.locator(".full-menu-price").allTextContents();
      assert(prices.length > 10, `Too few menu prices in ${lang}: ${prices.length}`);
      assert(prices.every((value) => /^\s*\d[\d\s.,]*\s*₺\s*$/.test(value)), `Malformed price in ${lang}`);
      priceSets.push(prices.map((value) => value.replace(/\s/g, "")));
      const chips = page.locator(".menu-category-chip");
      const chipCount = await chips.count();
      assert(chipCount > 2, "Menu category chips missing");
      for (let i = 0; i < chipCount; i += 1) {
        await chips.nth(i).click();
        assert(await chips.nth(i).getAttribute("aria-pressed") === "true", `Category chip ${i} did not activate`);
        assert(await page.locator(".full-menu-panel").count() > 0, `Category chip ${i} rendered no products`);
      }
      await chips.first().click();
    }
    assert(JSON.stringify(priceSets[0]) === JSON.stringify(priceSets[1]) && JSON.stringify(priceSets[1]) === JSON.stringify(priceSets[2]), "Prices or product order changed across languages");

    const firstName = (await page.locator(".full-menu-item-copy strong").first().innerText()).trim();
    const token = firstName.split(/\s+/)[0];
    await page.locator("#menu-search").fill(token);
    assert(await page.locator(".full-menu-item").count() > 0, `Search did not find ${token}`);
    await page.locator("#menu-search").fill("zzzz-no-such-robys-item");
    assert(await page.locator("#menu-empty").isVisible(), "No-results state is not visible");
    await page.locator("#menu-search").fill("");

    await page.locator("#menu-share-button").click();
    const effects = await page.evaluate(() => window.__qaEffects ?? []);
    assert(effects.some((effect) => effect.type === "share"), "Share button did not invoke Web Share payload");
    const payload = effects.find((effect) => effect.type === "share")?.payload;
    assert(payload?.url?.includes("menu.html"), "Share payload does not use canonical menu URL");
    await context.close();
  });
}

async function auditDiscover(browser, profile) {
  await runCase(`${profile.id}-DISCOVER-GRAPH`, "Taste Journey rotation, language and persistence graph", async () => {
    const context = await browser.newContext(profile.context);
    await context.route("https://api.open-meteo.com/**", (route) => route.abort());
    const page = await context.newPage();
    await goto(page, "discover.html");
    await page.locator("#pairing-name").waitFor({ state: "visible", timeout: 15_000 });
    const first = (await page.locator("#pairing-name").innerText()).trim();
    await page.locator("#next-pairing").click();
    const second = (await page.locator("#pairing-name").innerText()).trim();
    assert(first && second && first !== second, "Another pairing did not change the pairing");
    await page.locator("#next-pairing").click();
    const third = (await page.locator("#pairing-name").innerText()).trim();
    assert(third === first, "Two-pairing rotation did not cycle deterministically");

    for (const lang of ["ru", "en", "tr"]) {
      const before = await page.locator("h1").innerText();
      await page.locator(`button[data-lang="${lang}"]`).click();
      assert(await page.locator("html").getAttribute("lang") === lang, `Discover did not switch to ${lang}`);
      const after = await page.locator("h1").innerText();
      if (lang !== "tr") assert(after !== before || lang === "ru", `Discover copy did not visibly change for ${lang}`);
    }

    const stepBefore = await page.locator("#relationship-step").innerText();
    await page.locator("#mark-discovered").click();
    const stepAfter = await page.locator("#relationship-step").innerText();
    assert(stepAfter !== stepBefore, "Mark discovered did not advance relationship state");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#pairing-name").waitFor({ state: "visible" });
    assert((await page.locator("#relationship-step").innerText()) === stepAfter, "Relationship stage did not survive reload");
    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    assert(storageKeys.every((key) => !/email|phone|name|location|fingerprint/i.test(key)), `Unexpected personal-data-like storage key: ${storageKeys.join(", ")}`);
    assert((await page.locator("#time-context").innerText()).trim() !== "—", "Time context stayed as placeholder");
    assert((await page.locator("#weather-context").innerText()).trim() !== "—", "Weather fallback stayed as placeholder");
    await context.close();
  });
}

const smartExcluded = /продолжить|назад|начать заново|полное меню|выбрать|добавить|убрать|continue|back|restart|full menu|choose|select|devam|geri|yeniden|tam menü/i;

async function switchSmartRussian(page) {
  await page.locator('button[data-lang="ru"]').click();
  await page.locator("#smart-choice-app h1, #smart-choice-app h2").first().waitFor({ state: "visible", timeout: 15_000 });
}

async function smartStart(page) {
  await goto(page, "smart-choice/");
  await switchSmartRussian(page);
  const start = page.getByRole("button", { name: "Начать выбор", exact: true });
  await start.click();
  await page.waitForTimeout(120);
}

async function smartState(page) {
  return page.locator("#smart-choice-app").evaluate((root) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const heading = [...root.querySelectorAll("h1,h2,h3")].find(visible)?.textContent?.trim() ?? "";
    const buttons = [...root.querySelectorAll("button")].filter(visible).map((button) => ({ text: button.textContent?.trim().replace(/\s+/g, " ") ?? "", disabled: button.disabled, className: button.className }));
    return { heading, buttons };
  });
}

async function replaySmartPath(page, path) {
  await smartStart(page);
  for (const answer of path) {
    const button = page.getByRole("button", { name: answer, exact: true }).last();
    await button.click();
    const continueButton = page.getByRole("button", { name: "Продолжить", exact: true });
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
    await page.waitForTimeout(80);
  }
}

async function auditSmartGraph(browser, profile) {
  await runCase(`${profile.id}-SMART-GRAPH`, "Smart Choice question/action graph and trust boundaries", async () => {
    const context = await browser.newContext(profile.context);
    const page = await context.newPage();
    const queue = [[]];
    const seenStates = new Set();
    const optionCoverage = new Set();
    const terminalPaths = [];
    let explored = 0;

    while (queue.length && explored < 70) {
      const path = queue.shift();
      await replaySmartPath(page, path);
      const state = await smartState(page);
      const stateKey = `${path.length}|${state.heading}|${state.buttons.map((item) => item.text).join("|")}`;
      explored += 1;
      const candidates = state.buttons.filter((item) => item.text && !item.disabled && !smartExcluded.test(item.text));
      if (/готов|отличный выбор/i.test(state.heading) || candidates.length === 0 || path.length >= 6) {
        terminalPaths.push(path);
        continue;
      }
      if (seenStates.has(stateKey)) continue;
      seenStates.add(stateKey);
      for (const option of candidates) {
        optionCoverage.add(`${state.heading} -> ${option.text}`);
        queue.push([...path, option.text]);
      }
    }

    assert(optionCoverage.size >= 10, `Too few Smart Choice graph edges covered: ${optionCoverage.size}`);
    assert(terminalPaths.length > 0, "No Smart Choice terminal recommendation reached");

    const canonical = terminalPaths.sort((a, b) => b.length - a.length)[0];
    await replaySmartPath(page, canonical);
    const body = await page.locator("#smart-choice-app").innerText();
    assert(/₺/.test(body), "Recommendation result has no TRY price");
    assert(/Итоговая цена|общая цена|цена/i.test(body), "Recommendation result has no total-price explanation");
    assert(!/заказ подтвержд[её]н|оплата (прошла|принята)|order confirmed|payment accepted/i.test(body), "Recommendation falsely claims order/payment completion");

    const choose = page.getByRole("button", { name: "Выбрать", exact: true }).first();
    if (await choose.isVisible().catch(() => false)) {
      await choose.click();
      const selected = await page.locator("#smart-choice-app").innerText();
      assert(/Заказ ещё не отправлен|заказ не отправлен/i.test(selected), "Selected state omits no-order boundary");
    }

    await replaySmartPath(page, canonical.slice(0, Math.max(1, canonical.length - 2)));
    const beforeReload = await smartState(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    const afterReload = await smartState(page);
    assert(beforeReload.heading === afterReload.heading, "Smart Choice current question did not survive reload");
    assert(await page.locator("html").getAttribute("lang") === "ru", "Smart Choice language did not survive reload");
    await context.close();

    const noJsContext = await browser.newContext({ ...profile.context, javaScriptEnabled: false });
    const noJsPage = await noJsContext.newPage();
    await goto(noJsPage, "smart-choice/");
    const noJsText = await noJsPage.locator("body").innerText();
    assert(noJsText.includes("Smart Choice için JavaScript gerekir"), "No-JavaScript fallback missing");
    assert(await noJsPage.getByRole("link", { name: "Tam menüyü aç", exact: true }).isVisible(), "No-JavaScript menu escape missing");
    await noJsContext.close();
  });
}

async function auditSimulator(browser, profile) {
  await runCase(`${profile.id}-SIM-BUSINESS`, "Revenue simulator arithmetic, boundaries and exports", async () => {
    const context = await browser.newContext(profile.context, { acceptDownloads: true });
    const requests = [];
    const page = await context.newPage();
    page.on("request", (request) => { if (request.resourceType() === "xhr" || request.resourceType() === "fetch") requests.push(request.url()); });
    await goto(page, "smart-choice/simulator.html");
    assert(await page.locator("#export-simulation-json").isDisabled(), "JSON export enabled before calculation");
    assert(await page.locator("#export-simulation-markdown").isDisabled(), "Markdown export enabled before calculation");
    await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
    const text = (await page.locator("#revenue-simulator-results").innerText()).replace(/[\u00a0\u202f]/g, " ");
    for (const expected of ["3 600 000", "600 000", "2 000", "360"]) assert(text.includes(expected), `Simulator output misses expected value ${expected}`);
    assert(/conservative/i.test(text) && /expected/i.test(text) && /stretch/i.test(text), "Scenario tiers missing");
    assert(requests.length === 0, `Simulator sent network requests: ${requests.join(", ")}`);

    const jsonDownload = page.waitForEvent("download");
    await page.locator("#export-simulation-json").click();
    const jsonFile = await jsonDownload;
    const jsonPath = resolve(outDir, `${profile.id}-simulation.json`);
    await jsonFile.saveAs(jsonPath);

    const mdDownload = page.waitForEvent("download");
    await page.locator("#export-simulation-markdown").click();
    const mdFile = await mdDownload;
    await mdFile.saveAs(resolve(outDir, `${profile.id}-simulation.md`));

    await page.locator('[name="currency"]').selectOption("RUB");
    await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
    const rubText = await page.locator("#revenue-simulator-results").innerText();
    assert(/₽|RUB/.test(rubText), "Currency selection is not preserved in output");

    await page.locator('[name="monthlyOrders"]').fill("0");
    assert(!(await page.locator("#revenue-simulator-form").evaluate((form) => form.checkValidity())), "Zero monthly orders passed native validation");
    await page.locator('[name="monthlyOrders"]').fill("10000");
    await page.locator('[name="averageCogs"]').fill("500");
    await page.locator('[name="averageOrderValue"]').fill("300");
    await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
    const marginText = await page.locator("#revenue-simulator-results").innerText();
    assert(/марж|себестоим|guardrail|отриц/i.test(marginText), "COGS above AOV produced no margin warning");
    await context.close();
  });
}

for (const profile of profiles) {
  const browser = await profile.engine.launch({ headless: true });
  for (const surface of surfaces) {
    await runCase(`${profile.id}-${surface.id}-STATIC`, `${surface.id} static inventory, text, links and runtime`, async () => {
      const context = await browser.newContext(profile.context);
      await installEffectStubs(context);
      const page = await context.newPage();
      await inspectStaticSurface(page, surface, profile);
      await context.close();
    });
    if (profile.deep) {
      await clickInitialButtons(browser, surface, profile);
      await auditInternalLinks(browser, surface, profile);
    }
  }
  if (profile.deep) {
    await auditMenu(browser, profile);
    await auditDiscover(browser, profile);
    await auditSmartGraph(browser, profile);
    await auditSimulator(browser, profile);
  }
  await browser.close();
}

const severityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id));
const summary = {
  targetName,
  baseUrl: baseUrl.href,
  executedAt: new Date().toISOString(),
  cases: { total: cases.length, passed: cases.filter((item) => item.status === "PASS").length, failed: cases.filter((item) => item.status === "FAIL").length },
  graph: { nodes: graph.nodes.length, edges: graph.edges.length },
  findings: Object.fromEntries(["P0", "P1", "P2", "P3"].map((severity) => [severity, findings.filter((item) => item.severity === severity).length]))
};

writeFileSync(resolve(outDir, "report.json"), JSON.stringify({ summary, cases, findings, graph }, null, 2));
writeFileSync(resolve(outDir, "graph.json"), JSON.stringify(graph, null, 2));
const md = [
  `# Roby's deep manual graph audit — ${targetName}`,
  "",
  `- Base URL: ${baseUrl.href}`,
  `- Executed: ${summary.executedAt}`,
  `- Cases: ${summary.cases.passed}/${summary.cases.total} passed`,
  `- Graph: ${summary.graph.nodes} states, ${summary.graph.edges} transitions`,
  `- Findings: P0 ${summary.findings.P0} · P1 ${summary.findings.P1} · P2 ${summary.findings.P2} · P3 ${summary.findings.P3}`,
  "",
  "## Findings",
  "",
  ...(findings.length ? findings.map((item) => `### ${item.id} · ${item.severity} · ${item.title}\n\n${item.detail}\n\nEvidence: \`${JSON.stringify(item.evidence)}\``) : ["No findings recorded."]),
  "",
  "## Cases",
  "",
  "| ID | Result | Scenario | Error |",
  "|---|---:|---|---|",
  ...cases.map((item) => `| ${item.id} | ${item.status} | ${item.title.replace(/\|/g, "\\|")} | ${(item.error ?? "—").replace(/\|/g, "\\|")} |`)
].join("\n");
writeFileSync(resolve(outDir, "report.md"), md);

console.log(JSON.stringify(summary, null, 2));
if (findings.some((item) => ["P0", "P1", "P2"].includes(item.severity)) || cases.some((item) => item.status === "FAIL")) process.exitCode = 1;
