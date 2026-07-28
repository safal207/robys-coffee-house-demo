import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const mode = process.argv[2];
if (!new Set(["desktop", "mobile"]).has(mode)) throw new Error("Usage: node scripts/run-web-mobile-manual-qa.mjs <desktop|mobile>");

const baseUrl = new URL(process.env.ROBYS_LIVE_BASE ?? "https://safal207.github.io/robys-coffee-house-demo/");
const outputDir = process.env.ROBYS_QA_OUTPUT ?? `qa-artifacts/${mode}`;
mkdirSync(outputDir, { recursive: true });

const HAPPY_CHOICES = [["Tatlı", "Dessert", "Десерт"], ["Soğuk", "Cold", "Холодное"], ["Tatlı", "Sweet", "Сладкое"], ["Bir kişi", "One", "Один"], ["400"]];
const NO_MATCH_CHOICES = [["Kahve", "Coffee", "Кофе"], ["Sıcak", "Hot", "Горячее"], ["Tatlı", "Sweet", "Сладкое"], ["Bir kişi", "One", "Один"], ["250"]];
const ignoredBrowserWarning = /frame-ancestors.*ignored.*meta.*element/i;
const results = [];
const failures = [];
const runtimeErrors = [];
const browserWarnings = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(id, title, action) {
  const startedAt = new Date().toISOString();
  try {
    const evidence = await action();
    results.push({ id, title, status: "PASS", startedAt, completedAt: new Date().toISOString(), evidence });
    console.log(`✅ ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, title, status: "FAIL", startedAt, completedAt: new Date().toISOString(), error: message });
    failures.push(`${id}: ${message}`);
    console.error(`❌ ${id} ${title}: ${message}`);
  }
}

async function stopPendingNavigation(page) {
  await page.evaluate(() => window.stop()).catch(() => null);
}

async function openLivePage(context, path, readySelector) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const page = await context.newPage();
    wireRuntimeEvidence(page);
    const url = new URL(path, baseUrl);
    url.searchParams.set("manual-qa", `${mode}-${Date.now()}-${attempt}`);
    try {
      await page.goto(url.href, { waitUntil: "commit", timeout: 30_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => stopPendingNavigation(page));
      await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 15_000 });
      await stopPendingNavigation(page);
      return page;
    } catch (error) {
      lastError = error;
      await stopPendingNavigation(page);
      if (await page.locator(readySelector).first().isVisible().catch(() => false)) return page;
      await page.close().catch(() => null);
    }
  }
  throw lastError ?? new Error(`Could not open ${path}`);
}

function wireRuntimeEvidence(page) {
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.url().startsWith(baseUrl.origin) && response.status() >= 400) runtimeErrors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (ignoredBrowserWarning.test(text)) {
      browserWarnings.push(`${text} · tracked by #293`);
      return;
    }
    const source = message.location().url;
    if (!source || source.startsWith(baseUrl.origin)) runtimeErrors.push(`console: ${text}`);
  });
  page.route(/https:\/\/maps\.google\./, (route) => route.abort()).catch(() => null);
}

async function reloadAndWait(page, readySelector) {
  await page.reload({ waitUntil: "commit", timeout: 30_000 }).catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => stopPendingNavigation(page));
  await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 15_000 });
  await stopPendingNavigation(page);
}

async function freshSmartChoice(context) {
  const page = await openLivePage(context, "smart-choice/", "#smart-choice-app");
  await page.evaluate(() => sessionStorage.removeItem("robys-smart-choice-session.v1"));
  await reloadAndWait(page, ".smart-title");
  return page;
}

async function findVisibleOption(page, candidates, prefix) {
  const buttons = page.locator(".option-button");
  await buttons.first().waitFor({ state: "visible", timeout: 15_000 });
  const inspected = [];
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    const text = (await button.innerText()).replace(/\s+/g, " ").trim();
    inspected.push(text);
    const normalized = text.toLowerCase();
    if (candidates.some((candidate) => normalized.includes(candidate.toLowerCase()))) return { button, text };
  }
  throw new Error(`${prefix}: none of [${candidates.join(", ")}] matched visible options: ${inspected.join(" | ")}`);
}

async function completeSmartChoice(page, prefix, choices, expectedOutcome) {
  await stopPendingNavigation(page);
  await page.locator("#smart-choice-app .primary-button").first().click({ noWaitAfter: true });
  const selectedTexts = [];
  for (let step = 1; step <= 5; step += 1) {
    const progress = page.locator('[role="progressbar"]');
    await progress.waitFor({ state: "visible", timeout: 15_000 });
    assert((await progress.getAttribute("aria-valuenow")) === String(step), `${prefix}: expected step ${step}`);
    const continueButton = page.locator("#smart-choice-app .actions .primary-button");
    assert(await continueButton.isDisabled(), `${prefix}: Continue must be disabled before an answer at step ${step}`);
    const { button, text } = await findVisibleOption(page, choices[step - 1], `${prefix} step ${step}`);
    await button.click({ noWaitAfter: true });
    selectedTexts.push(text);
    assert((await button.getAttribute("aria-pressed")) === "true", `${prefix}: option was not selected at step ${step}`);
    assert(!(await continueButton.isDisabled()), `${prefix}: Continue stayed disabled at step ${step}`);
    await continueButton.click({ noWaitAfter: true });
  }
  await page.locator(expectedOutcome === "result" ? ".result-card" : ".no-match-card").first().waitFor({ state: "visible", timeout: 15_000 });
  return selectedTexts;
}

async function dimensions(page) {
  return page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: mode === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  deviceScaleFactor: mode === "desktop" ? 1 : 2,
  locale: "tr-TR",
  timezoneId: "Europe/Istanbul",
  isMobile: mode === "mobile",
  hasTouch: mode === "mobile",
  serviceWorkers: "allow"
});

try {
  if (mode === "desktop") {
    await runCase("WEB-01", "Landing page and primary navigation render", async () => {
      const page = await openLivePage(context, "index.html", ".hero h1");
      try {
        await page.locator("[data-smart-choice-entry]").waitFor({ state: "visible", timeout: 15_000 });
        assert(await page.locator('a[href="menu.html"]').first().isVisible(), "Full menu link is not visible");
        await page.screenshot({ path: `${outputDir}/web-home.png`, fullPage: true });
        return { title: await page.title(), smartChoiceEntry: true };
      } finally { await page.close(); }
    });

    await runCase("WEB-02", "Language switch and persistence", async () => {
      const page = await openLivePage(context, "index.html", ".hero h1");
      try {
        await page.locator('.lang-button[data-lang="en"]').click({ noWaitAfter: true });
        assert((await page.locator("html").getAttribute("lang")) === "en", "English did not update html lang");
        assert(/Help me choose/i.test(await page.locator("[data-smart-choice-entry]").innerText()), "Smart Choice CTA did not localize to English");
        await reloadAndWait(page, ".hero h1");
        assert((await page.locator("html").getAttribute("lang")) === "en", "English did not persist after reload");
        await page.locator('.lang-button[data-lang="ru"]').click({ noWaitAfter: true });
        assert((await page.locator("html").getAttribute("lang")) === "ru", "Russian did not update html lang");
        return { persisted: "en", finalLanguage: "ru" };
      } finally { await page.close(); }
    });

    await runCase("WEB-03", "Full menu renders", async () => {
      const page = await openLivePage(context, "menu.html", ".full-menu-item");
      try {
        const count = await page.locator(".full-menu-item").count();
        assert(count >= 20, `Only ${count} menu items rendered`);
        return { itemCount: count };
      } finally { await page.close(); }
    });

    await runCase("WEB-04", "Menu search, clear and empty-state recovery", async () => {
      const page = await openLivePage(context, "menu.html", ".full-menu-item");
      try {
        const search = page.locator("#menu-search");
        await search.fill("Lotus");
        await page.waitForTimeout(250);
        assert(/Lotus/i.test(await page.locator("#menu-root").innerText()), "Lotus search returned no Lotus result");
        await search.press("Escape");
        assert((await search.inputValue()) === "", "Escape did not clear search");
        const restoredCount = await page.locator(".full-menu-item").count();
        assert(restoredCount >= 20, "Menu did not restore after Escape");
        await search.fill("zzzz-no-product-zzzz");
        await page.waitForTimeout(250);
        assert(await page.locator("#menu-empty").isVisible(), "No-results state is not visible");
        return { restoredCount, emptyState: true };
      } finally { await page.close(); }
    });

    await runCase("WEB-06", "Smart Choice direct entry and loading recovery", async () => {
      const page = await freshSmartChoice(context);
      try {
        assert(!(await page.locator(".loading-card").isVisible()), "Smart Choice stayed in loading state");
        return { url: page.url(), title: await page.locator(".smart-title").innerText() };
      } finally { await page.close(); }
    });

    await runCase("WEB-07", "Five-question Smart Choice confirmed happy path", async () => {
      const page = await freshSmartChoice(context);
      try {
        const selectedTexts = await completeSmartChoice(page, "desktop-happy", HAPPY_CHOICES, "result");
        const cards = await page.locator(".result-card").count();
        const priceText = await page.locator(".result-price").first().innerText();
        assert(cards >= 1, "No recommendation cards rendered");
        assert(/(?:₺|\bTRY\b)/i.test(priceText), `TRY price is missing: ${priceText}`);
        assert(/order|sipariş|заказ/i.test(await page.locator(".safe-note").first().innerText()), "No-order disclosure is missing");
        await page.screenshot({ path: `${outputDir}/web-smart-choice-results.png`, fullPage: true });
        return { recommendationCards: cards, selectedTexts, priceText, path: "dessert/cold/sweet/one/400" };
      } finally { await page.close(); }
    });

    await runCase("WEB-10", "Choice confirmation, reload and browser Back", async () => {
      const page = await freshSmartChoice(context);
      try {
        await completeSmartChoice(page, "desktop-recovery", HAPPY_CHOICES, "result");
        await page.locator(".result-card .primary-button").first().click({ noWaitAfter: true });
        await page.locator(".selected-card").waitFor({ state: "visible", timeout: 15_000 });
        const selectedText = await page.locator(".selected-summary").innerText();
        await reloadAndWait(page, ".selected-card");
        await page.goBack({ waitUntil: "commit" }).catch(() => null);
        await stopPendingNavigation(page);
        await page.locator(".result-card").first().waitFor({ state: "visible", timeout: 15_000 });
        return { selectedText, sessionRecovered: true, backReturnedToResults: true };
      } finally { await page.close(); }
    });

    await runCase("WEB-11", "No-match path fails closed without invented offer", async () => {
      const page = await freshSmartChoice(context);
      try {
        const selectedTexts = await completeSmartChoice(page, "desktop-no-match", NO_MATCH_CHOICES, "no-match");
        const text = await page.locator(".no-match-card").innerText();
        assert(/no exact match|точного совпадения нет|tam eşleşme yok/i.test(text), "No-match explanation is missing");
        assert((await page.locator(".result-card").count()) === 0, "No-match path invented a recommendation card");
        return { selectedTexts, path: "coffee/hot/sweet/one/250", failClosed: true };
      } finally { await page.close(); }
    });
  } else {
    await runCase("MOB-WEB-01", "Mobile landing has no horizontal overflow", async () => {
      const page = await openLivePage(context, "index.html", ".hero h1");
      try {
        await page.locator("[data-smart-choice-entry]").waitFor({ state: "visible", timeout: 15_000 });
        const value = await dimensions(page);
        assert(value.documentWidth <= value.viewport + 1, `Horizontal overflow ${JSON.stringify(value)}`);
        await page.screenshot({ path: `${outputDir}/mobile-home.png`, fullPage: true });
        return value;
      } finally { await page.close(); }
    });

    await runCase("MOB-WEB-03", "Mobile quick-action dock is usable", async () => {
      const page = await openLivePage(context, "index.html", ".hero h1");
      try {
        const dock = page.locator(".mobile-cta");
        assert(await dock.isVisible(), "Mobile quick-action dock is hidden");
        const links = await dock.locator("a").count();
        assert(links === 2, `Expected two quick-action links, found ${links}`);
        return { links };
      } finally { await page.close(); }
    });

    await runCase("MOB-WEB-04", "Mobile menu search and language", async () => {
      const page = await openLivePage(context, "menu.html", ".full-menu-item");
      try {
        const search = page.locator("#menu-search");
        await search.fill("Lotus");
        await page.waitForTimeout(250);
        assert(/Lotus/i.test(await page.locator("#menu-root").innerText()), "Mobile Lotus search failed");
        await search.press("Escape");
        await page.locator('.lang-button[data-lang="en"]').click({ noWaitAfter: true });
        assert((await page.locator("html").getAttribute("lang")) === "en", "Mobile language switch failed");
        const value = await dimensions(page);
        assert(value.documentWidth <= value.viewport + 1, `Mobile menu overflow ${JSON.stringify(value)}`);
        return value;
      } finally { await page.close(); }
    });

    await runCase("MOB-WEB-05", "Smart Choice touch targets and full mobile happy path", async () => {
      const page = await freshSmartChoice(context);
      try {
        await page.locator("#smart-choice-app .primary-button").first().click({ noWaitAfter: true });
        const firstOption = page.locator(".option-button").first();
        await firstOption.waitFor({ state: "visible", timeout: 15_000 });
        const box = await firstOption.boundingBox();
        assert(Boolean(box) && box.height >= 44, `First option touch target is ${box?.height ?? 0}px high`);
        await page.close();
        const flowPage = await freshSmartChoice(context);
        try {
          const selectedTexts = await completeSmartChoice(flowPage, "mobile-happy", HAPPY_CHOICES, "result");
          const value = await dimensions(flowPage);
          const priceText = await flowPage.locator(".result-price").first().innerText();
          assert(value.documentWidth <= value.viewport + 1, `Smart Choice overflow ${JSON.stringify(value)}`);
          assert(/(?:₺|\bTRY\b)/i.test(priceText), `Mobile TRY price is missing: ${priceText}`);
          await flowPage.screenshot({ path: `${outputDir}/mobile-smart-choice-results.png`, fullPage: true });
          return { optionHeight: box?.height, selectedTexts, priceText, path: "dessert/cold/sweet/one/400", ...value };
        } finally { await flowPage.close(); }
      } catch (error) {
        if (!page.isClosed()) await page.close();
        throw error;
      }
    });

    await runCase("MOB-WEB-07", "Smart Choice session recovery", async () => {
      const page = await freshSmartChoice(context);
      try {
        await completeSmartChoice(page, "mobile-recovery", HAPPY_CHOICES, "result");
        await page.locator(".result-card .primary-button").first().click({ noWaitAfter: true });
        await page.locator(".selected-card").waitFor({ state: "visible", timeout: 15_000 });
        await reloadAndWait(page, ".selected-card");
        return { recovered: true };
      } finally { await page.close(); }
    });

    await runCase("MOB-WEB-08", "Mobile no-match path stays honest", async () => {
      const page = await freshSmartChoice(context);
      try {
        const selectedTexts = await completeSmartChoice(page, "mobile-no-match", NO_MATCH_CHOICES, "no-match");
        assert(await page.locator(".no-match-card").isVisible(), "Mobile no-match card is missing");
        assert((await page.locator(".result-card").count()) === 0, "Mobile no-match path invented a result");
        return { selectedTexts, failClosed: true };
      } finally { await page.close(); }
    });
  }

  await runCase(`${mode.toUpperCase()}-RUNTIME`, "No same-origin runtime errors", async () => {
    assert(runtimeErrors.length === 0, `Runtime errors: ${runtimeErrors.join(" | ")}`);
    return { runtimeErrors: 0, browserWarnings: [...new Set(browserWarnings)], trackedIssue: 293 };
  });
} finally {
  await context.close();
  await browser.close();
}

const report = { mode, baseUrl: baseUrl.href, completedAt: new Date().toISOString(), passed: failures.length === 0, results };
writeFileSync(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) throw new Error(`Manual QA ${mode} failed: ${failures.join(" || ")}`);
