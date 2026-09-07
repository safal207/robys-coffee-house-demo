import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { certify, contextFor, brand, assertBrand, done, timing, cadence, save } from './takeaway-browser-contract.mjs';

const directory = path.resolve('.artifacts/guest-startup');
const observations = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const runtimeParent = '8b1613abc250919d66b2173249b87f417c925883';
const publicFiles = ['index.html', 'styles-v2.css', 'bootstrap-v2.js', 'takeaway-entry.js', 'app.js', 'qa.js'];
const runtimeHashes = Object.fromEntries(publicFiles.map(file => [file, hash(readFileSync(file))]));
const runtimeDiff = execFileSync('git', ['diff', runtimeParent, 'HEAD', '--', ...publicFiles], { encoding: 'utf8' });
if (runtimeDiff) throw new Error('Diagnostic runtime differs from the failing PR');
const boundary = 'Diagnostic collection, not acceptance. Each observation launches a fresh Chromium process. Original sampler and gates are unchanged. Tracing/observer overhead is present; traced times do not replace ordinary CI failures.';

for (let index = 0; index < 6; index++) {
  const traced = index % 2 === 1;
  const resultsDir = path.join(directory, `case-${index}`);
  const observation = { index, traced, collected: false, gatePassed: false };
  observations.push(observation);
  try {
    await certify({ port: 4232 + index, resultsDir, contract: 'STARTUP-DIAGNOSTIC-COLLECTION' }, async ({ browser, baseUrl }) => {
      observation.browser = browser.version();
      const context = await contextFor(browser);
      await context.addInitScript(() => {
        const diagnostic = window.__startupDiagnostic = { longTasks: [], marks: [] };
        new PerformanceObserver(list => {
          diagnostic.longTasks.push(...list.getEntries().map(entry => ({ at: entry.startTime, duration: entry.duration })));
        }).observe({ type: 'longtask', buffered: true });
        window.addEventListener('robys:entry-state', event => {
          performance.mark('guest-startup:' + event.detail.state);
          if (event.detail.state !== 'brand-frame') return;
          const observe = () => {
            const frame = window.__takeawayProbe.frames.at(-1);
            if (frame?.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0) {
              performance.mark('guest-startup:first-visible');
            } else if (document.documentElement.dataset.robysEntryState === 'brand-frame') requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        });
      });
      let session;
      if (traced) {
        session = await browser.newBrowserCDPSession();
        await session.send('Tracing.start', {
          transferMode: 'ReturnAsStream', streamFormat: 'json',
          categories: 'toplevel,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz,renderer.scheduler,skia'
        });
      }
      const page = await context.newPage();
      try {
        await page.goto(baseUrl + '?entry=morning', { waitUntil: 'domcontentloaded' });
        const appearance = await brand(page);
        const probe = await done(page);
        save(resultsDir, 'appearance.json', appearance);
        save(resultsDir, 'raw-probe.json', probe);
        const diagnostic = await page.evaluate(() => ({
          ...window.__startupDiagnostic,
          resources: performance.getEntriesByType('resource').map(entry => ({ name: new URL(entry.name).pathname, start: entry.startTime, duration: entry.duration })),
          marks: performance.getEntriesByType('mark').filter(entry => entry.name.startsWith('guest-startup:')).map(entry => ({ name: entry.name, at: entry.startTime }))
        }));
        save(resultsDir, 'startup.json', diagnostic);
        const first = probe.frames.find(frame => frame.state === 'brand-frame' && frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
        const started = probe.events.find(event => event.state === 'brand-frame');
        observation.startupMs = first ? first.at - started.at : null;
        observation.longTasks = diagnostic.longTasks;
        try {
          assertBrand(appearance); timing(probe, 'cold', 'morning');
          observation.cadence = cadence(probe);
          observation.gatePassed = true;
        } catch (error) { observation.gateError = error.message; }
        observation.collected = true;
      } finally {
        if (session) {
          const completed = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
          await session.send('Tracing.end');
          const result = await completed;
          if (!result.stream || result.dataLossOccurred) throw new Error('Trace is missing or reports data loss');
          const file = path.join(resultsDir, 'trace.json');
          writeFileSync(file, '');
          try {
            for (;;) {
              const chunk = await session.send('IO.read', { handle: result.stream });
              appendFileSync(file, chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data);
              if (chunk.eof) break;
            }
          } finally { await session.send('IO.close', { handle: result.stream }); }
          const bytes = readFileSync(file);
          observation.trace = { file: `case-${index}/trace.json`, bytes: bytes.length, sha256: hash(bytes), dataLossOccurred: false };
        }
        await context.close();
      }
    });
  } catch (error) { observation.collectionError = error.stack ?? String(error); }
  save(directory, 'matrix.json', { boundary, runtimeParent, runtimeHashes, observations });
  console.log(JSON.stringify({ index, traced, collected: observation.collected, gatePassed: observation.gatePassed, startupMs: observation.startupMs, gateError: observation.gateError, collectionError: observation.collectionError }));
}
if (observations.some(observation => !observation.collected || observation.collectionError)) process.exitCode = 1;
