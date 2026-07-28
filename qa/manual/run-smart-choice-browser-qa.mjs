import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [targetName = "local", baseArgument = "http://127.0.0.1:4173/"] = process.argv.slice(2);
const rootUrl = new URL(baseArgument.endsWith("/") ? baseArgument : `${baseArgument}/`);
const homeUrl = rootUrl.href;
const smartChoiceUrl = new URL("smart-choice/", rootUrl).href;
const simulatorUrl = new URL("smart-choice/simulator.html", rootUrl).href;
const outputRoot = resolve("qa-results", targetName);
mkdirSync(outputRoot, { recursive: true });

const results = [];
const browser = await chromium.launch({ headless: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeFileName(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function runCase(id, platform, title, options, body) {
  const startedAt = Date.now();
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const evidence = [];
  try {
    await body({ page, context, evidence });
    results.push({ id, platform, title, status: "PASS", durationMs: Date.now() - startedAt, evidence });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const failureShot = resolve(outputRoot, `${safeFileName(id)}-failure.png`);
    try {
      await page.screenshot({ path: failureShot, fullPage: true });
      evidence.push(failureShot);
    } catch {
      // Navigation or browser startup failures may make screenshots impossible.
    }
    results.push({
      id,
      platform,
      title,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      evidence
    });
    console.error(`FAIL ${id} ${title}:`, error);
  } finally {
    await context.close();
  }
}

async function goto(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  assert(response, `No navigation response for ${url}`);
  assert(response.status() < 400, `${url} returned HTTP ${response.status()}`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

async function screenshot(page, id, suffix = "") {
  const file = resolve(outputRoot, `${safeFileName(id)}${suffix ? `-${safeFileName(suffix)}` : ""}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function expectHeading(page, text) {
  await page.getByRole("heading", { name: text, exact: true }).waitFor({ state: "visible", timeout: 15_000 });
}

async function switchToRussian(page) {
  await page.locator('button[data-lang="ru"]').click();
  await expectHeading(page, "Давайте найдём ваш момент Roby's сегодня.");
  assert((await page.locator("html").getAttribute("lang")) === "ru", "Document language did not switch to ru");
}

async function startRussianFlow(page) {
  await goto(page, smartChoiceUrl);
  await switchToRussian(page);
  await page.getByRole("button", { name: "Начать выбор", exact: true }).click();
  await expectHeading(page, "Чего хочется прямо сейчас?");
}

async function selectOption(page, label, nextHeading) {
  const option = page.getByRole("button").filter({ hasText: label }).first();
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();

  const next = page.getByRole("heading", { name: nextHeading, exact: true });
  if (!(await next.isVisible().catch(() => false))) {
    const continueButton = page.getByRole("button", { name: "Продолжить", exact: true });
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
  }
  await next.waitFor({ state: "visible", timeout: 10_000 });
}

async function finishRussianHappyPath(page) {
  await selectOption(page, "Кофе", "Горячее или холодное?");
  await selectOption(page, "Холодное", "Какой вкус сейчас ближе?");
  await selectOption(page, "Сладкое", "На сколько человек?");
  await selectOption(page, "Один", "Какой бюджет комфортен?");

  const budget = page.getByRole("button").filter({ hasText: "До 400 ₺" }).first();
  await budget.click();
  const resultsHeading = page.getByRole("heading", { name: "Ваш выбор Roby's готов.", exact: true });
  if (!(await resultsHeading.isVisible().catch(() => false))) {
    const continueButton = page.getByRole("button", { name: "Продолжить", exact: true });
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
  }
  await resultsHeading.waitFor({ state: "visible", timeout: 15_000 });
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert(
    Math.max(dimensions.document, dimensions.body) <= dimensions.viewport + 1,
    `Horizontal overflow: viewport=${dimensions.viewport}, document=${dimensions.document}, body=${dimensions.body}`
  );
}

async function assertPrimaryTouchTargets(page) {
  const boxes = await page.locator("button:visible, a.primary-button:visible, a.menu-link:visible").evaluateAll((elements) =>
    elements.slice(0, 20).map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent?.trim() ?? "", width: rect.width, height: rect.height };
    })
  );
  assert(boxes.length > 0, "No visible interactive controls found");
  const undersized = boxes.filter((box) => box.height < 43);
  assert(undersized.length === 0, `Touch targets under 44px: ${JSON.stringify(undersized)}`);
}

const desktop = { viewport: { width: 1440, height: 1000 }, locale: "tr-TR" };
const mobile = { ...devices["Pixel 7"], locale: "tr-TR" };

await runCase("WEB-01", "desktop", "Homepage loads", desktop, async ({ page, evidence }) => {
  await goto(page, homeUrl);
  assert((await page.locator("body").innerText()).trim().length > 100, "Homepage body is unexpectedly empty");
  evidence.push(await screenshot(page, "WEB-01", "homepage"));
});

await runCase("WEB-02", "desktop", "Smart Choice entry opens the correct route", desktop, async ({ page, evidence }) => {
  await goto(page, homeUrl);
  const entry = page.locator('a[href$="smart-choice/"]:visible').first();
  await entry.waitFor({ state: "visible", timeout: 15_000 });
  const href = await entry.getAttribute("href");
  assert(href?.includes("smart-choice/"), `Unexpected Smart Choice href: ${href}`);
  await entry.click();
  await page.waitForURL(/smart-choice\/$/, { timeout: 15_000 });
  await page.locator("#smart-choice-app").waitFor({ state: "visible" });
  evidence.push(await screenshot(page, "WEB-02", "entry-result"));
});

await runCase("WEB-03", "desktop", "Welcome screen and safe exits are visible", desktop, async ({ page, evidence }) => {
  await goto(page, smartChoiceUrl);
  await expectHeading(page, "Bugünkü Roby's anınızı birlikte seçelim.");
  await page.getByRole("button", { name: "Seçime başla", exact: true }).waitFor();
  const menuHref = await page.getByRole("link", { name: "Tam menüyü aç", exact: true }).getAttribute("href");
  assert(menuHref === "../menu.html", `Unexpected full-menu fallback: ${menuHref}`);
  evidence.push(await screenshot(page, "WEB-03", "welcome"));
});

await runCase("WEB-04", "desktop", "TR RU EN localisation switches consistently", desktop, async ({ page }) => {
  await goto(page, smartChoiceUrl);
  await switchToRussian(page);
  assert((await page.locator("body").innerText()).includes("Заказ пока не отправляется"), "Russian trust boundary is missing");
  await page.locator('button[data-lang="en"]').click();
  await expectHeading(page, "Let’s find your Roby's moment today.");
  assert((await page.locator("html").getAttribute("lang")) === "en", "Document language did not switch to en");
  assert((await page.locator("body").innerText()).includes("No order is sent yet"), "English trust boundary is missing");
});

await runCase("WEB-05", "desktop", "Five-step Russian happy path completes", desktop, async ({ page, evidence }) => {
  await startRussianFlow(page);
  evidence.push(await screenshot(page, "WEB-05", "step-1"));
  await finishRussianHappyPath(page);
  const body = await page.locator("body").innerText();
  assert(body.includes("Итоговая цена"), "Result does not expose total price");
  assert(body.includes("₺"), "Result does not show TRY price");
  evidence.push(await screenshot(page, "WEB-05", "results"));
});

await runCase("WEB-06", "desktop", "Recommendation selection stays non-transactional", desktop, async ({ page, evidence }) => {
  await startRussianFlow(page);
  await finishRussianHappyPath(page);
  await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  await expectHeading(page, "Отличный выбор.");
  const body = await page.locator("body").innerText();
  assert(body.includes("Заказ ещё не отправлен"), "Selected state does not state the no-order boundary");
  assert(!/заказ подтвержд[её]н|оплата (?:прошла|принята)|order confirmed/i.test(body), "False transaction confirmation detected");
  evidence.push(await screenshot(page, "WEB-06", "selected"));
});

await runCase("WEB-08", "desktop", "Browser Back restores the previous question", desktop, async ({ page }) => {
  await startRussianFlow(page);
  await selectOption(page, "Кофе", "Горячее или холодное?");
  await page.goBack();
  await expectHeading(page, "Чего хочется прямо сейчас?");
  assert(page.url().includes("#step-1"), `Unexpected URL after Back: ${page.url()}`);
});

await runCase("WEB-09", "desktop", "Session reload recovers current step and language", desktop, async ({ page }) => {
  await startRussianFlow(page);
  await selectOption(page, "Кофе", "Горячее или холодное?");
  await selectOption(page, "Холодное", "Какой вкус сейчас ближе?");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectHeading(page, "Какой вкус сейчас ближе?");
  assert((await page.locator("html").getAttribute("lang")) === "ru", "Russian locale did not survive reload");
});

await runCase("WEB-10", "desktop", "Full-menu exit resolves safely", desktop, async ({ page }) => {
  await goto(page, smartChoiceUrl);
  const link = page.getByRole("link", { name: "Tam menüyü aç", exact: true });
  await link.click();
  await page.waitForURL(/menu\.html(?:$|[?#])/, { timeout: 15_000 });
  assert((await page.locator("body").innerText()).trim().length > 100, "Menu page is unexpectedly empty");
});

await runCase("WEB-11", "desktop", "Primary flow is keyboard operable", desktop, async ({ page }) => {
  await goto(page, smartChoiceUrl);
  let foundStart = false;
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    if (activeText === "Seçime başla") {
      foundStart = true;
      break;
    }
  }
  assert(foundStart, "Start button was not reachable by keyboard Tab navigation");
  await page.keyboard.press("Enter");
  await expectHeading(page, "Şu anda ne istiyorsunuz?");
  const focusVisible = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const style = getComputedStyle(active);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  assert(focusVisible, "Active keyboard element has no visible focus treatment");
});

await runCase("WEB-12", "desktop", "JavaScript-disabled fallback remains usable", { ...desktop, javaScriptEnabled: false }, async ({ page, evidence }) => {
  await goto(page, smartChoiceUrl);
  const body = await page.locator("body").innerText();
  assert(body.includes("Smart Choice için JavaScript gerekir"), "No-JavaScript fallback text is missing");
  const fallback = page.getByRole("link", { name: "Tam menüyü aç", exact: true });
  await fallback.waitFor({ state: "visible" });
  evidence.push(await screenshot(page, "WEB-12", "no-js"));
});

await runCase("WEB-13", "desktop", "Loaded page can finish the flow offline", desktop, async ({ page, context }) => {
  await startRussianFlow(page);
  await context.setOffline(true);
  await finishRussianHappyPath(page);
  await expectHeading(page, "Ваш выбор Roby's готов.");
});

await runCase("WEB-14", "desktop", "No uncaught errors or same-origin HTTP failures", desktop, async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(rootUrl.origin) && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(rootUrl.origin)) failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });
  await startRussianFlow(page);
  await finishRussianHappyPath(page);
  assert(pageErrors.length === 0, `Uncaught page errors: ${JSON.stringify(pageErrors)}`);
  assert(failedResponses.length === 0, `Same-origin HTTP failures: ${JSON.stringify(failedResponses)}`);
  assert(failedRequests.length === 0, `Same-origin request failures: ${JSON.stringify(failedRequests)}`);
  assert(consoleErrors.length === 0, `Console errors: ${JSON.stringify(consoleErrors)}`);
});

await runCase("MOB-01", "mobile", "Mobile homepage exposes a tappable Smart Choice CTA", mobile, async ({ page, evidence }) => {
  await goto(page, homeUrl);
  const entry = page.locator('a[href$="smart-choice/"]:visible').first();
  await entry.waitFor({ state: "visible", timeout: 15_000 });
  const box = await entry.boundingBox();
  assert(box && box.height >= 43 && box.width >= 120, `Mobile CTA is too small: ${JSON.stringify(box)}`);
  await assertNoHorizontalOverflow(page);
  evidence.push(await screenshot(page, "MOB-01", "homepage"));
});

await runCase("MOB-02", "mobile", "Mobile flow has no horizontal overflow", mobile, async ({ page, evidence }) => {
  await startRussianFlow(page);
  await assertNoHorizontalOverflow(page);
  await assertPrimaryTouchTargets(page);
  evidence.push(await screenshot(page, "MOB-02", "step-1"));
  await finishRussianHappyPath(page);
  await assertNoHorizontalOverflow(page);
  await assertPrimaryTouchTargets(page);
  evidence.push(await screenshot(page, "MOB-02", "results"));
});

await runCase("MOB-03", "mobile", "Mobile happy path and selected state are usable by touch", mobile, async ({ page, evidence }) => {
  await startRussianFlow(page);
  await finishRussianHappyPath(page);
  await page.getByRole("button", { name: "Выбрать", exact: true }).first().tap();
  await expectHeading(page, "Отличный выбор.");
  await assertNoHorizontalOverflow(page);
  evidence.push(await screenshot(page, "MOB-03", "selected"));
});

await runCase("MOB-04", "mobile", "Narrow header language controls remain usable", mobile, async ({ page }) => {
  await goto(page, smartChoiceUrl);
  for (const language of ["ru", "en", "tr"]) {
    const button = page.locator(`button[data-lang="${language}"]`);
    const box = await button.boundingBox();
    assert(box && box.height >= 40 && box.width >= 40, `${language.toUpperCase()} control is too small: ${JSON.stringify(box)}`);
    await button.tap();
    assert((await page.locator("html").getAttribute("lang")) === language, `Language ${language} did not activate`);
  }
  await assertNoHorizontalOverflow(page);
});

await runCase("MOB-05", "mobile", "Mobile reload restores the current question", mobile, async ({ page }) => {
  await startRussianFlow(page);
  await selectOption(page, "Кофе", "Горячее или холодное?");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectHeading(page, "Горячее или холодное?");
  await assertNoHorizontalOverflow(page);
});

await runCase("SIM-01", "desktop", "Owner simulator loads with the planning boundary", desktop, async ({ page, evidence }) => {
  await goto(page, simulatorUrl);
  await expectHeading(page, "Разложить цель роста на проверяемые рычаги");
  const body = await page.locator("body").innerText();
  assert(body.includes("результат не является прогнозом"), "Simulator forecast boundary is missing");
  assert(await page.locator("#export-simulation-json").isDisabled(), "JSON export should be disabled before calculation");
  evidence.push(await screenshot(page, "SIM-01", "initial"));
});

await runCase("SIM-02", "desktop", "Valid simulator inputs produce scenarios and exports", desktop, async ({ page, evidence }) => {
  await goto(page, simulatorUrl);
  await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).click();
  await page.locator("#export-simulation-json:not([disabled])").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator("#export-simulation-markdown:not([disabled])").waitFor({ state: "visible", timeout: 10_000 });
  const resultsText = await page.locator("#revenue-simulator-results").innerText();
  assert(!resultsText.includes("Результат появится здесь"), "Simulator still shows the placeholder after submit");
  assert(/conservative|expected|stretch/i.test(resultsText), "Scenario tiers are missing from simulator output");
  evidence.push(await screenshot(page, "SIM-02", "calculated"));
});

await runCase("SIM-03", "mobile", "Simulator remains usable without mobile overflow", mobile, async ({ page, evidence }) => {
  await goto(page, simulatorUrl);
  await assertNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Рассчитать сценарии", exact: true }).tap();
  await page.locator("#export-simulation-json:not([disabled])").waitFor({ state: "visible", timeout: 10_000 });
  await assertNoHorizontalOverflow(page);
  evidence.push(await screenshot(page, "SIM-03", "mobile-calculated"));
});

await browser.close();

const failures = results.filter((result) => result.status === "FAIL");
const passed = results.length - failures.length;
const reportLines = [
  `# Smart Choice manual-style browser QA — ${targetName}`,
  "",
  `- Base URL: ${rootUrl.href}`,
  `- Executed: ${new Date().toISOString()}`,
  `- Passed: ${passed}`,
  `- Failed: ${failures.length}`,
  "",
  "| ID | Platform | Result | Scenario | Evidence / error |",
  "|---|---|---:|---|---|",
  ...results.map((result) => {
    const detail = result.status === "PASS"
      ? result.evidence.map((file) => file.replace(`${process.cwd()}/`, "")).join("<br>") || "—"
      : (result.error ?? "Unknown failure").replace(/\|/g, "\\|");
    return `| ${result.id} | ${result.platform} | ${result.status} | ${result.title} | ${detail} |`;
  }),
  "",
  failures.length === 0
    ? "## Verdict\n\nPASS — no browser-blocking defects were found in the executed desktop and mobile-web scenarios."
    : `## Verdict\n\nFAIL — ${failures.length} scenario(s) require investigation before claiming full web/mobile-web completion.`
];

writeFileSync(resolve(outputRoot, "results.json"), JSON.stringify({ targetName, baseUrl: rootUrl.href, results }, null, 2));
writeFileSync(resolve(outputRoot, "report.md"), reportLines.join("\n"));

console.log(`\n${passed}/${results.length} passed for ${targetName}. Report: ${resolve(outputRoot, "report.md")}`);
if (failures.length > 0) process.exitCode = 1;
