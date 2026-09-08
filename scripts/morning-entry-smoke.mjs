// TEMPORARY DIAGNOSTIC BRANCH ONLY: capture a fixed attribution matrix first.
await import("./morning-entry-attribution.mjs");

// MOTION-ENTRY-001 now certifies the approved takeaway scene at the Morning route.
import path from "node:path";
import { certify, contextFor, brand, assertBrand, assertAsset, done, timing, cadence, assert, save } from "./takeaway-browser-contract.mjs";

await certify({ port: Number(process.env.MORNING_ENTRY_PORT ?? 4187), resultsDir: path.resolve(process.env.MORNING_ENTRY_RESULTS_DIR ?? "visual-results/morning-entry"), contract: "MOTION-ENTRY-001" }, async ({ browser, baseUrl, resultsDir }) => {
  const asset = assertAsset();
  const context = await contextFor(browser);
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  const appearance = await brand(page);
  assertBrand(appearance);
  assert(appearance.scene === "morning", "Morning override lost");
  const probe = await done(page);
  save(resultsDir, "morning-entry-raw-probe.json", probe);
  const cold = timing(probe, "cold", "morning");
  const smoothness = cadence(probe);
  save(resultsDir, "morning-entry-60hz-evidence.json", smoothness);

  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  const warm = timing(await done(page), "warm", "morning");

  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await brand(page);
  const skipStarted = Date.now();
  // Pointer action does not wait for animation stability, as real touch need not.
  await page.locator(".robys-takeaway-skip").dispatchEvent("pointerdown");
  await done(page, 1200);
  assert(Date.now() - skipStarted < 1000, "Pointer skip exceeded 1,000 ms");

  await page.goto(`${baseUrl}?entry=off`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(120);
  assert(await page.locator(".robys-takeaway-entry").count() === 0, "entry=off rendered the entry");
  assert(await page.evaluate(() => !document.documentElement.dataset.robysEntryScene && !document.documentElement.dataset.robysEntryPending), "entry=off retained prepaint or scene");
  await context.close();

  const reduced = await contextFor(browser, { reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await reducedPage.waitForTimeout(120);
  assert(await reducedPage.locator(".robys-takeaway-entry").count() === 0, "Reduced motion rendered the entry");
  assert(await reducedPage.evaluate(() => !document.documentElement.dataset.robysEntryScene && !document.documentElement.dataset.robysEntryPending), "Reduced motion retained prepaint or scene");
  await reducedPage.screenshot({ path: path.join(resultsDir, "reduced-motion-product.png") });
  await reduced.close();
  save(resultsDir, "morning-entry-evidence.json", { design: "takeaway-v1", asset, appearance, cold, warm });
});
