import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertMappedPlan, checkedArtifact, collectReport as collectReportRaw, commandArgv, evaluateTimings as evaluateTimingsRaw, expectedTimingMatrix, impactPlan, matchesPath, safePath, validateGraph, verifyPlanIdentity, verifyReceipt as verifyReceiptRaw } from './causal-regression.mjs';

const graph = JSON.parse(readFileSync(new URL('../qa/causal-regression-graph.json', import.meta.url)));
const policy = JSON.parse(readFileSync(new URL('../qa/journey-latency-budgets.json', import.meta.url)));
const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: false };
const FIXED_NOW = Date.parse('2026-10-22T10:02:02Z');
const RUN_START = Date.parse('2026-10-22T10:00:00Z');
const ORIGIN = 'https://127.0.0.1:4321';
// The 18 missing ownership inputs in the first combined-app CI plan (run39822718923).
const combinedAppOwnership = {
  '.github/workflows/menu-responsiveness.yml': ['qa-registry'],
  'AGENTS.md': ['build', 'qa-registry'],
  'menu-feed-viewer.js': ['feed-social'],
  'menu-feedback.css': ['menu-view'],
  'menu-feedback.js': ['menu-view'],
  'scripts/lighthouse-comment.mjs': ['qa-registry'],
  'scripts/test-menu-feed-browser.mjs': ['menu-list', 'menu-feed'],
  'scripts/test-menu-feed-viewer-entry.mjs': ['feed-social'],
  'scripts/test-menu-feed.mjs': ['menu-feed'],
  'scripts/test-menu-feedback.mjs': ['menu-view'],
  'scripts/test-menu-lazy-images-browser.mjs': ['menu-list', 'product-photos'],
  'scripts/test-menu-runtime-contract.mjs': ['build'],
  'scripts/test-menu-styles-bundle.mjs': ['build'],
  'scripts/verify-pairing-cta.mjs': ['menu-list', 'discover'],
  'scripts/visual-regression.mjs': ['qa-registry'],
  'src/menu-feed-viewer-entry.js': ['feed-social'],
  'src/menu-feedback-entry.js': ['menu-view'],
  'src/menu-feedback.js': ['menu-view']
};
const verifyReceipt = (receipt, plan, check, verifyArtifact) => verifyReceiptRaw(receipt, plan, check, verifyArtifact, { now: FIXED_NOW });
const evaluateTimings = (report, plan, graph, policy) => evaluateTimingsRaw(report, plan, graph, policy, { now: FIXED_NOW });
const collectReport = (plan, graph, receipts, timings) => collectReportRaw(plan, graph, receipts, timings, { now: FIXED_NOW });
const plan = () => ({ createdAt: '2026-10-22T09:59:59Z', source: { ...source }, base: 'c'.repeat(40), registrySha256: 'd'.repeat(64), ...impactPlan(graph, ['menu-catalog.js']) });
const receipt = check => ({ schemaVersion: 1, checkId: check.id, source: { ...source }, registrySha256: 'd'.repeat(64), command: check.command,
  selection: { mode: 'full', filters: [] }, complete: true, status: 'PASS', startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:00:01Z',
  durationMs: 1000, exitCode: 0, signal: null, timedOut: false, artifacts: [{ path: 'check.log', bytes: 4, sha256: 'e'.repeat(64) }] });
function timingReport() {
  const expectedSamples = expectedTimingMatrix(policy);
  return { schemaVersion: 1, startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:02:00Z', complete: true, source: { ...source }, expectedSamples, environment: { origin: ORIGIN, browser: 'chromium', cpuRate: 4, latencyMs: 150, downloadMbps: 1.6, serviceWorkers: 'blocked' },
    samples: expectedSamples.map((sample, i) => ({ ...sample, value: 100, correctnessStatus: 'PASS', timingStatus: 'VALID', status: 'PASS',
      evidence: { id: `transition-${i}`, start: RUN_START + i * 1000 + 1, end: RUN_START + i * 1000 + 101, correct: true, url: `${ORIGIN}/${sample.journeyId === 'menu-switch-feed' ? 'menu-feed.html' : 'menu.html'}` } })) };
}

test('paths stay inside the repository and slash-aware globs do not overselect siblings', () => {
  for (const path of ['../secret', '/etc/passwd', 'src/../secret', 'src\\a.js', 'src//a.js']) assert.equal(safePath(path), false);
  assert.equal(safePath('.github/workflows/causal-regression.yml'), true);
  assert.equal(matchesPath('src/a.js', 'src/*.js'), true);
  assert.equal(matchesPath('src/nested/a.js', 'src/*.js'), false);
  assert.equal(matchesPath('src/a.js', 'src/**/*.js'), true);
  assert.equal(matchesPath('src/nested/a.js', 'src/**/*.js'), true);
  assert.equal(matchesPath('src/aXjs', 'src/*.js'), false);
});

test('registry commands are argv, never shell input', () => {
  assert.deepEqual(commandArgv('npm run check', { check: 'node x' }), ['npm', 'run', 'check']);
  assert.deepEqual(commandArgv('node --test scripts/test-menu-feed.mjs').slice(1), ['--test', 'scripts/test-menu-feed.mjs']);
  for (const command of ['npm run absent', 'npm run check; echo token', 'node scripts/../a.mjs', 'node scripts/a.mjs $(env)', 'curl https://example.com', 'node -e process.exit(0)', 'node --check scripts/test-menu-feed-browser.mjs']) {
    assert.throws(() => commandArgv(command, { check: 'node x' }));
  }
});

test('invalid graph references, duplicates and cycles are rejected', () => {
  assert.equal(validateGraph(structuredClone(graph)).schemaVersion, 1);
  const duplicate = structuredClone(graph); duplicate.journeys.push(duplicate.journeys[0]); assert.throws(() => validateGraph(duplicate), /duplicate/);
  const orphan = structuredClone(graph); orphan.journeys[0].checks = ['unregistered-check']; assert.throws(() => validateGraph(orphan), /Unknown reference/);
  const cyclic = structuredClone(graph); cyclic.components[0].dependsOn = [cyclic.components[0].id]; assert.throws(() => validateGraph(cyclic), /cycle/);
  const sourceLess = structuredClone(graph); sourceLess.components[0].paths = ['**/*']; assert.throws(() => validateGraph(sourceLess), /unbounded/);
  const invalidBrowser = structuredClone(graph); invalidBrowser.checks[0].browsers = ['chromium;env']; assert.throws(() => validateGraph(invalidBrowser), /browser/);
});

test('source and security baselines cannot silently disappear from the registry', () => {
  for (const id of ['source-contracts', 'security-contracts']) for (const mutate of [g => g.checks.splice(g.checks.findIndex(c => c.id === id), 1),
    g => { g.checks.find(c => c.id === id).always = false; }, g => { g.checks.find(c => c.id === id).execution = 'existing-workflow'; },
    g => { g.checks.find(c => c.id === id).command = 'npm run another'; }]) {
    const altered = structuredClone(graph); mutate(altered); assert.throws(() => validateGraph(altered));
  }
});

test('shared changes propagate to consumers and unknown paths stay visible', () => {
  const miniature = { components: [{ id: 'storage', paths: ['storage.js'], dependsOn: [] }, { id: 'cart', paths: ['cart.js'], dependsOn: ['storage'] },
    { id: 'qr', paths: ['qr.js'], dependsOn: ['cart'] }, { id: 'gallery', paths: ['gallery.js'], dependsOn: [] }],
    journeys: [{ id: 'order', components: ['qr'], checks: [] }], checks: [{ id: 'unit', components: ['qr'], execution: 'pipeline', kind: 'contract' }] };
  const result = impactPlan(miniature, ['storage.js', 'unmapped.js']);
  assert.deepEqual(result.impactedComponents, ['cart', 'qr', 'storage']); assert.deepEqual(result.impactedJourneys, ['order']);
  assert.deepEqual(result.selectedChecks, ['unit']); assert.deepEqual(result.unmappedPaths, ['unmapped.js']);
});

test('authored pairing posters and photo delivery contracts retain their component ownership', () => {
  const menuHtml = readFileSync(new URL('../menu.html', import.meta.url), 'utf8');
  assert.match(menuHtml, /<script\b[^>]*\bsrc="pairing-posters\.js(?:\?[^\"]*)?"/);
  assert.match(menuHtml, /<link\b[^>]*\bhref="menu-runtime\.css(?:\?[^\"]*)?"/);
  assert.match(readFileSync(new URL('./menu-styles-bundle.mjs', import.meta.url), 'utf8'), /source: "pairing-posters\.css"/);
  const runtime = impactPlan(graph, ['pairing-posters.js']);
  const authored = impactPlan(graph, ['src/pairing-posters.js']);
  assert.deepEqual(authored.directComponents, runtime.directComponents);
  assert.deepEqual(authored.selectedChecks, runtime.selectedChecks);
  assert.deepEqual(authored.directComponents, ['menu-list', 'discover']);
  assert.deepEqual(authored.unmappedPaths, []);
  const styles = impactPlan(graph, ['pairing-posters.css']);
  assert.deepEqual(styles.directComponents, authored.directComponents);
  assert.deepEqual(styles.selectedChecks, authored.selectedChecks);
  for (const result of [runtime, authored, styles]) {
    for (const id of ['menu-category', 'menu-language', 'product-open']) {
      assert.ok(result.impactedJourneys.includes(id), `${id} must remain impacted by its pairing poster consumer`);
    }
  }
  const delivery = impactPlan(graph, ['scripts/test-menu-photo-delivery.mjs']);
  assert.deepEqual(delivery.directComponents, ['menu-list', 'product-photos']);
  assert.deepEqual(delivery.unmappedPaths, []);
  for (const id of ['source-contracts', 'security-contracts', 'menu-feed-browser', 'product-reveal-browser']) {
    assert.ok(delivery.selectedChecks.includes(id), `${id} must remain selected for delivery contract changes`);
  }
  const unknown = 'scripts/test-menu-photo-delivery-unregistered.mjs';
  assert.deepEqual(impactPlan(graph, [unknown]).unmappedPaths, [unknown]);
});

test('combined app inputs have narrow owners and preserve their actual menu and feed consumers', () => {
  assert.equal(Object.keys(combinedAppOwnership).length, 18);
  for (const [path, owners] of Object.entries(combinedAppOwnership)) {
    const result = impactPlan(graph, [path]);
    assert.deepEqual(result.directComponents, owners, path);
    assert.deepEqual(result.unmappedPaths, [], path);
  }
  const soundPaths = ['src/menu-feedback-entry.js', 'src/menu-feedback.js', 'menu-feedback.js', 'menu-feedback.css'];
  for (const path of ['src/menu-app.js', 'src/menu-feed.js']) {
    assert.match(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), /import "\.\/src\/menu-feedback-entry\.js"/);
  }
  for (const path of soundPaths) {
    const result = impactPlan(graph, [path]);
    for (const id of ['menu-switch-feed', 'menu-switch-list']) assert.ok(result.impactedJourneys.includes(id), `${path}: ${id}`);
    assert.ok(result.impactedComponents.includes('menu-list')); assert.ok(result.impactedComponents.includes('menu-feed'));
  }
  assert.match(readFileSync(new URL('../src/menu-feed.js', import.meta.url), 'utf8'), /from "\.\/src\/menu-feed-viewer-entry\.js"/);
  for (const path of ['src/menu-feed-viewer-entry.js', 'menu-feed-viewer.js']) {
    assert.ok(impactPlan(graph, [path]).impactedJourneys.includes('feed-stories-reels'), path);
  }
  const unknown = 'src/menu-feedback-unregistered.js';
  assert.deepEqual(impactPlan(graph, [...Object.keys(combinedAppOwnership), unknown]).unmappedPaths, [unknown]);
});

test('planning refuses missing ownership before publishing its execution matrix', () => {
  const failedCombinedPlan = { unmappedPaths: Object.keys(combinedAppOwnership) };
  assert.throws(() => assertMappedPlan(failedCombinedPlan), /Plan has unmapped changed paths/);
  for (const input of [null, {}, { unmappedPaths: null }]) assert.throws(() => assertMappedPlan(input));
  const mapped = impactPlan(graph, Object.keys(combinedAppOwnership));
  assert.equal(assertMappedPlan(mapped), mapped);
  const workflow = readFileSync(new URL('../.github/workflows/causal-regression.yml', import.meta.url), 'utf8');
  const readPlan = workflow.indexOf("const plan = JSON.parse(readFileSync("), guard = workflow.indexOf('assertMappedPlan(plan);');
  const outputMatrix = workflow.indexOf('appendFileSync(process.env.GITHUB_OUTPUT');
  assert.ok(readPlan >= 0 && guard > readPlan && outputMatrix > guard, 'Coverage must be checked after the saved plan and before job outputs');
  assert.match(workflow.slice(guard, workflow.indexOf('\n  checks:')), /actions\/upload-artifact@v4\n\s+if: always\(\)/);
});

test('consistently forged plan fields cannot suppress the real changed-file scope', () => {
  const p = { schemaVersion: 1, graph, ...plan() }, expected = { base: p.base, head: source.revision };
  assert.ok(verifyPlanIdentity(p, graph, p.registrySha256, source, ['menu-catalog.js'], expected));
  const forged = { ...p, ...impactPlan(graph, []) };
  assert.throws(() => verifyPlanIdentity(forged, graph, p.registrySha256, source, ['menu-catalog.js'], expected), /Altered impact/);
  assert.throws(() => verifyPlanIdentity({ ...p, base: source.revision }, graph, p.registrySha256, source, [], expected), /event revisions/);
  assert.throws(() => verifyPlanIdentity(p, graph, p.registrySha256, { ...source, dirty: true }, ['menu-catalog.js'], expected), /clean planned/);
});

test('fatal exit, timeout and unfinished all-PASS prefixes cannot become green', () => {
  const check = graph.checks.find(check => check.id === 'source-contracts');
  assert.equal(verifyReceipt(receipt(check), plan(), check).status, 'PASS');
  for (const fields of [{ exitCode: 1, status: 'FAIL' }, { timedOut: true }, { signal: 'SIGKILL' }, { complete: false }, { durationMs: 0 }, { durationMs: NaN },
    { startedAt: 'invalid', finishedAt: 'invalid' }, { finishedAt: '2026-10-22T09:00:00Z' },
    { selection: { mode: 'full', filters: ['ROBYS_TRANSACTION_FILTER'] } }, { artifacts: [] }]) {
    assert.notEqual(verifyReceipt({ ...receipt(check), ...fields }, plan(), check).status, 'PASS');
  }
});

test('stale revisions, dirty worktrees, altered commands and tampered artifacts reject receipts', () => {
  const check = graph.checks[0];
  const stale = receipt(check); stale.source.revision = 'f'.repeat(40); assert.equal(verifyReceipt(stale, plan(), check).status, 'STALE');
  for (const fields of [{ source: { ...source, dirty: true } }, { source: { ...source, tree: 'f'.repeat(40) } }, { command: 'npm run another' },
    { registrySha256: 'f'.repeat(64) }, { artifacts: [{ path: '../escaped.log', bytes: 4, sha256: 'e'.repeat(64) }] }]) {
    assert.notEqual(verifyReceipt({ ...receipt(check), ...fields }, plan(), check).status, 'PASS');
  }
  assert.notEqual(verifyReceipt(receipt(check), plan(), check, () => false).status, 'PASS');
  const duplicate = receipt(check); duplicate.artifacts.push(duplicate.artifacts[0]); assert.notEqual(verifyReceipt(duplicate, plan(), check).status, 'PASS');
});

test('canonical timing matrix contains120samples and cannot be narrowed by the report itself', () => {
  assert.equal(expectedTimingMatrix(policy).length, 120);
  const full = timingReport(); assert.equal(evaluateTimings(full, plan(), graph).status, 'PASS');
  const partial = timingReport(); partial.expectedSamples = partial.expectedSamples.slice(0, 10); partial.samples = partial.samples.slice(0, 10);
  assert.equal(evaluateTimings(partial, plan(), graph).status, 'INCOMPLETE');
  const missing = timingReport(); missing.samples.pop(); assert.equal(evaluateTimings(missing, plan(), graph).status, 'INCOMPLETE');
  const duplicate = timingReport(); duplicate.samples.push(duplicate.samples[0]); assert.equal(evaluateTimings(duplicate, plan(), graph).status, 'INCOMPLETE');
});

test('bad timing evidence, replayed transition and changed environment do not pass', () => {
  for (const mutate of [r => { r.complete = false; }, r => { r.samples[0].value = null; }, r => { r.samples[0].evidence.start = r.samples[0].evidence.end; },
    r => { r.samples[1].evidence.id = r.samples[0].evidence.id; }, r => { r.environment.cpuRate = 1; }, r => { r.source.dirty = true; },
    r => { r.source.revision = 'f'.repeat(40); }, r => { r.samples[0].metricId = 'another_ms'; }]) {
    const altered = timingReport(); mutate(altered); assert.equal(evaluateTimings(altered, plan(), graph).status, 'INCOMPLETE');
  }
});

test('wrong functional outcome and owner latency fail independently of informational targets', () => {
  const wrong = timingReport(); wrong.samples[0].correctnessStatus = 'FAIL'; wrong.samples[0].evidence.correct = false;
  assert.equal(evaluateTimings(wrong, plan(), graph).status, 'FAIL');
  const slow = timingReport(), sample = slow.samples.find(sample => sample.journeyId === 'menu-switch-feed');
  sample.value = 1200; sample.evidence.end = sample.evidence.start + 1200; sample.status = 'FAIL';
  assert.equal(evaluateTimings(slow, plan(), graph).status, 'FAIL');
  const informational = timingReport(), info = informational.samples.find(sample => sample.journeyId === 'menu-search');
  info.value = 1200; info.evidence.end = info.evidence.start + 1200;
  const result = evaluateTimings(informational, plan(), graph); assert.equal(result.status, 'PASS');
  assert.ok(result.rows.some(row => row.status === 'OBSERVED_ABOVE_TARGET'));
});

test('collector preserves missing, duplicate and foreign receipts instead of hiding them', () => {
  const p = plan(), records = p.selectedChecks.map(id => ({ receipt: receipt(graph.checks.find(check => check.id === id)), verifyArtifact: () => true }));
  const full = collectReport(p, graph, records, timingReport()); assert.equal(full.status, 'PASS');
  assert.ok(full.checks.some(check => check.status === 'NOT_RUN')); assert.ok(full.timingCoverageGaps.length > 0);
  assert.equal(collectReport(p, graph, records.slice(1), timingReport()).status, 'INCOMPLETE');
  assert.equal(collectReport(p, graph, [...records, records[0]], timingReport()).status, 'INCOMPLETE');
  const foreign = { receipt: { ...records[0].receipt, checkId: 'unknown' } };
  assert.equal(collectReport(p, graph, [...records, foreign], timingReport()).status, 'INCOMPLETE');
  assert.equal(collectReport(p, graph, records, null).status, 'INCOMPLETE');
});

function artifactFixture() {
  const root = mkdtempSync(join(tmpdir(), 'robys-receipt-'));
  const base = join(root, 'receipt'), outside = join(root, 'outside');
  mkdirSync(base); mkdirSync(outside);
  const bytes = Buffer.from('completed command evidence\n');
  writeFileSync(join(base, 'check.log'), bytes); writeFileSync(join(outside, 'check.log'), bytes);
  const artifact = { path: 'check.log', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  return { root, base, outside, artifact, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test('artifact bytes are verified from an opened regular file and descriptors close on success or failure', { skip: process.platform !== 'linux' }, () => {
  const f = artifactFixture();
  try {
    const descriptors = readdirSync('/proc/self/fd').length;
    assert.equal(checkedArtifact(f.base, f.artifact), true);
    assert.equal(checkedArtifact(f.base, { ...f.artifact, sha256: '0'.repeat(64) }), false);
    assert.equal(checkedArtifact(f.base, { ...f.artifact, bytes: f.artifact.bytes + 1 }), false);
    assert.equal(checkedArtifact(f.base, { ...f.artifact, path: 'missing.log' }), false);
    assert.equal(readdirSync('/proc/self/fd').length, descriptors, 'Every opened descriptor must close in finally');
  } finally { f.cleanup(); }
});
test('artifact leaf symlinks are refused even when their contents match', { skip: process.platform !== 'linux' }, () => {
  const f = artifactFixture();
  try {
    symlinkSync(join(f.base, 'check.log'), join(f.base, 'linked.log'));
    assert.equal(checkedArtifact(f.base, { ...f.artifact, path: 'linked.log' }), false);
  } finally { f.cleanup(); }
});
test('an ancestor symlink cannot redirect an artifact read outside its receipt directory', { skip: process.platform !== 'linux' }, () => {
  const f = artifactFixture();
  try {
    symlinkSync(f.outside, join(f.base, 'redirected'));
    const descriptors = readdirSync('/proc/self/fd').length;
    assert.equal(checkedArtifact(f.base, { ...f.artifact, path: 'redirected/check.log' }), false);
    assert.equal(readdirSync('/proc/self/fd').length, descriptors, 'Containment rejection must close the opened file');
  } finally { f.cleanup(); }
});

test('receipt clock windows and monotonic durations reject future or inconsistent intervals', () => {
  const check = graph.checks.find(check => check.id === 'source-contracts');
  for (const fields of [
    { startedAt: '2099-01-01T00:00:00Z', finishedAt: '2099-01-01T02:00:00Z', durationMs: 1 },
    { startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:02:00Z', durationMs: 1 },
    { startedAt: '2026-10-22T09:00:00Z', finishedAt: '2026-10-22T09:00:01Z' },
    { durationMs: Infinity }, { finishedAt: '2026-10-22T09:59:59Z' }
  ]) assert.notEqual(verifyReceipt({ ...receipt(check), ...fields }, plan(), check).status, 'PASS');
  assert.equal(verifyReceipt(receipt(check), plan(), check).status, 'PASS');
  assert.notEqual(verifyReceipt(receipt(check), { ...plan(), createdAt: 'invalid' }, check).status, 'PASS');
});

test('timing runs require bounded wall clocks and transition epochs inside their run', () => {
  for (const mutate of [
    r => { r.startedAt = '2099-01-01T00:00:00Z'; r.finishedAt = '2099-01-01T00:02:00Z'; },
    r => { r.finishedAt = r.startedAt; }, r => { r.startedAt = 'invalid'; },
    r => { r.samples[0].evidence.start = 1; r.samples[0].evidence.end = 101; },
    r => { r.samples[0].evidence.start = RUN_START + 180000; r.samples[0].evidence.end = RUN_START + 180100; }
  ]) {
    const changed = timingReport(); mutate(changed); assert.equal(evaluateTimings(changed, plan(), graph).status, 'INCOMPLETE');
  }
});

test('transition URLs must match the declared local HTTPS origin and the journey route', () => {
  for (const mutate of [
    r => { r.environment.origin = 'https://remote.example'; },
    r => { r.environment.origin = 'http://127.0.0.1:4321'; },
    r => { r.samples[0].evidence.url = 'https://wrong.invalid/menu-feed.html'; },
    r => { r.samples[0].evidence.url = `${ORIGIN}/menu.html`; },
    r => { r.samples.find(s => s.journeyId === 'product-open').evidence.url = `${ORIGIN}/menu-feed.html`; },
    r => { delete r.samples[0].evidence.url; }
  ]) {
    const changed = timingReport(); mutate(changed); assert.equal(evaluateTimings(changed, plan(), graph).status, 'INCOMPLETE');
  }
  assert.equal(evaluateTimings(timingReport(), plan(), graph).status, 'PASS');
});
