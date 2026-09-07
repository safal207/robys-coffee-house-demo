import path from "node:path";
import { certify, contextFor, brand, assertBrand, done, timing, assert, save, BACKGROUND } from "./takeaway-browser-contract.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await certify({ port: Number(process.env.MOTION_RELEASE_PORT ?? 4193), resultsDir: path.resolve(process.env.MOTION_RELEASE_RESULTS_DIR ?? "visual-results/motion-release"), contract: "MOTION-RELEASE-001" }, async ({ browser, baseUrl, resultsDir }) => {
  const evidence = { design: "takeaway-v1" };
  const context = await contextFor(browser);
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  evidence.cold = timing(await done(page));
  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  evidence.warm = timing(await done(page), "warm");

  for (const key of ["Escape", "Tab"]) {
    await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
    await brand(page);
    const started = Date.now();
    await page.keyboard.press(key);
    await done(page, 1200);
    evidence[key] = { durationMs: Date.now() - started };
    assert(evidence[key].durationMs < 1000, `${key} did not promptly release the page`);
    assert(await page.evaluate(() => !document.activeElement?.closest(".robys-takeaway-entry")), "Keyboard focus remained trapped");
  }

  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await brand(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await done(page, 1200);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(120);
  assert(await page.locator(".robys-takeaway-entry").count() === 0, "Entry replayed after foreground recovery");
  evidence.backgroundRecovery = true;
  await page.screenshot({ path: path.join(resultsDir, "foreground-recovery-product.png") });
  await context.close();

  const visual = await contextFor(browser);
  const visualPage = await visual.newPage();
  await visualPage.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
  evidence.surface = await brand(visualPage);
  assertBrand(evidence.surface);
  await done(visualPage);
  // A real product action after handoff, independent of the scene's own events.
  await visualPage.locator('.hero-actions a[href="menu.html"]').first().click();
  assert(new URL(visualPage.url()).pathname.endsWith("/menu.html"), "Menu action did not navigate after handoff");
  evidence.menuNavigation = true;
  await visual.close();

  const slow = await contextFor(browser);
  const slowPage = await slow.newPage();
  let delayed = 0;
  await slowPage.route("**/takeaway-entry.js*", async (route) => { delayed++; await sleep(900); await route.continue(); });
  await slowPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  const prepaint = await slowPage.evaluate(() => ({ background: getComputedStyle(document.documentElement).backgroundColor, visibility: getComputedStyle(document.documentElement).visibility, pending: Boolean(document.documentElement.dataset.robysEntryPending), shield: getComputedStyle(document.documentElement, "::after").backgroundColor }));
  assert(delayed > 0, "Slow-module fixture did not intercept the production module");
  assert(prepaint.background === BACKGROUND && prepaint.shield === BACKGROUND && prepaint.pending && prepaint.visibility === "visible", "Slow module exposed unbranded prepaint or hid the document");
  await done(slowPage, 4500);
  evidence.slowModule = { delayMs: 900, prepaint };
  await slow.close();

  const failed = await contextFor(browser);
  const failedPage = await failed.newPage();
  let aborted = 0;
  await failedPage.route("**/takeaway-entry.js*", (route) => { aborted++; return route.abort("failed"); });
  await failedPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await failedPage.waitForTimeout(350);
  const failOpen = await failedPage.evaluate(() => ({ aborted: globalThis.__robysTakeawayEntryAborted === true, overlays: document.querySelectorAll(".robys-takeaway-entry").length, pending: Boolean(document.documentElement.dataset.robysEntryPending), visibility: getComputedStyle(document.documentElement).visibility, background: document.documentElement.style.backgroundColor, bodyDisplay: getComputedStyle(document.body).display }));
  assert(aborted > 0 && failOpen.aborted && !failOpen.overlays && !failOpen.pending && failOpen.visibility === "visible" && failOpen.background === "" && failOpen.bodyDisplay !== "none", "Module failure trapped the product");
  evidence.moduleFailure = failOpen;
  await failedPage.screenshot({ path: path.join(resultsDir, "offline-fail-open-product.png") });
  await failed.close();

  for (const fault of ["broken", "stalled"]) {
    const imageContext = await contextFor(browser);
    const imagePage = await imageContext.newPage();
    let intercepted = 0;
    await imagePage.route("**/robys-takeaway-cup-v1.webp", async (route) => {
      intercepted++;
      if (fault === "broken") return route.abort("failed");
      await sleep(1000);
      await route.continue();
    });
    await imagePage.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
    const probe = await done(imagePage, 1800);
    assert(intercepted > 0 && !probe.events.some((event) => event.state === "brand-frame"), `${fault} image was revealed before decoding`);
    assert(probe.events.at(-1).at - probe.events[0].at < 1000, `${fault} image exceeded the bounded recovery budget`);
    await imagePage.waitForTimeout(1100);
    assert(await imagePage.locator(".robys-takeaway-entry").count() === 0, `${fault} image resurrected a removed scene`);
    evidence[`${fault}Image`] = probe.events;
    await imageContext.close();
  }

  const reduced = await contextFor(browser, { reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await reducedPage.waitForTimeout(160);
  assert(await reducedPage.evaluate(() => !document.querySelector(".robys-takeaway-entry") && !document.documentElement.dataset.robysEntryScene && !document.documentElement.dataset.robysEntryPending && getComputedStyle(document.documentElement).visibility === "visible"), "Reduced motion is not a complete bypass");
  evidence.reducedMotion = true;
  await reduced.close();

  const dynamic = await contextFor(browser);
  const dynamicPage = await dynamic.newPage();
  await dynamicPage.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
  await brand(dynamicPage);
  await dynamicPage.emulateMedia({ reducedMotion: "reduce" });
  await done(dynamicPage, 1200);
  evidence.dynamicReducedMotion = true;
  await dynamic.close();
  save(resultsDir, "motion-release-evidence.json", evidence);
});
