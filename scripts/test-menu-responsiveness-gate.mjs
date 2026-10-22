import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareMenuResponsiveness } from './compare-menu-responsiveness.mjs';

function fixture(revision, rectReads) {
  return { protocol: 2, environment: { sourceRevision: revision.repeat(40), server: 'HTTPS', cache: 'verified',
    cpu: 4, latencyMs: 150, downloadMbps: 1.6, serviceWorkers: 'blocked', metric: 'click-to-ready' },
  cachePreflight: [{ transferSize: 100 }, { transferSize: 0, decodedBodySize: 100 }, { transferSize: 0, decodedBodySize: 100 }],
  samples: [390, 1280].flatMap(width => [{ width, errors: [] }, ...['feed', 'list'].flatMap(target =>
    Array.from({ length: 4 }, (_, cycle) => ({ width, target, cycle, switchMs: 200, photoReadyMs: 200 })))]),
  scroll: [390, 1280].map(width => ({ width, cards: 63, rectReads, frames: Array(120).fill(16.7),
    positions: Array.from({ length: 100 }, (_, i) => i), longTasks: [] })) };
}
test('bounded scroll work passes with complete matched navigation evidence', () => {
  assert.equal(compareMenuResponsiveness(fixture('a', 8000), fixture('b', 900)).passed, true);
});
test('navigation, excessive geometry work, frame stalls and new long tasks fail the gate', () => {
  const mutations = [
    report => { report.samples.find(sample => sample.target).switchMs = 3000; },
    report => { report.samples.filter(sample => sample.target).forEach(sample => { sample.switchMs = 400; }); },
    report => { report.samples.find(sample => sample.target === 'feed').photoReadyMs = 4000; },
    report => { report.scroll[0].rectReads = 8000; },
    report => { report.scroll[0].frames.fill(70); },
    report => { report.scroll[0].longTasks.push({ duration: 70 }); }
  ];
  for (const mutate of mutations) {
    const candidate = fixture('b', 900); mutate(candidate);
    assert.equal(compareMenuResponsiveness(fixture('a', 8000), candidate).passed, false);
  }
});
test('missing coverage, invalid cache, application errors and mismatched identities cannot pass', () => {
  for (const mutate of [report => report.samples.pop(), report => { report.scroll[0].cards = 8; },
    report => { report.cachePreflight[1].transferSize = 100; }, report => { report.samples[0].errors.push('pageerror'); },
    report => { report.environment.sourceRevision = 'a'.repeat(40); }, report => { report.environment.cpu = 1; },
    report => { report.samples[1].photoReadyMs = null; }]) {
    const candidate = fixture('b', 900); mutate(candidate);
    assert.throws(() => compareMenuResponsiveness(fixture('a', 8000), candidate));
  }
});

test('already optimized main accepts unchanged per-frame work from a new revision', () => {
  const result = compareMenuResponsiveness(fixture('a', 900), fixture('b', 900));
  assert.equal(result.passed, true, JSON.stringify(result.checks.filter(check => !check.passed)));
});

test('geometry comparison uses work per frame, not differing frame counts', () => {
  const baseline = fixture('a', 900), candidate = fixture('b', 930);
  candidate.scroll.forEach(scroll => { scroll.frames = Array(124).fill(16.7); });
  const result = compareMenuResponsiveness(baseline, candidate);
  assert.equal(result.passed, true);
  assert.ok(result.checks.filter(check => check.name.includes('geometry-')).every(check => check.actual === 7.5));
});

test('optimized main rejects a geometry regression even below the absolute cap', () => {
  const result = compareMenuResponsiveness(fixture('a', 900), fixture('b', 1200));
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks.filter(check => !check.passed).map(check => check.name),
    ['390/geometry-reads-per-frame', '1280/geometry-reads-per-frame']);
});

test('absolute geometry cap cannot drift upward with a slower main', () => {
  // 15 reads/frame still rejects the old full-card scan, even against itself.
  for (const baselineReads of [2400, 8000]) {
    const result = compareMenuResponsiveness(fixture('a', baselineReads), fixture('b', 1801));
    const geometry = result.checks.filter(check => check.name.includes('geometry-'));
    assert.equal(result.passed, false);
    assert.ok(geometry.every(check => check.limit === 15 && !check.passed));
  }
  assert.equal(compareMenuResponsiveness(fixture('a', 8000), fixture('b', 1800)).passed, true);
});

test('geometry relative and noise boundaries are inclusive and bounded', () => {
  // 7.5 * 1.15 = 8.625 reads/frame; a single extra read over the trace must fail.
  assert.equal(compareMenuResponsiveness(fixture('a', 900), fixture('b', 1035)).passed, true);
  assert.equal(compareMenuResponsiveness(fixture('a', 900), fixture('b', 1036)).passed, false);
  // At a lower rate the one-read/frame noise allowance dominates, not 15%.
  assert.equal(compareMenuResponsiveness(fixture('a', 600), fixture('b', 720)).passed, true);
  assert.equal(compareMenuResponsiveness(fixture('a', 600), fixture('b', 721)).passed, false);
});

test('CLI exits nonzero for regressions and incomplete evidence, not unchanged optimized work', () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-menu-gate-'));
  try {
    const baselinePath = join(directory, 'baseline.json');
    writeFileSync(baselinePath, JSON.stringify(fixture('a', 900)));
    for (const [name, mutate, expectedExit] of [
      ['unchanged', () => {}, 0],
      ['geometry-regression', report => { report.scroll[0].rectReads = 1200; }, 1],
      ['switch-over-budget', report => { report.samples[1].switchMs = 1501; }, 1],
      ['missing-coverage', report => { report.samples.pop(); }, 1]
    ]) {
      const candidate = fixture('b', 900); mutate(candidate);
      const candidatePath = join(directory, `${name}.json`), output = join(directory, `${name}-comparison.json`);
      writeFileSync(candidatePath, JSON.stringify(candidate));
      const child = spawnSync(process.execPath,
        [fileURLToPath(new URL('./compare-menu-responsiveness.mjs', import.meta.url)), baselinePath, candidatePath, output],
        { encoding: 'utf8', timeout: 10000 });
      assert.ifError(child.error);
      assert.equal(child.signal, null);
      assert.equal(child.status, expectedExit, `${name}: ${child.stderr}`);
      if (name !== 'missing-coverage') {
        const result = JSON.parse(readFileSync(output, 'utf8'));
        assert.equal(result.passed, expectedExit === 0);
        assert.equal(result.checks.length, 22);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
