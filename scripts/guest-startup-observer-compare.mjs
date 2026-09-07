import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { certify, brand, assertBrand, done, timing, cadence, save } from './takeaway-browser-contract.mjs';

const directory = path.resolve('.artifacts/guest-startup');
mkdirSync(directory, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const runtimeParent = '8b1613abc250919d66b2173249b87f417c925883';
const publicFiles = ['index.html', 'styles-v2.css', 'bootstrap-v2.js', 'takeaway-entry.js', 'app.js', 'qa.js', 'order-launcher.js'];
const runtimeHashes = Object.fromEntries(publicFiles.map(file => [file, hash(readFileSync(file))]));
if (execFileSync('git', ['diff', runtimeParent, 'HEAD', '--', ...publicFiles], { encoding: 'utf8' })) throw new Error('Diagnostic runtime differs from the failing PR');
const original = readFileSync('scripts/takeaway-browser-contract.mjs', 'utf8');
const temporary = mkdtempSync(path.join(process.cwd(), '.startup-observer-'));
const observations = [];
const report = {
  boundary: 'Controlled observer comparison, not product acceptance or pixel-presentation proof. ABBA repeated three times; fresh Chromium process each time. Runtime, event origin, original limits and visible-motion samples are unchanged. Metadata-only pending records have null style values, never invented zero opacity. Both arms have identical animation wrappers, observation timestamps, long-task observers and CDP metrics; no CPU trace recording. Appearance reads are delayed until 24 visible samples in both arms to isolate sampler effects; this differs from the release helper call order.',
  runtimeParent, runtimeHashes, originalHelperSha256: hash(original), helpers: {}, observations
};

function derive(variant) {
  const wrapper = `    let entranceAnimation;
    probe.animation = { calls: [], ready: [] };
    probe.longTasks = [];
    new PerformanceObserver(list => probe.longTasks.push(...list.getEntries().map(entry => ({ at: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    const nativeAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = Reflect.apply(nativeAnimate, this, args);
      if (this.classList.contains('robys-takeaway-content')) {
        entranceAnimation = animation;
        probe.animation.calls.push({ at: performance.now(), pending: animation.pending, time: animation.currentTime });
        animation.ready.then(() => probe.animation.ready.push({ at: performance.now(), pending: animation.pending, time: animation.currentTime, startTime: animation.startTime })).catch(() => {});
      }
      return animation;
    };
`;
  const sampler = `      let started = false;
      const sample = (at) => {
        const sampleStartedAt = performance.now();
        const overlay = document.querySelector('.robys-takeaway-entry');
        const content = overlay?.querySelector('.robys-takeaway-content');
        if (!content) return;
        const state = document.documentElement.dataset.robysEntryState;
        if (${JSON.stringify(variant)} === 'metadata' && !started && entranceAnimation?.pending === true && entranceAnimation.currentTime === 0) {
          probe.frames.push({ at, sampleStartedAt, sampleEndedAt: performance.now(), state,
            styleSampled: false, transform: null, opacity: null, overlayOpacity: null, overlayTransform: null,
            entrancePending: entranceAnimation.pending, entranceTime: entranceAnimation.currentTime, entranceState: entranceAnimation.playState });
          if (probe.frames.length < 240) requestAnimationFrame(sample);
          return;
        }
        const beforeStyle = performance.now();
        const style = getComputedStyle(content);
        const afterStyleHandle = performance.now();
        const surface = getComputedStyle(overlay);
        const afterSurfaceHandle = performance.now();
        const entrance = ${JSON.stringify(variant)} === 'baseline' ? content.getAnimations()[0] : entranceAnimation;
        const afterAnimationLookup = performance.now();
        const transform = style.transform;
        const afterTransform = performance.now();
        const opacity = Number(style.opacity);
        const afterOpacity = performance.now();
        const overlayOpacity = Number(surface.opacity);
        const overlayTransform = surface.transform;
        const afterSurfaceProperties = performance.now();
        const entrancePending = entrance?.pending, entranceTime = entrance?.currentTime, entranceState = entrance?.playState;
        if (entrancePending === false && entranceTime > 0 && opacity > 0) started = true;
        probe.frames.push({ at, sampleStartedAt, sampleEndedAt: performance.now(), state, styleSampled: true,
          transform, opacity, overlayOpacity, overlayTransform, entrancePending, entranceTime, entranceState,
          operations: { styleHandleMs: afterStyleHandle - beforeStyle, surfaceHandleMs: afterSurfaceHandle - afterStyleHandle,
            animationLookupMs: afterAnimationLookup - afterSurfaceHandle, transformReadMs: afterTransform - afterAnimationLookup,
            opacityReadMs: afterOpacity - afterTransform, surfaceReadMs: afterSurfaceProperties - afterOpacity } });
        if (probe.frames.length < 240) requestAnimationFrame(sample);
      };
`;
  const hook = '    let sampling = false;\n';
  const start = original.indexOf('      const sample = (at) => {');
  const end = original.indexOf('      requestAnimationFrame(sample);\n    });', start);
  if (original.split(hook).length !== 2 || start < 0 || end < 0) throw new Error('Original sampler boundary changed');
  const derived = (original.slice(0, start) + sampler + original.slice(end)).replace(hook, hook + wrapper);
  const file = path.join(temporary, variant + '.mjs');
  writeFileSync(file, derived);
  writeFileSync(path.join(directory, variant + '-helper.mjs'), derived);
  report.helpers[variant] = { sha256: hash(derived), originalSampleSha256: hash(original.slice(start, end)) };
  return file;
}

try {
  const contexts = {};
  for (const variant of ['baseline', 'metadata']) contexts[variant] = (await import(pathToFileURL(derive(variant)))).contextFor;
  const order = Array.from({ length: 3 }, () => ['baseline', 'metadata', 'metadata', 'baseline']).flat();
  for (const [index, variant] of order.entries()) {
    const resultsDir = path.join(directory, `case-${index}`);
    const observation = { index, variant, collected: false, originalGatePassed: null };
    observations.push(observation);
    try {
      await certify({ port: 4240 + index, resultsDir, contract: 'STARTUP-OBSERVER-COMPARISON-COLLECTION' }, async ({ browser, baseUrl }) => {
        observation.browser = browser.version();
        const context = await contexts[variant](browser);
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        await session.send('Performance.enable');
        const beforeMetrics = await session.send('Performance.getMetrics');
        try {
          await page.goto(baseUrl + '?entry=morning', { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => {
            const frames = globalThis.__takeawayProbe?.frames ?? [];
            const first = frames.findIndex(frame => frame.state === 'brand-frame' && frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
            return first >= 0 && frames.length >= first + 24;
          }, undefined, { timeout: 1800 });
          const appearance = await brand(page);
          const probe = await done(page);
          const afterMetrics = await session.send('Performance.getMetrics');
          save(resultsDir, 'raw-probe.json', probe);
          save(resultsDir, 'appearance.json', appearance);
          save(resultsDir, 'performance.json', { before: beforeMetrics.metrics, after: afterMetrics.metrics });
          const firstIndex = probe.frames.findIndex(frame => frame.state === 'brand-frame' && frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
          const first = probe.frames[firstIndex], next = probe.frames[firstIndex + 1];
          const origin = probe.events.find(event => event.state === 'brand-frame');
          observation.firstVisibleRafMs = first ? first.at - origin.at : null;
          observation.firstVisibleObservedMs = first ? first.sampleEndedAt - origin.at : null;
          observation.nextCallbackEndMs = next ? next.sampleEndedAt - origin.at : null;
          observation.readyMs = probe.animation.ready[0]?.at - origin.at;
          observation.longTasks = probe.longTasks;
          observation.firstSamples = probe.frames.slice(0, firstIndex + 2);
          const frames = probe.frames.slice(firstIndex, firstIndex + 24);
          const intervals = frames.slice(1).map((frame, i) => frame.at - frames[i].at).sort((a, b) => a - b);
          let longestIdenticalRun = 1, run = 1, changes = 0;
          for (let i = 1; i < frames.length; i++) {
            if (frames[i].transform === frames[i - 1].transform) longestIdenticalRun = Math.max(longestIdenticalRun, ++run);
            else { changes++; run = 1; }
          }
          observation.visible = { count: frames.length, uniqueTransforms: new Set(frames.map(frame => frame.transform)).size,
            changes, longestIdenticalRun, medianRafMs: intervals[Math.floor(intervals.length / 2)],
            opacityMonotone: frames.every((frame, i) => i === 0 || frame.opacity + .002 >= frames[i - 1].opacity),
            allStylesSampled: frames.every(frame => frame.styleSampled) };
          observation.performance = afterMetrics.metrics.filter(metric => ['LayoutCount', 'LayoutDuration', 'RecalcStyleCount', 'RecalcStyleDuration', 'TaskDuration'].includes(metric.name));
          try { assertBrand(appearance); timing(probe, 'cold', 'morning'); observation.appearanceAndTimingPassed = true; }
          catch (error) { observation.appearanceAndTimingPassed = false; observation.appearanceAndTimingError = error.message; }
          if (variant === 'baseline') {
            try { cadence(probe); observation.originalGatePassed = true; }
            catch (error) { observation.originalGatePassed = false; observation.originalGateError = error.message; }
          }
          observation.collected = firstIndex >= 0;
        } finally { await session.detach(); await context.close(); }
      });
    } catch (error) { observation.collectionError = error.stack ?? String(error); }
    save(directory, 'matrix.json', report);
    console.log(JSON.stringify({ index, variant, collected: observation.collected, firstVisibleRafMs: observation.firstVisibleRafMs,
      firstVisibleObservedMs: observation.firstVisibleObservedMs, nextCallbackEndMs: observation.nextCallbackEndMs,
      originalGatePassed: observation.originalGatePassed, error: observation.collectionError }));
  }
} finally { save(directory, 'matrix.json', report); rmSync(temporary, { recursive: true, force: true }); }
if (observations.length !== 12 || observations.some(observation => !observation.collected || observation.collectionError)) process.exitCode = 1;
