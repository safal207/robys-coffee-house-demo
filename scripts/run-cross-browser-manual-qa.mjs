import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices, firefox, webkit } from "playwright";

const baseUrl = new URL(process.env.ROBYS_LIVE_BASE ?? "https://safal207.github.io/robys-coffee-house-demo/");
const outputDir = process.env.ROBYS_QA_OUTPUT ?? "qa-artifacts/cross-browser";
mkdirSync(outputDir, { recursive: true });
const profiles = [
  { id: "chrome-desktop", browserName: "chromium", browserType: chromium, context: { viewport: { width: 1440, height: 900 } } },
  { id: "firefox-desktop", browserName: "firefox", browserType: firefox, context: { viewport: { width: 1440, height: 900 } } },
  { id: "safari-desktop", browserName: "webkit", browserType: webkit, context: { viewport: { width: 1440, height: 900 } } },
  { id: "android-pixel-7", browserName: "chromium", browserType: chromium, context: { ...devices["Pixel 7"] } },
  { id: "iphone-14", browserName: "webkit", browserType: webkit, context: { ...devices["iPhone 14"] } }
];
const HAPPY_CHOICES_RU = [["Десерт"], ["Холодное"], ["Сладкое"], ["Один"], ["400"]];
const ignoredBrowserWarning = "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";
function assert(condition, message) { if (!condition) throw new Error(message); }
async function findVisibleOption(page, candidates, profileId, step) {
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
  throw new Error(`${profileId}: step ${step} could not match [${candidates.join(", ")}]; options: ${inspected.join(" | ")}`);
}
async function completeSmartChoice(page, profileId) {
  await page.locator("#smart-choice-app .primary-button").first().click();
  const selectedTexts = [];
  for (let step = 1; step <= 5; step += 1) {
    const progress = page.locator('[role="progressbar"]');
    await progress.waitFor({ state: "visible", timeout: 15_000 });
    assert((await progress.getAttribute("aria-valuenow")) === String(step), `${profileId}: expected step ${step}`);
    const continueButton = page.locator("#smart-choice-app .actions .primary-button");
    assert(await continueButton.isDisabled(), `${profileId}: Continue was enabled before selection at step ${step}`);
    const { button: option, text } = await findVisibleOption(page, HAPPY_CHOICES_RU[step - 1], profileId, step);
    await option.click();
    selectedTexts.push(text);
    assert((await option.getAttribute("aria-pressed")) === "true", `${profileId}: option state did not update at step ${step}`);
    assert(!(await continueButton.isDisabled()), `${profileId}: Continue stayed disabled at step ${step}`);
    await continueButton.click();
  }
  await page.locator(".result-card").first().waitFor({ state: "visible", timeout: 15_000 });
  return selectedTexts;
}

const results = [];
let failed = false;
for (const profile of profiles) {
  const startedAt = new Date().toISOString();
  const browser = await profile.browserType.launch({ headless: true });
  const runtimeErrors = [];
  const browserWarnings = [];
  let context;
  try {
    context = await browser.newContext({ ...profile.context, locale: "tr-TR", timezoneId: "Europe/Istanbul", serviceWorkers: "allow" });
    const page = await context.newPage();
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("response", (response) => { if (response.url().startsWith(baseUrl.origin) && response.status() >= 400) runtimeErrors.push(`HTTP ${response.status()}: ${response.url()}`); });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes(ignoredBrowserWarning)) { browserWarnings.push(`${text} · tracked by #293`); return; }
      const source = message.location().url;
      if (!source || source.startsWith(baseUrl.origin)) runtimeErrors.push(`console: ${text}`);
    });
    await page.route(/https:\/\/maps\.google\./, (route) => route.abort());
    const home = new URL("index.html", baseUrl);
    home.searchParams.set("cross-browser-qa", `${profile.id}-${Date.now()}`);
    await page.goto(home.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator(".hero h1").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator("[data-smart-choice-entry]").waitFor({ state: "visible", timeout: 15_000 });
    const homeDimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) }));
    assert(homeDimensions.documentWidth <= homeDimensions.viewport + 1, `${profile.id}: home horizontal overflow ${JSON.stringify(homeDimensions)}`);
    await page.locator("[data-smart-choice-entry]").click();
    await page.locator(".smart-title").waitFor({ state: "visible", timeout: 15_000 });
    assert(new URL(page.url()).pathname.endsWith("/smart-choice/"), `${profile.id}: Smart Choice route did not open`);
    await page.locator('.lang-button[data-lang="ru"]').click();
    assert((await page.locator("html").getAttribute("lang")) === "ru", `${profile.id}: Russian language switch failed`);
    assert(/Начать выбор/.test(await page.locator("#smart-choice-app .primary-button").first().innerText()), `${profile.id}: Russian Smart Choice copy is missing`);
    const selectedTexts = await completeSmartChoice(page, profile.id);
    const resultCount = await page.locator(".result-card").count();
    assert(resultCount >= 1, `${profile.id}: no result cards`);
    const priceText = await page.locator(".result-price").first().innerText();
    assert(/(?:₺|\bTRY\b)/i.test(priceText), `${profile.id}: TRY price missing: ${priceText}`);
    assert(/заказ/i.test(await page.locator(".safe-note").first().innerText()), `${profile.id}: no-order disclosure missing`);
    const smartDimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) }));
    assert(smartDimensions.documentWidth <= smartDimensions.viewport + 1, `${profile.id}: Smart Choice horizontal overflow ${JSON.stringify(smartDimensions)}`);
    assert(runtimeErrors.length === 0, `${profile.id}: runtime errors: ${runtimeErrors.join(" | ")}`);
    const screenshot = `${outputDir}/${profile.id}-smart-choice.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ profile: profile.id, browser: profile.browserName, status: "PASS", startedAt, completedAt: new Date().toISOString(), evidence: { homeDimensions, smartDimensions, resultCount, selectedTexts, priceText, path: "dessert/cold/sweet/one/400", browserWarnings: [...new Set(browserWarnings)], trackedIssue: 293, screenshot } });
    console.log(`✅ ${profile.id}: landing → Smart Choice → confirmed five-question path → results`);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ profile: profile.id, browser: profile.browserName, status: "FAIL", startedAt, completedAt: new Date().toISOString(), error: message, runtimeErrors, browserWarnings });
    console.error(`❌ ${profile.id}: ${message}`);
  } finally {
    await context?.close();
    await browser.close();
  }
}
const report = { completedAt: new Date().toISOString(), baseUrl: baseUrl.href, passed: !failed, profiles: results };
writeFileSync(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failed) throw new Error("Cross-browser manual QA failed for one or more profiles");
