// MOTION-DEPTH-001 changes its visual target from retired 3D layers to the
// approved sharp takeaway cup. Focal hold, compositor budget and non-occlusion
// remain mandatory; cadence is independently gated in contextual-entry-smoke.
import path from "node:path";
import { certify, contextFor, brand, assertBrand, assertAsset, done, assert, save } from "./takeaway-browser-contract.mjs";

async function installRuntimeHoldProbe(page) {
  await page.addInitScript(() => {
    const evidence = {
      brandFrameAt: null,
      animationFound: false,
      animationFinishedAt: null,
      handoffAt: null
    };
    window.__robysPremiumHold = evidence;
    window.addEventListener("robys:entry-state", (event) => {
      const state = event.detail?.state;
      if (state === "brand-frame") {
        evidence.brandFrameAt = performance.now();
        // The product emits brand-frame immediately before element.animate().
        // A microtask observes the real Web Animation after the current task has
        // created it, without changing playback rate, duration or product code.
        queueMicrotask(() => {
          const content = document.querySelector(".robys-takeaway-content");
          const animation = content?.getAnimations()[0];
          evidence.animationFound = Boolean(animation);
          if (!animation) return;
          animation.finished.then(() => {
            evidence.animationFinishedAt = performance.now();
          }).catch(() => undefined);
        });
      }
      if (state === "handoff") evidence.handoffAt = performance.now();
    });
  });
}

await certify({ port: Number(process.env.PREMIUM_DEPTH_PORT ?? 4197), resultsDir: path.resolve(process.env.PREMIUM_DEPTH_RESULTS_DIR ?? "visual-results/premium-depth"), contract: "MOTION-DEPTH-001" }, async ({ browser, baseUrl, resultsDir }) => {
  const evidence = { design: "takeaway-v1", asset: assertAsset(), captures: [] };
  for (const [width, height, language, scene] of [[320, 640, "tr", "morning"], [390, 844, "ru", "day"], [1280, 720, "en", "night"], [844, 390, "ru", "day"]]) {
    // Measure the actual readable hold in a dedicated cold run. Exact computed-
    // style rAF samples are retained as diagnostics, but they are not a reliable
    // duration clock at animation boundaries on busy hosted runners.
    const measurement = await contextFor(browser, { viewport: { width, height }, language });
    const measurePage = await measurement.newPage();
    await installRuntimeHoldProbe(measurePage);
    await measurePage.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    const appearance = await brand(measurePage);
    assertBrand(appearance, language);
    const probe = await done(measurePage);
    save(resultsDir, `takeaway-${width}-${height}-${language}-frames.json`, probe);

    const held = probe.frames.filter((frame) => frame.state === "brand-frame" && frame.opacity >= .999 && frame.transform === "matrix(1, 0, 0, 1, 0, 0)");
    const sampledHoldMs = held.length >= 2 ? held.at(-1).at - held[0].at : 0;
    const runtime = await measurePage.evaluate(() => window.__robysPremiumHold);
    assert(runtime?.animationFound, `${width}×${height}: entrance Web Animation was not observed`);
    assert(Number.isFinite(runtime?.animationFinishedAt), `${width}×${height}: entrance animation completion was not observed`);
    assert(Number.isFinite(runtime?.handoffAt), `${width}×${height}: handoff event was not observed`);
    const holdMs = runtime.handoffAt - runtime.animationFinishedAt;
    assert(holdMs >= 250, `${width}×${height}: readable stationary hold ${holdMs.toFixed(1)} ms is shorter than 250 ms`);
    save(resultsDir, `takeaway-${width}-${height}-${language}-hold.json`, { ...runtime, holdMs, sampledHoldMs });
    await measurement.close();

    const context = await contextFor(browser, { viewport: { width, height }, language });
    const page = await context.newPage();
    await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    await brand(page);
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
    await done(page);
    evidence.captures.push({ width, height, language, scene, appearance, focal, holdMs, sampledHoldMs });
    await context.close();
  }
  save(resultsDir, "premium-depth-evidence.json", evidence);
});
