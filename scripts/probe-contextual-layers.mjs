import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Diagnostic ablations only. They are never substituted for the original gate.
const suite = process.env.CONTEXTUAL_PROBE_SUITE ?? 'optics';
const suites = {
  optics: ['baseline', 'no-shadows', 'no-filters', 'flat', 'contain', 'no-covered'],
  surfaces: ['baseline', 'clip-surface', 'foreground-cache', 'backface', 'isolation-auto'],
  frontfaces: ['baseline', 'reverse-visible']
};
if (!Object.hasOwn(suites, suite)) throw new Error('Unknown bounded contextual probe suite');
const variants = suites[suite];
const rounds = suite === 'frontfaces' ? 4 : 2;
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
      if (variant === 'clip-surface') overlay.style.clipPath = 'inset(0)';
      if (variant === 'foreground-cache') {
        overlay.querySelector('.robys-entry-foreground-occluder').style.willChange = 'transform, opacity, filter';
      }
      if (variant === 'backface') for (const node of overlay.querySelectorAll('*')) node.style.backfaceVisibility = 'hidden';
      if (variant === 'reverse-visible') for (const node of overlay.querySelectorAll('*')) node.style.backfaceVisibility = 'visible';
      if (variant === 'isolation-auto') {
        overlay.style.isolation = 'auto';
        overlay.querySelector('.robys-entry-logo-stage').style.isolation = 'auto';
      }
      if (variant === 'no-covered') for (const node of document.body.children) {
        if (node !== overlay) node.style.visibility = 'hidden';
      }
    });
  }, variant);
}
export { captureScene, measureCold, startServer, waitForServer, diagnostics, selectVariant, installEventProbe };
`;
const hash = text => createHash('sha256').update(text).digest('hex');
const temporary = mkdtempSync(path.join(process.cwd(), '.contextual-probe-'));
const modulePath = path.join(temporary, 'runtime.mjs');
writeFileSync(modulePath, derived + suffix);
const report = {
  scope: 'Diagnostic layer ablations; original 18-frame assertions retained. Not an acceptance gate or visual approval.',
  probeScriptSha256: hash(readFileSync('scripts/probe-contextual-layers.mjs')),
  sourceScriptSha256: hash(source), derivedScriptSha256: hash(derived + suffix),
  suite, variants, rounds, observations: [], environments: [], status: 'RUNNING'
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
  for (let round = 0; round < rounds; round++) {
    for (const variant of round % 2 ? [...variants].reverse() : variants) {
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
  const complete = report.observations.length === rounds * variants.length * 2
    && report.observations.every(row => row.measured?.smoothness?.samples?.length === 18);
  report.status = complete ? 'COLLECTED' : 'INCOMPLETE'; save();
  if (!complete) throw new Error('Layer probe did not obtain every required frame sample');
  if (suite !== 'optics') {
    const { PNG } = createRequire(import.meta.url)('pngjs');
    // Separate fixed-pose appearance check; never used as a timing sample.
    report.visualStatus = 'RUNNING'; report.visualComparisons = []; save();
    report.visualProtocol = 'Pause entry animations at creation before first paint; freeze lifecycle timers only for fixed-pose capture.';
    browser = await chromium.launch({ headless: true });
    for (const scene of ['day', 'night']) for (const fraction of [.2, .6, .9]) {
      let baseline;
      for (const variant of [...variants, 'baseline-control']) {
        gate.selectVariant(variant === 'baseline-control' ? 'baseline' : variant);
        const context = await browser.newContext({ viewport: { width: 390, height: 844 },
          locale: 'tr-TR', timezoneId: 'Europe/Istanbul', reducedMotion: 'no-preference', serviceWorkers: 'block' });
        try {
          await gate.installEventProbe(context);
          await context.addInitScript(fraction => {
            const animate = Element.prototype.animate;
            Element.prototype.animate = function(...args) {
              const animation = animate.apply(this, args);
              if (this.closest('.robys-contextual-entry')) {
                animation.pause(); animation.currentTime = animation.effect.getTiming().duration * fraction;
              }
              return animation;
            };
            const timers = new Set();
            const schedule = window.setTimeout.bind(window);
            let frozen = false;
            window.setTimeout = (callback, delay, ...args) => {
              const id = schedule(() => { if (!frozen && typeof callback === 'function') callback(...args); }, delay);
              timers.add(id); return id;
            };
            window.__freezeEntryCapture = () => { frozen = true; for (const id of timers) clearTimeout(id); };
          }, fraction);
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:4196/?entry=${scene}`, { waitUntil: 'domcontentloaded' });
          const overlay = page.locator('.robys-contextual-entry');
          await overlay.waitFor({ state: 'visible', timeout: 1500 });
          await page.evaluate(async fraction => {
            window.__freezeEntryCapture();
            const overlay = document.querySelector('.robys-contextual-entry');
            const animations = overlay.getAnimations({ subtree: true });
            if (animations.length !== 7) throw new Error('Expected seven animations for fixed-pose comparison');
            for (const animation of animations) {
              animation.pause(); animation.currentTime = animation.effect.getTiming().duration * fraction;
            }
            await Promise.all([...overlay.querySelectorAll('img')].map(image => image.decode()));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }, fraction);
          const filename = `${scene}-${fraction}-${variant}.png`;
          const bytes = await overlay.screenshot({ path: path.join(out, filename) });
          const state = await page.evaluate(() => {
            const overlay = document.querySelector('.robys-contextual-entry');
            return { entry: document.documentElement.dataset.robysEntryState,
              opacity: overlay && getComputedStyle(overlay).opacity,
              animations: overlay?.getAnimations({ subtree: true }).map(animation => animation.playState) };
          });
          if (state.entry !== 'brand-frame' || state.opacity !== '1' || state.animations?.length !== 7
              || state.animations.some(value => value !== 'paused')) throw new Error('Fixed-pose capture escaped held brand frame');
          const png = PNG.sync.read(bytes);
          if (variant === 'baseline') baseline = { png, filename, sha256: hash(bytes) };
          else {
            if (png.width !== baseline.png.width || png.height !== baseline.png.height) throw new Error('Fixed-pose dimensions changed');
            let changedPixels = 0, maxChannelDelta = 0;
            for (let i = 0; i < png.data.length; i += 4) {
              let changed = false;
              for (let channel = 0; channel < 4; channel++) {
                const delta = Math.abs(png.data[i + channel] - baseline.png.data[i + channel]);
                changed ||= delta !== 0; maxChannelDelta = Math.max(maxChannelDelta, delta);
              }
              changedPixels += Number(changed);
            }
            const row = { scene, fraction, variant, width: png.width, height: png.height,
              changedPixels, maxChannelDelta, filename, sha256: hash(bytes),
              baselineFilename: baseline.filename, baselineSha256: baseline.sha256 };
            report.visualComparisons.push(row); save();
            console.log(JSON.stringify({ visual: true, ...row }));
          }
        } finally { await context.close(); }
      }
    }
    report.visualStatus = report.visualComparisons.length === variants.length * 6
      && report.visualComparisons.every(row => row.changedPixels === 0) ? 'PASS' : 'FAIL'; save();
    if (report.visualStatus !== 'PASS') throw new Error('Surface candidate or unchanged control changed fixed-pose pixels');
  }
} catch (error) {
  report.error = error.message;
  if (report.visualStatus === 'RUNNING') report.visualStatus = 'INCOMPLETE';
  save(); throw error;
} finally {
  await browser?.close(); server?.kill();
  rmSync(temporary, { recursive: true, force: true });
}
