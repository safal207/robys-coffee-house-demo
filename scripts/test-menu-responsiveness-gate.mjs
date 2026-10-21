import test from 'node:test';
import assert from 'node:assert/strict';
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
