import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { certify, brand, assertBrand, done, timing, cadence, save } from './takeaway-browser-contract.mjs';

// The workflow executes this diagnostic-owned file with cwd at a separately
// checked-out product commit. Never serve fixture/intercepted product responses.
const candidate = 'd0a88b4f6f8d4c8be385805f710ee24923979b78';
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (sourceHead !== candidate) throw new Error(`Expected product cwd ${candidate}, got ${sourceHead}`);
const hash = value => createHash('sha256').update(value).digest('hex');
const candidateBytes = file => execFileSync('git', ['show', `${candidate}:${file}`], { maxBuffer: 32 * 1024 * 1024 });
const publicFiles = ['index.html', 'styles-v2.css', 'bootstrap-v2.js', 'takeaway-entry.js', 'app.js', 'qa.js', 'order-launcher.js'];
const runtimeHashes = Object.fromEntries(publicFiles.map(file => {
  const actual = hash(readFileSync(file));
  if (actual !== hash(candidateBytes(file))) throw new Error(`Product working bytes differ from candidate: ${file}`);
  return [file, actual];
}));
const original = readFileSync(new URL('./takeaway-browser-contract.mjs', import.meta.url), 'utf8');
const productHelper = readFileSync('scripts/takeaway-browser-contract.mjs');
if (hash(original) !== hash(productHelper) || hash(productHelper) !== hash(candidateBytes('scripts/takeaway-browser-contract.mjs'))) {
  throw new Error('Diagnostic and candidate release helpers must be byte-identical');
}
const trackedChanges = execFileSync('git', ['diff', candidate, '--name-only'], { encoding: 'utf8' }).trim();
if (trackedChanges) throw new Error(`Candidate has tracked working changes: ${trackedChanges}`);
const directory = path.resolve('.artifacts/guest-startup');
mkdirSync(directory, { recursive: true });
const temporary = mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.startup-final-'));
const observations = [];
const report = {
  boundary: 'Final bounded confidence on one actual product commit: six fresh Chromium processes, original release appearance-call order, original release sampler and cadence limits, plus a separate <=150ms actual sample-end startup requirement. No routed/fixture response bodies, animation wrapper, dropped samples, CDP metrics or CPU tracing. A successful bounded matrix does not certify physical pixel presentation, all devices or native Android.',
  candidate, sourceHead, runtimeHashes, originalHelperSha256: hash(original),
  diagnosticScriptSha256: hash(readFileSync(new URL(import.meta.url))), expectedCases: 6, observations
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

try {
  const contextFor = (await import(pathToFileURL(derive()))).contextFor;
  for (let index = 0; index < report.expectedCases; index++) {
    const resultsDir = path.join(directory, `case-${index}`);
    const observation = { index, collected: false, appearancePassed: false, timingPassed: false, originalGatePassed: false, actualStartupPassed: false };
    observations.push(observation);
    try {
      await certify({ port: 4300 + index, resultsDir, contract: 'STARTUP-FINAL-CANDIDATE-CONFIDENCE' }, async ({ browser, baseUrl }) => {
        observation.browser = browser.version();
        const context = await contextFor(browser);
        let page;
        try {
          page = await context.newPage();
          await page.goto(baseUrl + '?entry=morning', { waitUntil: 'domcontentloaded' });
          const appearance = await brand(page);
          const probe = await done(page);
          save(resultsDir, 'raw-probe.json', probe);
          save(resultsDir, 'appearance.json', appearance);
          const origin = probe.events.find(event => event.state === 'brand-frame');
          const firstIndex = probe.frames.findIndex(frame => frame.state === 'brand-frame' && frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
          const first = firstIndex >= 0 ? probe.frames[firstIndex] : undefined;
          const next = firstIndex >= 0 ? probe.frames[firstIndex + 1] : undefined;
          observation.firstVisibleRafMs = first && origin ? first.at - origin.at : null;
          observation.firstVisibleObservedMs = first && origin ? first.sampleEndedAt - origin.at : null;
          observation.nextCallbackEndMs = next && origin ? next.sampleEndedAt - origin.at : null;
          observation.firstSamples = firstIndex >= 0 ? probe.frames.slice(0, firstIndex + 2) : probe.frames;
          observation.collected = Boolean(first && origin && Number.isFinite(first.sampleEndedAt));
          observation.actualStartupPassed = observation.collected && observation.firstVisibleObservedMs >= 0 && observation.firstVisibleObservedMs <= 150;
          try { assertBrand(appearance); observation.appearancePassed = true; }
          catch (error) { observation.appearanceError = error.message; }
          try { observation.timing = timing(probe, 'cold', 'morning'); observation.timingPassed = true; }
          catch (error) { observation.timingError = error.message; }
          try { observation.cadence = cadence(probe); observation.originalGatePassed = true; }
          catch (error) { observation.originalGateError = error.message; }
          save(resultsDir, 'observation.json', observation);
          if (!observation.collected || !observation.appearancePassed || !observation.timingPassed || !observation.originalGatePassed || !observation.actualStartupPassed) {
            throw new Error(`Candidate gates failed: appearance=${observation.appearancePassed}, timing=${observation.timingPassed}, originalCadence=${observation.originalGatePassed}, actualStartup=${observation.actualStartupPassed} (${observation.firstVisibleObservedMs}ms)`);
          }
        } catch (error) {
          if (page && !page.isClosed()) {
            try { save(resultsDir, 'partial-probe.json', await page.evaluate(() => globalThis.__takeawayProbe ?? null)); }
            catch { /* Keep the original failure when the document is unavailable. */ }
          }
          throw error;
        } finally { await context.close(); }
      });
    } catch (error) { observation.failure = error.stack ?? String(error); }
    save(directory, 'matrix.json', report);
    console.log(JSON.stringify({ index, collected: observation.collected, originalGatePassed: observation.originalGatePassed,
      actualStartupPassed: observation.actualStartupPassed, firstVisibleRafMs: observation.firstVisibleRafMs,
      firstVisibleObservedMs: observation.firstVisibleObservedMs, nextCallbackEndMs: observation.nextCallbackEndMs,
      error: observation.failure }));
  }
} finally {
  report.passed = observations.length === report.expectedCases && observations.every(observation => observation.collected && observation.appearancePassed && observation.timingPassed && observation.originalGatePassed && observation.actualStartupPassed && !observation.failure);
  save(directory, 'matrix.json', report);
  rmSync(temporary, { recursive: true, force: true });
}
if (!report.passed) process.exitCode = 1;
