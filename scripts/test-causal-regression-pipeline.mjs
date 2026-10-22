import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { collectReport, commandArgv, evaluateTimings, expectedTimingMatrix, impactPlan, matchesPath, safePath, validateGraph, verifyPlanIdentity, verifyReceipt } from './causal-regression.mjs';

const graph = JSON.parse(readFileSync(new URL('../qa/causal-regression-graph.json', import.meta.url)));
const policy = JSON.parse(readFileSync(new URL('../qa/journey-latency-budgets.json', import.meta.url)));
const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: false };
const plan = () => ({ source: { ...source }, base: 'c'.repeat(40), registrySha256: 'd'.repeat(64), ...impactPlan(graph, ['menu-catalog.js']) });
const receipt = check => ({ schemaVersion: 1, checkId: check.id, source: { ...source }, registrySha256: 'd'.repeat(64), command: check.command,
  selection: { mode: 'full', filters: [] }, complete: true, status: 'PASS', startedAt: '2026-10-22T10:00:00Z', finishedAt: '2026-10-22T10:00:01Z',
  durationMs: 1000, exitCode: 0, signal: null, timedOut: false, artifacts: [{ path: 'check.log', bytes: 4, sha256: 'e'.repeat(64) }] });
function timingReport() {
  const expectedSamples = expectedTimingMatrix(policy);
  return { schemaVersion: 1, complete: true, source: { ...source }, expectedSamples, environment: { browser: 'chromium', cpuRate: 4, latencyMs: 150, downloadMbps: 1.6, serviceWorkers: 'blocked' },
    samples: expectedSamples.map((sample, i) => ({ ...sample, value: 100, correctnessStatus: 'PASS', timingStatus: 'VALID', status: 'PASS',
      evidence: { id: `transition-${i}`, start: i * 1000 + 1, end: i * 1000 + 101, correct: true } })) };
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
