import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Diagnostic ablations only. They are never substituted for the original gate.
const variants = ['baseline', 'no-shadows', 'no-filters', 'flat', 'contain', 'no-covered'];
const out = path.resolve(process.env.CONTEXTUAL_PROBE_RESULTS_DIR ?? 'visual-results/contextual-probe');
mkdirSync(out, { recursive: true });
process.env.CONTEXTUAL_ENTRY_RESULTS_DIR = out;
process.env.CONTEXTUAL_ENTRY_PORT = '4196';
const source = readFileSync('scripts/contextual-entry-smoke.mjs', 'utf8');
const boundary = '\nrmSync(resultsDir, { recursive: true, force: true });';
if (source.split(boundary).length !== 2) throw new Error('Original gate execution boundary changed');
const prefix = source.split(boundary)[0];
const hook = 'async function installEventProbe(context) {';
const insertion = '\n  await installAblation(context, selectedVariant);';
if (prefix.split(hook).length !== 2) throw new Error('Original gate probe boundary changed');
const derived = prefix.replace(hook, hook + insertion);
if (derived.replace(insertion, '') !== prefix) throw new Error('Original gate functions changed');
const suffix = `
let selectedVariant = 'baseline';
function selectVariant(value) { selectedVariant = value; diagnostics.scenes = {}; }
async function installAblation(context, variant) {
  await context.addInitScript(variant => {
    window.addEventListener('robys:entry-state', event => {
      if (event.detail.state !== 'brand-frame') return;
      const overlay = document.querySelector('.robys-contextual-entry');
      if (!overlay) return;
      const elements = [overlay, ...overlay.querySelectorAll('*')];
      if (variant === 'no-shadows') for (const node of elements) node.style.boxShadow = 'none';
      if (variant === 'no-filters') for (const node of elements) node.style.filter = 'none';
      if (variant === 'flat') {
        const stage = overlay.querySelector('.robys-entry-scene-stage');
        stage.style.perspective = 'none'; stage.style.transformStyle = 'flat';
      }
      if (variant === 'contain') overlay.style.contain = 'layout paint';
      if (variant === 'no-covered') for (const node of document.body.children) {
        if (node !== overlay) node.style.visibility = 'hidden';
      }
    });
  }, variant);
}
export { captureScene, measureCold, startServer, waitForServer, diagnostics, selectVariant };
`;
const hash = text => createHash('sha256').update(text).digest('hex');
const temporary = mkdtempSync(path.join(process.cwd(), '.contextual-probe-'));
const modulePath = path.join(temporary, 'runtime.mjs');
writeFileSync(modulePath, derived + suffix);
const report = {
  scope: 'Diagnostic layer ablations; original 18-frame assertions retained. Not an acceptance gate or visual approval.',
  sourceScriptSha256: hash(source), derivedScriptSha256: hash(derived + suffix),
  variants, rounds: 2, observations: [], environments: [], status: 'RUNNING'
};
const save = () => writeFileSync(path.join(out, 'layer-probe.json'), JSON.stringify(report, null, 2) + '\n');
let server, browser;
try {
  const gate = await import(pathToFileURL(modulePath));
  report.sourceSha = gate.diagnostics.sourceSha;
  writeFileSync(path.join(out, 'derived-runtime.mjs'), derived + suffix);
  server = gate.startServer();
  // Drain request logs throughout this longer diagnostic matrix to avoid pipe backpressure.
  server.stdout.resume();
  server.stderr.resume();
  await gate.waitForServer();
  for (let round = 0; round < 2; round++) {
    for (const variant of round ? [...variants].reverse() : variants) {
      gate.selectVariant(variant);
      browser = await chromium.launch({ headless: true });
      const session = await browser.newBrowserCDPSession();
      const { gpu } = await session.send('SystemInfo.getInfo');
      report.environments.push({ round, variant, browser: browser.version(),
        devices: gpu.devices, renderer: gpu.auxAttributes?.glRenderer, featureStatus: gpu.featureStatus });
      // Preserve the original two cold launches before the measured scene pair.
      const coldDurations = {};
      for (const scene of ['day', 'night']) {
        try { coldDurations[scene] = await gate.measureCold(browser, scene); }
        catch (error) { coldDurations[scene] = { error: error.message }; }
        finally { for (const context of browser.contexts()) await context.close(); }
      }
      for (const scene of ['day', 'night']) {
        let error = null;
        try { await gate.captureScene(browser, scene); }
        catch (caught) { error = caught.message; }
        finally { for (const context of browser.contexts()) await context.close(); }
        const measured = structuredClone(gate.diagnostics.scenes[scene] ?? null);
        const row = { round, variant, scene, coldDurations, error, measured };
        report.observations.push(row); save();
        console.log(JSON.stringify({ round, variant, scene, error,
          median: measured?.smoothness?.medianFrameIntervalMs,
          unique: measured?.smoothness?.uniqueTransforms }));
      }
      await browser.close(); browser = null;
    }
  }
  const complete = report.observations.length === 24
    && report.observations.every(row => row.measured?.smoothness?.samples?.length === 18);
  report.status = complete ? 'COLLECTED' : 'INCOMPLETE'; save();
  if (!complete) throw new Error('Layer probe did not obtain every required frame sample');
} finally {
  await browser?.close(); server?.kill();
  rmSync(temporary, { recursive: true, force: true });
}
