// Keep scene routing, session continuity, cadence and timing gates while replacing
// the retired Day/Night spline art with one approved takeaway composition.
import path from "node:path";
import { certify, contextFor, brand, assertBrand, assertAsset, done, timing, assert, save } from "./takeaway-browser-contract.mjs";
import { cadenceTimeAware } from "./takeaway-cadence-time-aware.mjs";

await certify({ port: Number(process.env.CONTEXTUAL_ENTRY_PORT ?? 4191), resultsDir: path.resolve(process.env.CONTEXTUAL_ENTRY_RESULTS_DIR ?? "visual-results/contextual-entry"), contract: "MOTION-CONTEXT-001" }, async ({ browser, baseUrl, resultsDir }) => {
  const evidence = { design: "takeaway-v1", asset: assertAsset(), scenes: {} };
  for (const scene of ["day", "night"]) {
    const context = await contextFor(browser);
    const page = await context.newPage();
    await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    const appearance = await brand(page);
    assertBrand(appearance);
    assert(appearance.scene === scene, `Forced ${scene} route changed`);
    const probe = await done(page);
    evidence.scenes[scene] = { appearance, timing: timing(probe, "cold", scene), smoothness: cadenceTimeAware(probe) };
    await context.close();
  }
  assert(evidence.scenes.day.appearance.background === evidence.scenes.night.appearance.background, "Shared warm palette drifted between routes");

  const context = await contextFor(browser);
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
  await done(page);
  for (const scene of ["night", "morning"]) {
    await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    evidence[`warm-${scene}`] = timing(await done(page), "warm", scene);
  }
  await context.close();

  const reduced = await contextFor(browser, { reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  for (const scene of ["day", "night"]) {
    await reducedPage.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    await reducedPage.waitForTimeout(120);
    assert(await reducedPage.locator(".robys-takeaway-entry").count() === 0, `Reduced motion rendered ${scene}`);
    assert(await reducedPage.evaluate(() => !document.documentElement.dataset.robysEntryScene && !document.documentElement.dataset.robysEntryPending), "Reduced motion retained scene/prepaint");
  }
  await reducedPage.screenshot({ path: path.join(resultsDir, "reduced-motion-product.png") });
  await reduced.close();
  save(resultsDir, "contextual-entry-evidence.json", evidence);
});
