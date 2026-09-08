// Diagnostic-only prelude for a temporary PR. It does not replace MOTION-ENTRY-001.
import path from "node:path";
import { certify, contextFor, brand, assertBrand, done, timing, cadence, save } from "./takeaway-browser-contract.mjs";

const output = path.resolve(process.env.MORNING_ENTRY_RESULTS_DIR ?? "visual-results/morning-entry", "attribution");
const plan = ["live", "deferred", "deferred", "live", "live", "deferred", "deferred", "live"];

await certify({ port: 4196, resultsDir: output, contract: "MOTION-ATTRIBUTION-DIAGNOSTIC" }, async ({ browser, baseUrl, resultsDir }) => {
  const rows = [];
  for (let index = 0; index < plan.length; index += 1) {
    const arm = plan[index];
    const row = { run: index + 1, arm, status: "RUNNING", pageErrors: [] };
    rows.push(row);
    const context = await contextFor(browser);
    await context.addInitScript(() => {
      const diagnostics = globalThis.__robysMotionAttribution = { longFrames: [], longTasks: [], observerErrors: [] };
      for (const [type, key] of [["long-animation-frame", "longFrames"], ["longtask", "longTasks"]]) {
        try {
          if (!PerformanceObserver.supportedEntryTypes.includes(type)) throw new Error(`${type} unsupported`);
          new PerformanceObserver(list => diagnostics[key].push(...list.getEntries().map(entry => entry.toJSON()))).observe({ type, buffered: true });
        } catch (error) { diagnostics.observerErrors.push(String(error)); }
      }
    });
    const page = await context.newPage();
    page.on("pageerror", error => row.pageErrors.push(error.message));
    try {
      await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
      if (arm === "live") {
        const started = performance.now();
        const appearance = await brand(page);
        row.brandReadWallMs = performance.now() - started;
        assertBrand(appearance);
        row.brandStatus = "PASS";
      } else row.brandStatus = "DEFERRED_DIAGNOSTIC_ONLY";
      const probe = await done(page);
      row.events = probe.events;
      const brandAt = probe.events.find(event => event.state === "brand-frame")?.at;
      const brandFrames = probe.frames.filter(frame => frame.state === "brand-frame");
      const firstVisible = brandFrames.find(frame => frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
      row.startupMs = firstVisible && Number.isFinite(brandAt) ? firstVisible.at - brandAt : null;
      row.rafGaps = brandFrames.slice(1).map((frame, i) => ({
        gapMs: frame.at - brandFrames[i].at,
        from: brandFrames[i].at,
        to: frame.at,
        fromPending: brandFrames[i].entrancePending,
        toPending: frame.entrancePending
      })).sort((a, b) => b.gapMs - a.gapMs).slice(0, 6);
      try { row.timing = timing(probe, "cold", "morning"); row.timingStatus = "PASS"; }
      catch (error) { row.timingStatus = "FAIL"; row.timingError = String(error); }
      try { row.cadence = cadence(probe); row.cadenceStatus = "PASS"; }
      catch (error) { row.cadenceStatus = "FAIL"; row.cadenceError = String(error); }
      row.diagnostics = await page.evaluate(() => globalThis.__robysMotionAttribution);
      row.status = "CAPTURED";
    } catch (error) {
      row.status = "CAPTURE_ERROR";
      row.error = String(error.stack ?? error);
    } finally {
      await context.close();
      save(resultsDir, "attribution-matrix.json", rows);
      console.log(JSON.stringify({ run: row.run, arm: row.arm, startupMs: row.startupMs, cadence: row.cadenceStatus, maxGapMs: row.rafGaps?.[0]?.gapMs, brandReadWallMs: row.brandReadWallMs, status: row.status }));
    }
  }
  if (rows.some(row => row.status === "CAPTURE_ERROR" || row.pageErrors.length)) throw new Error("Attribution capture incomplete");
  // Cadence failures are intentionally retained in the matrix but do not stop
  // this diagnostic prelude. The unchanged MOTION-ENTRY-001 gate runs next and
  // remains the only release result for this workflow.
});
