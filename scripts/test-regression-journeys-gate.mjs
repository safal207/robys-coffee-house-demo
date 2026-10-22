import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareRegressionJourneys, loadJourneyBudgets } from './compare-regression-journeys.mjs';

const { config, configDigest } = loadJourneyBudgets();
const snapshot = revision => ({ head: revision.repeat(40), tree: revision.repeat(40), dirty: false, worktreeDigest: revision.repeat(64) });
function fixture(label, revision, durationMs = 100) {
  return { protocol: 1, kind: 'journey-run', label, status: 'PASS', applicationErrors: [],
    identity: { expectedHead: revision.repeat(40), initial: snapshot(revision), final: snapshot(revision), status: 'PASS' },
    environment: { browser: 'chromium', browserVersion: 'test-browser-1', profile: 'throttled', widths: config.widths,
      cycles: config.cycles, cpu: 4, latencyMs: 150, downloadMbps: 1.6, serviceWorkers: 'blocked',
      cache: 'fresh context per width/cycle; warmed within sequence', motion: 'no-preference' },
    harnessDigest: 'f'.repeat(64), configDigest,
    journeys: config.journeys.flatMap(journey => config.widths.flatMap(width => Array.from({ length: config.cycles }, (_, cycle) =>
      ({ id: journey.id, width, cycle, status: 'PASS', durationMs, frameGaps: [16.7, 16.7], longTasks: [], errors: [], assertions: { expectedState: true } })))) };
}
const compare = (baseline, candidate) => compareRegressionJourneys(baseline, candidate, config, configDigest);
const pair = () => [fixture('baseline', 'a'), fixture('candidate', 'b')];

test('complete correct unchanged action timings pass', () => {
  const result = compare(...pair());
  assert.equal(result.passed, true, JSON.stringify(result.validationErrors));
  assert.equal(result.actions.length, config.journeys.length * config.widths.length);
  assert.equal(result.checks.length, result.actions.length * 3);
});

test('absolute and relative timing regressions fail independently', () => {
  for (const mutate of [
    candidate => { candidate.journeys[0].durationMs = config.journeys[0].maxMs + 1; },
    candidate => { candidate.journeys.forEach(row => { row.durationMs = 400; }); }
  ]) {
    const [baseline, candidate] = pair(); mutate(candidate);
    const result = compare(baseline, candidate);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.checks.some(check => !check.passed));
    assert.deepEqual(result.validationErrors, []);
  }
});

test('exact absolute threshold passes and one millisecond beyond fails', () => {
  const [baseline, candidate] = pair();
  const limit = config.journeys[0].maxMs;
  baseline.journeys[0].durationMs = limit; candidate.journeys[0].durationMs = limit;
  assert.equal(compare(baseline, candidate).passed, true);
  candidate.journeys[0].durationMs++;
  assert.equal(compare(baseline, candidate).passed, false);
});

test('one overbudget action fails the run without blaming unrelated journeys', () => {
  const [baseline, candidate] = pair();
  candidate.journeys[0].durationMs = config.journeys[0].maxMs + 1;
  candidate.status = 'FAIL';
  const result = compare(baseline, candidate);
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.journeys.filter(journey => journey.status === 'FAIL').map(journey => journey.id), [config.journeys[0].id]);
});

test('fast but incorrect outcomes, script errors and failed observations cannot pass', () => {
  for (const mutate of [
    candidate => { candidate.journeys[0].assertions.expectedState = false; },
    candidate => { candidate.journeys[0].assertions.totalCorrect = false; },
    candidate => { candidate.journeys[0].errors.push('pageerror: missing catalog'); },
    candidate => { candidate.applicationErrors.push('pageerror: setup failed before arming an action'); },
    candidate => { delete candidate.applicationErrors; },
    candidate => { candidate.journeys[0].status = 'FAIL'; },
    candidate => { candidate.status = 'FAIL'; }
  ]) {
    const [baseline, candidate] = pair(); mutate(candidate);
    assert.equal(compare(baseline, candidate).passed, false);
  }
});

test('missing, duplicate, extra or nonfinite observations cannot pass', () => {
  for (const mutate of [
    candidate => candidate.journeys.pop(),
    candidate => candidate.journeys.push(structuredClone(candidate.journeys[0])),
    candidate => { candidate.journeys[0].cycle = config.cycles; },
    candidate => { candidate.journeys[0].id = 'unregistered-fast-action'; },
    candidate => { candidate.journeys[0].durationMs = NaN; },
    candidate => { candidate.journeys[0].durationMs = null; },
    candidate => { candidate.journeys[0].durationMs = -1; },
    candidate => { delete candidate.journeys[0].errors; },
    candidate => { candidate.journeys[0].frameGaps = [Infinity]; },
    candidate => { candidate.journeys[0].longTasks = [{ duration: NaN }]; }
  ]) {
    const [baseline, candidate] = pair(); mutate(candidate);
    const result = compare(baseline, candidate);
    assert.equal(result.status, 'HOLD');
    assert.ok(result.validationErrors.length);
  }
});

test('stale, held, mismatched or moved immutable identities cannot pass', () => {
  for (const mutate of [
    candidate => { candidate.identity.initial.head = 'a'.repeat(40); },
    candidate => { candidate.identity.final.tree = 'd'.repeat(40); },
    candidate => { candidate.identity.final.worktreeDigest = 'd'.repeat(64); },
    candidate => { candidate.identity.status = 'HOLD'; },
    candidate => { candidate.identity.expectedHead = 'main'; },
    candidate => { candidate.identity.initial.tree = null; },
    candidate => { candidate.identity = fixture('baseline', 'a').identity; }
  ]) {
    const [baseline, candidate] = pair(); mutate(candidate);
    assert.equal(compare(baseline, candidate).status, 'HOLD');
  }
});

test('different browser, throttle, harness, configuration or labels cannot pass', () => {
  for (const mutate of [
    candidate => { candidate.environment.browserVersion = 'different-version'; },
    candidate => { candidate.environment.browser = 'firefox'; },
    candidate => { candidate.environment.widths = [390]; },
    candidate => { candidate.environment.cycles = 1; },
    candidate => { candidate.environment.cpu = 1; },
    candidate => { candidate.environment.motion = 'reduce'; },
    candidate => { candidate.environment.serviceWorkers = 'allow'; },
    candidate => { candidate.harnessDigest = 'c'.repeat(64); },
    candidate => { candidate.configDigest = 'c'.repeat(64); },
    candidate => { candidate.label = 'baseline'; },
    candidate => { candidate.environment.cache = ''; }
  ]) {
    const [baseline, candidate] = pair(); mutate(candidate);
    assert.equal(compare(baseline, candidate).status, 'HOLD');
  }
});

test('native Firefox and WebKit observations compare within their own engine', () => {
  for (const browser of ['firefox', 'webkit']) {
    const [baseline, candidate] = pair();
    for (const report of [baseline, candidate]) Object.assign(report.environment, { browser, profile: 'native', cpu: 1, latencyMs: 0, downloadMbps: null });
    assert.equal(compare(baseline, candidate).passed, true);
  }
});

test('unchanged dirty worktree is explicit local evidence, never clean release proof', () => {
  const [baseline, candidate] = pair(); candidate.identity.initial.dirty = candidate.identity.final.dirty = true;
  const result = compare(baseline, candidate);
  assert.equal(result.passed, true); assert.equal(result.localEvidenceOnly, true);
});

test('short-action frame diagnostics do not claim a statistically meaningful scroll gate', () => {
  const [baseline, candidate] = pair(); candidate.journeys[0].frameGaps = [100];
  const result = compare(baseline, candidate);
  assert.equal(result.passed, true);
  assert.equal(result.actions[0].maximumFrameGapMs, 100);
  assert.match(result.smoothness, /diagnostic/);
});

test('CLI preserves HOLD evidence and exits unsuccessfully for a missing input report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-action-gate-'));
  try {
    const candidatePath = join(directory, 'candidate.json'), output = join(directory, 'comparison.json');
    writeFileSync(candidatePath, JSON.stringify(fixture('candidate', 'b')));
    const run = spawnSync(process.execPath, ['scripts/compare-regression-journeys.mjs', join(directory, 'missing.json'), candidatePath, output], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.status, 'HOLD'); assert.equal(report.passed, false);
    assert.match(readFileSync(join(directory, 'comparison.md'), 'utf8'), /Incomplete evidence/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
