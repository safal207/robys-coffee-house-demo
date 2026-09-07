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
const parentBytes = file => execFileSync('git', ['show', `${runtimeParent}:${file}`], { maxBuffer: 32 * 1024 * 1024 });
const publicFiles = ['index.html', 'styles-v2.css', 'bootstrap-v2.js', 'takeaway-entry.js', 'app.js', 'qa.js', 'order-launcher.js'];
const runtimeHashes = Object.fromEntries(publicFiles.map(file => {
  const actual = hash(readFileSync(file));
  if (actual !== hash(parentBytes(file))) throw new Error(`Working runtime differs from failing PR: ${file}`);
  return [file, actual];
}));
const trackedChanges = execFileSync('git', ['diff', runtimeParent, '--name-only'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
if (trackedChanges.some(file => !file.startsWith('scripts/') && !file.startsWith('.github/') && file !== '.qa-dock-order-launcher.js')) {
  throw new Error(`Unexpected tracked changes outside diagnostic scope: ${trackedChanges.join(', ')}`);
}
const original = readFileSync('scripts/takeaway-browser-contract.mjs', 'utf8');
if (hash(original) !== hash(parentBytes('scripts/takeaway-browser-contract.mjs'))) throw new Error('Original release helper changed');
const bodies = {
  baseline: parentBytes('order-launcher.js'),
  'batched-dock': readFileSync('.qa-dock-order-launcher.js')
};
if (hash(bodies.baseline) === hash(bodies['batched-dock'])) throw new Error('Candidate fixture is identical to baseline');
const temporary = mkdtempSync(path.join(process.cwd(), '.startup-dock-'));
const observations = [];
const metricNames = ['LayoutCount', 'LayoutDuration', 'RecalcStyleCount', 'RecalcStyleDuration', 'TaskDuration'];
const order = Array.from({ length: 3 }, () => ['baseline', 'batched-dock', 'batched-dock', 'baseline']).flat();
const report = {
  boundary: 'Controlled dock implementation comparison; collection success is not product acceptance or pixel-presentation proof. ABBA repeated three times with a fresh Chromium process for every case. Both arms use the original release sampler and original appearance-check order, with identical callback start/end timestamps and CDP metrics. No animation wrapper, removed style reads, changed timing limits, dropped frames or CPU tracing. The only response-body treatment is order-launcher.js; both arms intercept that request identically, so routing/cache effects are shared. Candidate bytes exist only in a diagnostic fixture and the fulfilled response, never in the served runtime file.',
  runtimeParent, runtimeHashes, trackedChanges, originalHelperSha256: hash(original),
  diagnosticScriptSha256: hash(readFileSync(new URL(import.meta.url))), order,
  responses: Object.fromEntries(Object.entries(bodies).map(([variant, body]) => [variant, { path: '/order-launcher.js', bytes: body.length, sha256: hash(body) }])),
  observations
};

function derive() {
  const start = '      const sample = (at) => {\n';
  const push = original.split('\n').find(line => line.includes('probe.frames.push({ at,'));
  if (original.split(start).length !== 2 || !push || original.split(push).length !== 2) throw new Error('Original sampler boundary changed');
  const derived = original.replace(start, start + '        const sampleStartedAt = performance.now();\n')
    .replace(push, push + '\n        Object.assign(probe.frames[probe.frames.length - 1], { sampleStartedAt, sampleEndedAt: performance.now() });');
  const file = path.join(temporary, 'helper.mjs');
  writeFileSync(file, derived);
  writeFileSync(path.join(directory, 'shared-helper.mjs'), derived);
  report.sharedHelperSha256 = hash(derived);
  return file;
}

function summarize(probe) {
  const origin = probe.events.find(event => event.state === 'brand-frame');
  const firstIndex = probe.frames.findIndex(frame => frame.state === 'brand-frame' && frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
  const first = firstIndex >= 0 ? probe.frames[firstIndex] : undefined;
  const next = firstIndex >= 0 ? probe.frames[firstIndex + 1] : undefined;
  const frames = firstIndex >= 0 ? probe.frames.slice(firstIndex, firstIndex + 24) : [];
  const intervals = frames.slice(1).map((frame, i) => frame.at - frames[i].at).sort((a, b) => a - b);
  let longestIdenticalRun = frames.length ? 1 : 0, run = longestIdenticalRun, changes = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].transform === frames[i - 1].transform) longestIdenticalRun = Math.max(longestIdenticalRun, ++run);
    else { changes++; run = 1; }
  }
  return {
    firstVisibleRafMs: first && origin ? first.at - origin.at : null,
    firstVisibleObservedMs: first && origin ? first.sampleEndedAt - origin.at : null,
    nextCallbackEndMs: next && origin ? next.sampleEndedAt - origin.at : null,
    firstSamples: firstIndex >= 0 ? probe.frames.slice(0, firstIndex + 2) : probe.frames,
    visible: { count: frames.length, uniqueTransforms: new Set(frames.map(frame => frame.transform)).size,
      changes, longestIdenticalRun, medianRafMs: intervals.length ? intervals[Math.floor(intervals.length / 2)] : null,
      opacityMonotone: frames.length > 0 && frames.every((frame, i) => i === 0 || frame.opacity + .002 >= frames[i - 1].opacity),
      allBrandFrames: frames.length > 0 && frames.every(frame => frame.state === 'brand-frame'), frames },
    collected: Boolean(origin && first && next && Number.isFinite(first.sampleEndedAt))
  };
}

try {
  const contextFor = (await import(pathToFileURL(derive()))).contextFor;
  for (const [index, variant] of order.entries()) {
    const resultsDir = path.join(directory, `case-${index}`);
    const observation = { index, variant, collected: false, originalGatePassed: null, routeFulfillments: [] };
    observations.push(observation);
    try {
      await certify({ port: 4260 + index, resultsDir, contract: 'STARTUP-DOCK-COMPARISON-COLLECTION' }, async ({ browser, baseUrl }) => {
        observation.browser = browser.version();
        const context = await contextFor(browser);
        let page, session, beforeMetrics;
        try {
          await context.route(url => url.pathname === '/order-launcher.js', async route => {
            const request = route.request();
            if (request.method() !== 'GET') throw new Error('Unexpected method for order launcher');
            await route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'cache-control': 'no-store' }, body: bodies[variant] });
            observation.routeFulfillments.push({ path: new URL(request.url()).pathname, sha256: hash(bodies[variant]), bytes: bodies[variant].length });
          });
          page = await context.newPage();
          session = await context.newCDPSession(page);
          await session.send('Performance.enable');
          beforeMetrics = await session.send('Performance.getMetrics');
          await page.goto(baseUrl + '?entry=morning', { waitUntil: 'domcontentloaded' });
          // Preserve the actual release call order; appearance reads are part of
          // both conditions and must not be moved behind an animation barrier.
          const appearance = await brand(page);
          const probe = await done(page);
          const afterMetrics = await session.send('Performance.getMetrics');
          save(resultsDir, 'raw-probe.json', probe);
          save(resultsDir, 'appearance.json', appearance);
          const before = new Map(beforeMetrics.metrics.map(metric => [metric.name, metric.value]));
          const after = new Map(afterMetrics.metrics.map(metric => [metric.name, metric.value]));
          const deltas = metricNames.map(name => ({ name, value: before.has(name) && after.has(name) ? after.get(name) - before.get(name) : null }));
          save(resultsDir, 'performance.json', { before: beforeMetrics.metrics, after: afterMetrics.metrics, deltas });
          Object.assign(observation, summarize(probe));
          observation.performance = deltas;
          try { assertBrand(appearance); observation.appearancePassed = true; }
          catch (error) { observation.appearancePassed = false; observation.appearanceError = error.message; }
          try { observation.timing = timing(probe, 'cold', 'morning'); observation.timingPassed = true; }
          catch (error) { observation.timingPassed = false; observation.timingError = error.message; }
          try { observation.cadence = cadence(probe); observation.originalGatePassed = true; }
          catch (error) { observation.originalGatePassed = false; observation.originalGateError = error.message; }
          if (observation.routeFulfillments.length === 0) throw new Error('Order launcher treatment was not requested');
        } catch (error) {
          if (page && !page.isClosed()) {
            try { save(resultsDir, 'partial-probe.json', await page.evaluate(() => globalThis.__takeawayProbe ?? null)); }
            catch { /* The original collection error remains authoritative. */ }
          }
          throw error;
        } finally {
          await session?.detach().catch(() => {});
          await context.close();
        }
      });
    } catch (error) { observation.collectionError = error.stack ?? String(error); }
    save(directory, 'matrix.json', report);
    console.log(JSON.stringify({ index, variant, collected: observation.collected, firstVisibleRafMs: observation.firstVisibleRafMs,
      firstVisibleObservedMs: observation.firstVisibleObservedMs, nextCallbackEndMs: observation.nextCallbackEndMs,
      originalGatePassed: observation.originalGatePassed, error: observation.collectionError }));
  }
} finally { save(directory, 'matrix.json', report); rmSync(temporary, { recursive: true, force: true }); }
if (observations.length !== 12 || observations.some(observation => !observation.collected || observation.collectionError)) process.exitCode = 1;
