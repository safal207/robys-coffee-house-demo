import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const mode = process.argv[2];
if (!new Set(["desktop", "mobile"]).has(mode)) throw new Error("Usage: node scripts/run-web-mobile-manual-qa.mjs <desktop|mobile>");
const baseUrl = new URL(process.env.ROBYS_LIVE_BASE ?? "https://safal207.github.io/robys-coffee-house-demo/");
const outputDir = process.env.ROBYS_QA_OUTPUT ?? `qa-artifacts/${mode}`;
mkdirSync(outputDir, { recursive: true });

const results = [];
const failures = [];
const HAPPY_CHOICES = [["Tatlı", "Dessert", "Десерт"], ["Soğuk", "Cold", "Холодное"], ["Tatlı", "Sweet", "Сладкое"], ["Bir kişi", "One", "Один"], ["400"]];
const NO_MATCH_CHOICES = [["Kahve", "Coffee", "Кофе"], ["Sıcak", "Hot", "Горячее"], ["Tatlı", "Sweet", "Сладкое"], ["Bir kişi", "One", "Один"], ["250"]];
const ignoredBrowserWarning = "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";

function assert(condition, message) { if (!condition) throw new Error(message); }
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
async function noHorizontalOverflow(page) {
  return page.evaluate(() => ({ viewport: document.documentElement.clientWidth, documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) }));
}
async function openPage(page, path) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("manual-qa", `${mode}-${Date.now()}`);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
}
async function resetSmartChoice(page) {
  await openPage(page, "smart-choice/");
  await page.evaluate(() => sessionStorage.removeItem("robys-smart-choice-session.v1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".smart-title").waitFor({ state: "visible", timeout: 15_000 });
}
async function findVisibleOption(page, candidates, prefix) {
  const buttons = page.locator(".option-button");
  await buttons.first().waitFor({ state: "visible", timeout: 15_000 });
  const count = await buttons.count();
  const inspected = [];
  for (let index = 0; index < count; index += 1) {
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
  await page.locator("#smart-choice-app .primary-button").first().click();
  const selectedTexts = [];
  for (let step = 1; step <= 5; step += 1) {
    const progress = page.locator('[role="progressbar"]');
    await progress.waitFor({ state: "visible", timeout: 15_000 });
    assert((await progress.getAttribute("aria-valuenow")) === String(step), `${prefix}: expected step ${step}`);
    const continueButton = page.locator("#smart-choice-app .actions .primary-button");
    assert(await continueButton.isDisabled(), `${prefix}: Continue must be disabled before an answer at step ${step}`);
    const { button: option, text } = await findVisibleOption(page, choices[step - 1], `${prefix} step ${step}`);
    await option.click();
    selectedTexts.push(text);
    assert((await option.getAttribute("aria-pressed")) === "true", `${prefix}: option was not selected at step ${step}`);
    assert(!(await continueButton.isDisabled()), `${prefix}: Continue stayed disabled at step ${step}`);
    await continueButton.click();
  }
  if (expectedOutcome === "result") await page.locator(".result-card").first().waitFor({ state: "visible", timeout: 15_000 });
  else await page.locator(".no-match-card").waitFor({ state: "visible", timeout: 15_000 });
  return selectedTexts;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: mode === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 }, deviceScaleFactor: mode === "desktop" ? 1 : 2, locale: "tr-TR", timezoneId: "Europe/Istanbul", isMobile: mode === "mobile", hasTouch: mode === "mobile", serviceWorkers: "allow" });
const page = await context.newPage();
const sameOriginErrors = [];
const pageErrors = [];
const browserWarnings = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => { if (response.url().startsWith(baseUrl.origin) && response.status() >= 400) sameOriginErrors.push(`HTTP ${response.status()}: ${response.url()}`); });
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (text.includes(ignoredBrowserWarning)) { browserWarnings.push(`${text} · tracked by #293`); return; }
  const location = message.location().url;
  if (!location || location.startsWith(baseUrl.origin)) sameOriginErrors.push(`console: ${text}`);
});
await page.route(/https:\/\/maps\.google\./, (route) => route.abort());

try {
  if (mode === "desktop") {
    await runCase("WEB-01", "Landing page and primary navigation render", async () => {
      await openPage(page, "index.html");
      await page.locator(".hero h1").waitFor({ state: "visible", timeout: 15_000 });
      await page.locator("[data-smart-choice-entry]").waitFor({ state: "visible", timeout: 15_000 });
      assert(await page.locator('a[href="menu.html"]').first().isVisible(), "Full menu link is not visible");
      await page.screenshot({ path: `${outputDir}/web-home.png`, fullPage: true });
      return { title: await page.title(), smartChoiceEntry: true };
    });
    await runCase("WEB-02", "Language switch and persistence", async () => {
      await page.locator('.lang-button[data-lang="en"]').click();
      assert((await page.locator("html").getAttribute("lang")) === "en", "English did not update html lang");
      assert(/Help me choose/i.test(await page.locator("[data-smart-choice-entry]").innerText()), "Smart Choice CTA did not localize to English");
      await page.reload({ waitUntil: "domcontentloaded" });
      assert((await page.locator("html").getAttribute("lang")) === "en", "English did not persist after reload");
      await page.locator('.lang-button[data-lang="ru"]').click();
      assert((await page.locator("html").getAttribute("lang")) === "ru", "Russian did not update html lang");
      return { persisted: "en", finalLanguage: "ru" };
    });
    await runCase("WEB-03", "Full menu renders", async () => {
      await openPage(page, "menu.html");
      await page.locator(".full-menu-item").first().waitFor({ state: "visible", timeout: 15_000 });
      const count = await page.locator(".full-menu-item").count();
      assert(count >= 20, `Only ${count} menu items rendered`);
      return { itemCount: count };
    });
    await runCase("WEB-04", "Menu search, clear and empty-state recovery", async () => {
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
      await search.fill("");
      return { restoredCount, emptyState: true };
    });
    await runCase("WEB-06", "Smart Choice direct entry and loading recovery", async () => {
      await resetSmartChoice(page);
      assert(!(await page.locator(".loading-card").isVisible()), "Smart Choice stayed in loading state");
      return { url: page.url(), title: await page.locator(".smart-title").innerText() };
    });
    await runCase("WEB-07", "Five-question Smart Choice confirmed happy path", async () => {
      const selectedTexts = await completeSmartChoice(page, "desktop-happy", HAPPY_CHOICES, "result");
      const cards = await page.locator(".result-card").count();
      assert(cards >= 1, "No recommendation cards rendered");
      const priceText = await page.locator(".result-price").first().innerText();
      assert(/(?:₺|\bTRY\b)/i.test(priceText), `TRY price is missing: ${priceText}`);
      assert(/order|sipariş|заказ/i.test(await page.locator(".safe-note").first().innerText()), "No-order disclosure is missing");
      await page.screenshot({ path: `${outputDir}/web-smart-choice-results.png`, fullPage: true });
      return { recommendationCards: cards, selectedTexts, priceText, path: "dessert/cold/sweet/one/400" };
    });
    await runCase("WEB-10", "Choice confirmation, reload and browser Back", async () => {
      await page.locator(".result-card .primary-button").first().click();
      await page.locator(".selected-card").waitFor({ state: "visible" });
      const selectedText = await page.locator(".selected-summary").innerText();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".selected-card").waitFor({ state: "visible", timeout: 15_000 });
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      await page.waitForTimeout(300);
      assert(await page.locator(".result-card").first().isVisible(), "Browser Back did not return to results");
      return { selectedText, sessionRecovered: true, backReturnedToResults: true };
    });
    await runCase("WEB-11", "No-match path fails closed without invented offer", async () => {
      await resetSmartChoice(page);
      const selectedTexts = await completeSmartChoice(page, "desktop-no-match", NO_MATCH_CHOICES, "no-match");
      const text = await page.locator(".no-match-card").innerText();
      assert(/no exact match|точного совпадения нет|tam eşleşme yok/i.test(text), "No-match explanation is missing");
      assert((await page.locator(".result-card").count()) === 0, "No-match path invented a recommendation card");
      return { selectedTexts, path: "coffee/hot/sweet/one/250", failClosed: true };
    });
  } else {
    await runCase("MOB-WEB-01", "Mobile landing has no horizontal overflow", async () => {
      await openPage(page, "index.html");
      await page.locator(".hero h1").waitFor({ state: "visible", timeout: 15_000 });
      await page.locator("[data-smart-choice-entry]").waitFor({ state: "visible", timeout: 15_000 });
      const dimensions = await noHorizontalOverflow(page);
      assert(dimensions.documentWidth <= dimensions.viewport + 1, `Horizontal overflow ${JSON.stringify(dimensions)}`);
      await page.screenshot({ path: `${outputDir}/mobile-home.png`, fullPage: true });
      return dimensions;
    });
    await runCase("MOB-WEB-03", "Mobile quick-action dock is usable", async () => {
      const dock = page.locator(".mobile-cta");
      assert(await dock.isVisible(), "Mobile quick-action dock is hidden");
      const links = await dock.locator("a").count();
      assert(links === 2, `Expected two quick-action links, found ${links}`);
      return { links };
    });
    await runCase("MOB-WEB-04", "Mobile menu search and language", async () => {
      await openPage(page, "menu.html");
      await page.locator(".full-menu-item").first().waitFor({ state: "visible", timeout: 15_000 });
      const search = page.locator("#menu-search");
      await search.fill("Lotus");
      await page.waitForTimeout(250);
      assert(/Lotus/i.test(await page.locator("#menu-root").innerText()), "Mobile Lotus search failed");
      await search.press("Escape");
      await page.locator('.lang-button[data-lang="en"]').click();
      assert((await page.locator("html").getAttribute("lang")) === "en", "Mobile language switch failed");
      const dimensions = await noHorizontalOverflow(page);
      assert(dimensions.documentWidth <= dimensions.viewport + 1, `Mobile menu overflow ${JSON.stringify(dimensions)}`);
      return dimensions;
    });
    await runCase("MOB-WEB-05", "Smart Choice touch targets and full mobile happy path", async () => {
      await resetSmartChoice(page);
      await page.locator("#smart-choice-app .primary-button").first().click();
      const firstOption = page.locator(".option-button").first();
      await firstOption.waitFor({ state: "visible" });
      const box = await firstOption.boundingBox();
      assert(Boolean(box) && box.height >= 44, `First option touch target is ${box?.height ?? 0}px high`);
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      await page.waitForTimeout(200);
      await resetSmartChoice(page);
      const selectedTexts = await completeSmartChoice(page, "mobile-happy", HAPPY_CHOICES, "result");
      const dimensions = await noHorizontalOverflow(page);
      assert(dimensions.documentWidth <= dimensions.viewport + 1, `Smart Choice overflow ${JSON.stringify(dimensions)}`);
      const priceText = await page.locator(".result-price").first().innerText();
      assert(/(?:₺|\bTRY\b)/i.test(priceText), `Mobile TRY price is missing: ${priceText}`);
      await page.screenshot({ path: `${outputDir}/mobile-smart-choice-results.png`, fullPage: true });
      return { optionHeight: box?.height, selectedTexts, priceText, path: "dessert/cold/sweet/one/400", ...dimensions };
    });
    await runCase("MOB-WEB-07", "Smart Choice session recovery", async () => {
      await page.locator(".result-card .primary-button").first().click();
      await page.locator(".selected-card").waitFor({ state: "visible" });
      await page.reload({ waitUntil: "domcontentloaded" });
      assert(await page.locator(".selected-card").isVisible(), "Selected state did not recover after reload");
      return { recovered: true };
    });
    await runCase("MOB-WEB-08", "Mobile no-match path stays honest", async () => {
      await resetSmartChoice(page);
      const selectedTexts = await completeSmartChoice(page, "mobile-no-match", NO_MATCH_CHOICES, "no-match");
      assert(await page.locator(".no-match-card").isVisible(), "Mobile no-match card is missing");
      assert((await page.locator(".result-card").count()) === 0, "Mobile no-match path invented a result");
      return { selectedTexts, failClosed: true };
    });
  }
  await runCase(`${mode.toUpperCase()}-RUNTIME`, "No same-origin runtime errors", async () => {
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(" | ")}`);
    assert(sameOriginErrors.length === 0, `Same-origin errors: ${sameOriginErrors.join(" | ")}`);
    return { pageErrors: 0, sameOriginErrors: 0, browserWarnings: [...new Set(browserWarnings)], trackedIssue: 293 };
  });
} finally {
  await context.close();
  await browser.close();
}
const report = { mode, baseUrl: baseUrl.href, completedAt: new Date().toISOString(), passed: failures.length === 0, results };
writeFileSync(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) throw new Error(`Manual QA ${mode} failed: ${failures.join(" || ")}`);
