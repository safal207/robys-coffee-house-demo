import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Diagnostic only: retain the original scene assertions and frame sampler.
const output = path.resolve(process.env.CONTEXTUAL_CAUSE_RESULTS_DIR ?? 'visual-results/contextual-cause');
mkdirSync(output, { recursive: true });
process.env.CONTEXTUAL_ENTRY_RESULTS_DIR = output;
process.env.CONTEXTUAL_ENTRY_PORT = '4197';
const source = readFileSync('scripts/contextual-entry-smoke.mjs', 'utf8');
const boundary = '\nrmSync(resultsDir, { recursive: true, force: true });';
if (source.split(boundary).length !== 2) throw new Error('Original gate boundary changed');
const originalPrefix = source.split(boundary)[0];
const insertions = [
  ['    const samples = [];\n    const sample = (at) => {',
    "    performance.mark('pr342:sample:start:' + document.documentElement.dataset.robysEntryScene);\n"],
  ['        resolve(samples);',
    "        performance.mark('pr342:sample:end:' + document.documentElement.dataset.robysEntryScene);\n"]
];
let derived = originalPrefix;
for (const [anchor, insertion] of insertions) {
  if (derived.split(anchor).length !== 2) throw new Error('Original sampler boundary changed');
  derived = derived.replace(anchor, insertion + anchor);
}
let restored = derived;
for (const [, insertion] of insertions) restored = restored.replace(insertion, '');
if (restored !== originalPrefix) throw new Error('Original gate changed beyond two boundary marks');
derived += '\nexport { captureScene, measureCold, startServer, waitForServer, diagnostics };\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const temporary = mkdtempSync(path.join(process.cwd(), '.contextual-cause-'));
const modulePath = path.join(temporary, 'runtime.mjs');
writeFileSync(modulePath, derived);
writeFileSync(path.join(output, 'derived-runtime.mjs'), derived);
const report = {
  scope: 'One bounded Chromium trace; observation overhead is present. Not an acceptance gate or product repair.',
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDiff: execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }),
  originalScriptSha256: sha(source), derivedScriptSha256: sha(derived),
  probeScriptSha256: sha(readFileSync('scripts/trace-contextual-cause.mjs')),
  instrumentation: 'Two performance marks delimit the unchanged original 18-sample loop. HTTP server pipes are drained for diagnostic collection.',
  startedAt: new Date().toISOString(), status: 'RUNNING', scenes: {}, bufferUsage: []
};
const save = () => writeFileSync(path.join(output, 'cause-report.json'), JSON.stringify(report, null, 2) + '\n');
save();
let server, browser, session, tracing = false;
async function collectTrace() {
  const complete = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.end'); tracing = false;
  const event = await complete;
  if (!event.stream || event.dataLossOccurred) throw new Error('Trace missing or reports data loss');
  const file = path.join(output, 'chromium-trace.json');
  writeFileSync(file, '');
  try {
    for (;;) {
      const chunk = await session.send('IO.read', { handle: event.stream });
      appendFileSync(file, chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data);
      if (chunk.eof) break;
    }
  } finally { await session.send('IO.close', { handle: event.stream }); }
  const bytes = readFileSync(file);
  const trace = JSON.parse(bytes);
  const events = trace.traceEvents;
  if (!Array.isArray(events) || !events.length) throw new Error('Trace has no events');
  report.trace = { file: 'chromium-trace.json', bytes: bytes.length, sha256: sha(bytes),
    eventCount: events.length, dataLossOccurred: event.dataLossOccurred ?? false,
    sampleMarks: events.filter(e => e.name?.startsWith('pr342:sample:')) };
  for (const scene of ['day', 'night']) for (const edge of ['start', 'end']) {
    if (!report.trace.sampleMarks.some(e => e.name === `pr342:sample:${edge}:${scene}`)) {
      throw new Error(`Trace lacks ${scene} sample ${edge}`);
    }
  }
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null;
  };
  report.traceWindows = {};
  for (const scene of ['day', 'night']) {
    const start = report.trace.sampleMarks.find(e => e.name === `pr342:sample:start:${scene}`);
    const end = report.trace.sampleMarks.find(e => e.name === `pr342:sample:end:${scene}`);
    if (start.pid !== end.pid || start.tid !== end.tid || end.ts <= start.ts) throw new Error('Invalid trace window binding');
    const stats = (name, mainOnly = false) => {
      const all = events.filter(e => e.ph === 'X' && e.name === name && e.dur > 0
        && (!mainOnly || (e.pid === start.pid && e.tid === start.tid))
        && e.ts < end.ts && e.ts + e.dur > start.ts);
      const full = all.filter(e => e.ts >= start.ts && e.ts + e.dur <= end.ts);
      return { count: full.length, boundaryCrossingSlices: all.length - full.length,
        medianWallMs: median(full.map(e => e.dur / 1000)),
        maxWallMs: full.length ? Math.max(...full.map(e => e.dur / 1000)) : null,
        sumWallMs: full.reduce((sum, e) => sum + e.dur / 1000, 0),
        cpuSampleCount: full.filter(e => Number.isFinite(e.tdur)).length,
        medianCpuMs: median(full.filter(e => Number.isFinite(e.tdur)).map(e => e.tdur / 1000)),
        sumCpuMs: full.filter(e => Number.isFinite(e.tdur)).reduce((sum, e) => sum + e.tdur / 1000, 0) };
    };
    report.traceWindows[scene] = {
      scope: 'Fully contained synchronous slices only; nested categories overlap and must not be added together. CPU clocks describe the traced run.',
      startTsUs: start.ts, endTsUs: end.ts, windowMs: (end.ts - start.ts) / 1000,
      mainPid: start.pid, mainTid: start.tid,
      mainThreadCpuMs: Number.isFinite(end.tts) && Number.isFinite(start.tts) ? (end.tts - start.tts) / 1000 : null,
      displayDrawAndSwap: stats('Display::DrawAndSwap'), softwareQuads: stats('SoftwareRenderer::DoDrawQuad'),
      rasterTasks: stats('RasterTask'), appAnimationFrameCallbacks: stats('FireAnimationFrame', true),
      appLayout: stats('Layout', true), appUpdateLayoutTree: stats('UpdateLayoutTree', true)
    };
  }
}
try {
  const gate = await import(pathToFileURL(modulePath));
  server = gate.startServer(); server.stdout.resume(); server.stderr.resume();
  await gate.waitForServer();
  browser = await chromium.launch({ headless: true });
  session = await browser.newBrowserCDPSession();
  report.browser = browser.version();
  report.system = await session.send('SystemInfo.getInfo');
  report.coldDurations = {};
  for (const scene of ['day', 'night']) {
    try { report.coldDurations[scene] = await gate.measureCold(browser, scene); }
    catch (error) { report.coldDurations[scene] = { error: error.message }; }
    finally { for (const context of browser.contexts()) await context.close(); }
  }
  session.on('Tracing.bufferUsage', event => report.bufferUsage.push(event));
  await session.send('Tracing.start', {
    transferMode: 'ReturnAsStream', streamFormat: 'json', bufferUsageReportingInterval: 1000,
    categories: 'toplevel,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,gpu,viz,renderer.scheduler,skia,disabled-by-default-skia'
  });
  tracing = true;
  for (const scene of ['day', 'night']) {
    let error = null;
    try { await gate.captureScene(browser, scene); }
    catch (caught) { error = caught.message; }
    finally { for (const context of browser.contexts()) await context.close(); }
    report.scenes[scene] = { error, measured: structuredClone(gate.diagnostics.scenes[scene] ?? null) };
    save();
  }
  await collectTrace();
  if (!Object.values(report.scenes).every(row => row.measured?.smoothness?.samples?.length === 18)) {
    throw new Error('Original frame samples incomplete');
  }
  report.status = 'COLLECTED';
  console.log(JSON.stringify({ status: report.status,
    scenes: Object.fromEntries(Object.entries(report.scenes).map(([key, row]) => [key, {
      error: row.error, median: row.measured.smoothness.medianFrameIntervalMs }])), trace: report.trace }));
} catch (error) {
  report.status = 'INCOMPLETE'; report.error = error.stack ?? String(error); throw error;
} finally {
  if (tracing) await collectTrace().catch(error => { report.traceCollectionError = error.message; });
  report.finishedAt = new Date().toISOString(); save();
  await browser?.close(); server?.kill(); rmSync(temporary, { recursive: true, force: true });
}
