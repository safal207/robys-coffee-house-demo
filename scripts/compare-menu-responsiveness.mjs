import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const budgets = JSON.parse(readFileSync(new URL('../qa/menu-interaction-budgets.json', import.meta.url), 'utf8'));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const positive = value => Number.isFinite(value) && value > 0;
function validate(report) {
  assert.equal(report.protocol, budgets.protocol, 'Measurement protocol must match');
  assert.match(report.environment.sourceRevision, /^[a-f0-9]{40}$/, 'Pin the measured revision');
  const cache = report.cachePreflight;
  assert.ok(cache?.length >= 3 && cache[0].transferSize > 0
    && cache.slice(1).every(item => item.transferSize === 0 && item.decodedBodySize > 0), 'HTTP cache reuse must be verified');
  assert.equal(report.samples.length, budgets.viewports.length * (2 * budgets.cycles + 1), 'Missing or extra navigation evidence');
  assert.equal(report.scroll.length, budgets.viewports.length, 'Missing or extra scroll profile');
  for (const width of budgets.viewports) {
    const errors = report.samples.filter(sample => sample.width === width && Array.isArray(sample.errors));
    assert.equal(errors.length, 1); assert.deepEqual(errors[0].errors, [], 'Application errors invalidate the measurement');
    for (const target of ['feed', 'list']) {
      const samples = report.samples.filter(sample => sample.width === width && sample.target === target);
      assert.deepEqual(samples.map(sample => sample.cycle).sort(), Array.from({ length: budgets.cycles }, (_, i) => i), 'Every cycle must execute exactly once');
      assert.ok(samples.every(sample => positive(sample.switchMs) && (target !== 'feed' || positive(sample.photoReadyMs))), 'A transition and its photograph must actually complete');
    }
    const scroll = report.scroll.filter(sample => sample.width === width);
    assert.equal(scroll.length, 1); assert.equal(scroll[0].cards, budgets.cards, 'Do not reduce content to pass');
    assert.equal(scroll[0].positions.length, 100, 'The full fast-scroll trace must execute');
    assert.ok(scroll[0].positions.every(Number.isFinite));
    assert.ok(scroll[0].frames.length >= 50 && scroll[0].frames.every(Number.isFinite), 'Missing frame evidence');
    assert.ok(positive(scroll[0].rectReads) && Array.isArray(scroll[0].longTasks));
    assert.ok(scroll[0].longTasks.every(task => positive(task.duration)));
  }
}

export function compareMenuResponsiveness(baseline, candidate) {
  validate(baseline); validate(candidate);
  assert.notEqual(baseline.environment.sourceRevision, candidate.environment.sourceRevision, 'Baseline cannot be the candidate');
  for (const key of ['server', 'cache', 'cpu', 'latencyMs', 'downloadMbps', 'serviceWorkers', 'metric']) {
    assert.notEqual(baseline.environment[key], undefined, `Missing environment ${key}`);
    assert.deepEqual(candidate.environment[key], baseline.environment[key], `Unmatched environment ${key}`);
  }
  const checks = [];
  const check = (name, actual, limit) => checks.push({ name, actual, limit, passed: actual <= limit });
  const limit = (value, noise) => Math.max(value * (1 + budgets.navigationRegressionPercent / 100), value + noise);
  for (const width of budgets.viewports) {
    for (const target of ['feed', 'list']) {
      const values = report => report.samples.filter(sample => sample.width === width && sample.target === target).map(sample => sample.switchMs);
      const before = values(baseline), after = values(candidate);
      check(`${width}/${target}/median-ms`, percentile(after, .5), limit(percentile(before, .5), budgets.medianNoiseMs));
      check(`${width}/${target}/p95-ms`, percentile(after, .95), limit(percentile(before, .95), budgets.p95NoiseMs));
      check(`${width}/${target}/max-ms`, Math.max(...after), budgets.maxSwitchMs);
      if (target === 'feed') {
        const photos = report => report.samples.filter(sample => sample.width === width && sample.target === target).map(sample => sample.photoReadyMs);
        check(`${width}/first-photo-p95-ms`, percentile(photos(candidate), .95),
          Math.min(budgets.maxSwitchMs, limit(percentile(photos(baseline), .95), budgets.p95NoiseMs)));
      }
    }
    const before = baseline.scroll.find(sample => sample.width === width), after = candidate.scroll.find(sample => sample.width === width);
    // The baseline follows main, which already contains the initial optimization.
    // Preserve that gain with an absolute cap plus a relative regression guard;
    // requiring another 75% reduction on every PR rejects unchanged fast code.
    const beforeReadsPerFrame = before.rectReads / before.frames.length;
    const geometryLimit = Math.min(budgets.maxGeometryReadsPerFrame,
      Math.max(beforeReadsPerFrame * (1 + budgets.geometryRegressionPercent / 100),
        beforeReadsPerFrame + budgets.geometryNoiseReadsPerFrame));
    check(`${width}/geometry-reads-per-frame`, after.rectReads / after.frames.length, geometryLimit);
    check(`${width}/p95-frame-gap-ms`, percentile(after.frames, .95),
      Math.min(budgets.maxP95FrameGapMs, percentile(before.frames, .95) + budgets.frameNoiseMs));
    check(`${width}/long-task-count`, after.longTasks.length, before.longTasks.length);
    check(`${width}/long-task-duration-ms`, after.longTasks.reduce((sum, task) => sum + task.duration, 0),
      before.longTasks.reduce((sum, task) => sum + task.duration, 0));
  }
  return { baseline: baseline.environment.sourceRevision, candidate: candidate.environment.sourceRevision,
    budgets, checks, passed: checks.every(check => check.passed) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baselinePath, candidatePath, output] = process.argv.slice(2);
  const report = compareMenuResponsiveness(JSON.parse(readFileSync(baselinePath)), JSON.parse(readFileSync(candidatePath)));
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
