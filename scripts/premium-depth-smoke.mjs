// MOTION-DEPTH-001 changes its visual target from retired 3D layers to the
// approved sharp takeaway cup. Focal hold, compositor budget and non-occlusion
// remain mandatory; cadence is independently gated in contextual-entry-smoke.
import path from "node:path";
import { certify, contextFor, brand, assertBrand, assertAsset, done, assert, save } from "./takeaway-browser-contract.mjs";

await certify({ port: Number(process.env.PREMIUM_DEPTH_PORT ?? 4197), resultsDir: path.resolve(process.env.PREMIUM_DEPTH_RESULTS_DIR ?? "visual-results/premium-depth"), contract: "MOTION-DEPTH-001" }, async ({ browser, baseUrl, resultsDir }) => {
  const evidence = { design: "takeaway-v1", asset: assertAsset(), captures: [] };
  for (const [width, height, language, scene] of [[320, 640, "tr", "morning"], [390, 844, "ru", "day"], [1280, 720, "en", "night"], [844, 390, "ru", "day"]]) {
    const context = await contextFor(browser, { viewport: { width, height }, language });
    const page = await context.newPage();
    await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    const appearance = await brand(page);
    assertBrand(appearance, language);
    // Observe the actual animation's settled state; do not freeze or fast-forward
    // production motion, and do not count a held QA fixture as timing evidence.
    let focal;
    const deadline = Date.now() + 1400;
    while (Date.now() < deadline) {
      focal = await page.evaluate(() => {
        const overlay = document.querySelector(".robys-takeaway-entry");
        const content = overlay?.querySelector(".robys-takeaway-content");
        const cup = overlay?.querySelector("img");
        if (!content) return null;
        const cs = getComputedStyle(content);
        const os = getComputedStyle(overlay);
        const rect = cup.getBoundingClientRect();
        return { state: document.documentElement.dataset.robysEntryState, opacity: Number(cs.opacity), transform: cs.transform, surfaceOpacity: Number(os.opacity), surfaceAnimations: overlay.getAnimations().length, cupOwned: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === cup };
      });
      if (focal?.opacity >= .999 && focal.transform === "matrix(1, 0, 0, 1, 0, 0)" && focal.state === "brand-frame") break;
      await page.waitForTimeout(16);
    }
    assert(focal?.state === "brand-frame" && focal.opacity >= .999 && focal.surfaceOpacity >= .98 && focal.surfaceAnimations === 0 && focal.cupOwned, "Cup never reached a sharp, unoccluded hold before handoff");
    await page.screenshot({ path: path.join(resultsDir, `takeaway-${width}-${height}-${language}-focus.png`), animations: "allow" });
    const probe = await done(page);
    const held = probe.frames.filter((frame) => frame.state === "brand-frame" && frame.opacity >= .999 && frame.transform === "matrix(1, 0, 0, 1, 0, 0)");
    assert(held.length >= 2 && held.at(-1).at - held[0].at >= 250, "Readable, stationary focal hold is shorter than 250 ms");
    evidence.captures.push({ width, height, language, scene, appearance, focal, holdMs: held.at(-1).at - held[0].at });
    await context.close();
  }
  save(resultsDir, "premium-depth-evidence.json", evidence);
});
