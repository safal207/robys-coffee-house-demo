import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { captureIdentity, sameIdentity, validateRegistry, selectSuites, executeSuite, summarizeFeatures, summarizeJourneyCoverage, downstreamNodes, digest } from './regression-pipeline-lib.mjs';
import { compareRegressionJourneys } from './compare-regression-journeys.mjs';

const fixture = () => ({ version: 1,
  nodes: [{ id: 'action', kind: 'action' }, { id: 'state', kind: 'state' }, { id: 'outcome', kind: 'invariant' }],
  edges: [{ from: 'action', to: 'state', mechanism: 'handler updates state' }, { from: 'state', to: 'outcome', mechanism: 'render projects state' }],
  suites: [{ id: 'search', group: 'menu', command: ['node', '-e', 'console.log("executed")'], engines: ['chromium'], timeoutMs: 1000 }],
  features: [{ id: 'find-product', label: 'Find a product', nodes: ['action'], suites: ['search'], journeys: ['search'] }],
  metricEnvironments: [{ browser: 'chromium', profile: 'throttled' }] });
const metricConfig = { version: 1, regressionPercent: 15, noiseMs: 33.4, journeys: [{ id: 'search', maxMs: 999 }], widths: [390, 1280], cycles: 2 };
const completeMetric = () => ({ environment: { browser: 'chromium', browserVersion: 'fixture', profile: 'throttled', widths: metricConfig.widths, cycles: metricConfig.cycles,
  cpu: 4, latencyMs: 150, downloadMbps: 1.6, serviceWorkers: 'blocked', motion: 'no-preference', cache: 'fresh context per width/cycle' }, journeys:
  metricConfig.widths.flatMap(width => [0, 1].map(cycle => ({ id: 'search', width, cycle, status: 'PASS', durationMs: 123, assertions: { expectedState: true }, errors: [], frameGaps: [], longTasks: [] }))) });

test('registry accepts executable DAG and rejects dangling/duplicate nodes and cycles', () => {
  assert.deepEqual(validateRegistry(fixture()), []);
  const duplicate = fixture(); duplicate.nodes.push({ id: 'action' }); assert.match(validateRegistry(duplicate).join(), /Duplicate/);
  const missing = fixture(); missing.edges[0].to = 'unknown'; assert.match(validateRegistry(missing).join(), /Unknown graph edge/);
  const cycle = fixture(); cycle.edges.push({ from: 'outcome', to: 'action', mechanism: 'bad circular inference' }); assert.match(validateRegistry(cycle).join(), /cycle/);
});

test('registry rejects missing feature checks, unknown references and unbounded commands', () => {
  const empty = fixture(); empty.features[0].suites = []; empty.features[0].journeys = []; assert.match(validateRegistry(empty).join(), /no executable check/);
  const unknown = fixture(); unknown.features[0].suites = ['absent']; assert.match(validateRegistry(unknown).join(), /Unknown suites reference/);
  const command = fixture(); command.suites[0].command = ['bash', '-c', 'true']; assert.match(validateRegistry(command).join(), /Invalid command/);
  const timeout = fixture(); timeout.suites[0].timeoutMs = 0; assert.match(validateRegistry(timeout).join(), /Invalid timeout/);
});

test('unsupported engines/groups fail and an unsupported suite is not executed', () => {
  assert.throws(() => selectSuites(fixture(), 'menu', 'safari'), /Unsupported browser/);
  assert.throws(() => selectSuites(fixture(), 'missing', 'chromium'), /Unknown suite group/);
  assert.deepEqual(selectSuites(fixture(), 'menu', 'webkit'), []);
});

test('feature evidence cannot pass when a suite or journey did not run', () => {
  const suite = { id: 'search', browser: 'chromium', status: 'PASS' };
  assert.equal(summarizeFeatures(fixture(), [suite])[0].status, 'NOT_RUN');
  assert.equal(summarizeFeatures(fixture(), [], [{ id: 'search', status: 'PASS' }])[0].status, 'NOT_RUN');
  assert.equal(summarizeFeatures(fixture(), [suite], [{ id: 'search', status: 'PASS' }])[0].status, 'PASS');
  assert.equal(summarizeFeatures(fixture(), [{ ...suite, status: 'TIMEOUT' }], [])[0].status, 'FAIL');
});

test('every declared engine is required even if another engine passes', () => {
  const registry = fixture(); registry.suites[0].engines.push('webkit');
  const result = summarizeFeatures(registry, [{ id: 'search', browser: 'chromium', status: 'PASS' }], [{ id: 'search', status: 'PASS' }])[0];
  assert.equal(result.status, 'NOT_RUN'); assert.deepEqual(result.missing, ['suite:search/webkit']);
});

test('metric coverage requires all viewport/cycle coordinates, finite timings and unique samples', () => {
  assert.equal(summarizeJourneyCoverage(fixture(), metricConfig, [completeMetric()]).journeys[0].status, 'PASS');
  const partial = completeMetric(); partial.journeys.pop(); assert.equal(summarizeJourneyCoverage(fixture(), metricConfig, [partial]).journeys[0].status, 'NOT_RUN');
  const failed = completeMetric(); failed.journeys[0].durationMs = null; assert.equal(summarizeJourneyCoverage(fixture(), metricConfig, [failed]).journeys[0].status, 'FAIL');
  assert.match(summarizeJourneyCoverage(fixture(), metricConfig, [completeMetric(), completeMetric()]).errors.join(), /Duplicate metric coordinate/);
  const unexpected = completeMetric(); unexpected.journeys[0].width = 999; assert.match(summarizeJourneyCoverage(fixture(), metricConfig, [unexpected]).errors.join(), /Unexpected metric coordinate/);
});

test('metric coverage cannot pass an undeclared environment or absent environment matrix', () => {
  const wrong = completeMetric(); wrong.environment.browser = 'webkit';
  const result = summarizeJourneyCoverage(fixture(), metricConfig, [wrong]);
  assert.equal(result.journeys[0].status, 'NOT_RUN'); assert.ok(result.errors.length);
  const registry = fixture(); delete registry.metricEnvironments;
  assert.equal(summarizeJourneyCoverage(registry, metricConfig, [completeMetric()]).journeys[0].status, 'NOT_RUN');
});

test('dependency propagation stays a bounded reachability calculation', () => {
  assert.deepEqual(downstreamNodes(fixture(), ['state']), ['state', 'outcome']);
  assert.deepEqual(downstreamNodes(fixture(), ['action']), ['action', 'state', 'outcome']);
});

test('runner preserves real exit code, stdout and stderr, with log digests', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-suite-'));
  try {
    const suite = { ...fixture().suites[0], command: ['node', '-e', 'console.log("visible"); console.error("failure evidence"); process.exit(7)'] };
    const result = await executeSuite(suite, { root: directory, output: directory, browser: 'chromium' });
    assert.equal(result.status, 'FAIL'); assert.equal(result.exitCode, 7);
    assert.match(readFileSync(join(directory, result.logs.stdout), 'utf8'), /visible/);
    assert.match(readFileSync(join(directory, result.logs.stderr), 'utf8'), /failure evidence/);
    assert.equal(result.logSha256.stdout, digest(readFileSync(join(directory, result.logs.stdout))));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('runner terminates a hung command instead of reporting a successful test', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-timeout-'));
  try {
    const suite = { ...fixture().suites[0], command: ['node', '-e', 'setInterval(()=>{},1000)'], timeoutMs: 50 };
    const result = await executeSuite(suite, { root: directory, output: directory, browser: 'chromium' });
    assert.equal(result.status, 'TIMEOUT'); assert.notEqual(result.exitCode, 0); assert.ok(result.durationMs < 3000);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('engine placeholders are arguments/environment, never interpreted by a shell', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-env-'));
  try {
    const suite = { ...fixture().suites[0], env: { BROWSER: '{browser}' }, command: ['node', '-e', 'console.log(process.env.BROWSER);console.log(process.argv[1])', '$(touch SHOULD_NOT_EXIST)'] };
    const result = await executeSuite(suite, { root: directory, output: directory, browser: 'webkit' });
    assert.equal(result.status, 'PASS'); assert.match(readFileSync(join(directory, result.logs.stdout), 'utf8'), /webkit\n\$\(touch SHOULD_NOT_EXIST\)/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('identity detects changed HEAD and changed untracked/working source bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-identity-'));
  const git = args => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  try {
    git(['init']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid']);
    writeFileSync(join(directory, 'source.js'), 'one'); git(['add', '.']); git(['commit', '-m', 'baseline']);
    const initial = captureIdentity(directory); assert.equal(initial.dirty, false);
    writeFileSync(join(directory, 'source.js'), 'two'); const edited = captureIdentity(directory);
    assert.equal(sameIdentity(initial, edited), false); assert.equal(edited.head, initial.head);
    git(['add', '.']); git(['commit', '-m', 'new head']); assert.equal(sameIdentity(initial, captureIdentity(directory)), false);
    writeFileSync(join(directory, 'untracked.js'), 'a'); const a = captureIdentity(directory);
    writeFileSync(join(directory, 'untracked.js'), 'b'); assert.equal(sameIdentity(a, captureIdentity(directory)), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('aggregate CLI rejects missing logs, partial samples, duplicates and stale source', () => {
  const directory = mkdtempSync(join(tmpdir(), 'robys-aggregate-'));
  const git = args => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  try {
    for (const path of ['scripts', 'qa', '.artifacts/source/suite', '.artifacts/source/metrics', '.artifacts/source/baseline', '.artifacts/source/comparison']) mkdirSync(join(directory, path), { recursive: true });
    for (const name of ['regression-pipeline-lib.mjs', 'run-regression-pipeline.mjs', 'aggregate-regression-pipeline.mjs', 'compare-regression-journeys.mjs', 'measure-regression-journeys.mjs']) writeFileSync(join(directory, 'scripts', name), readFileSync(new URL(`./${name}`, import.meta.url)));
    writeFileSync(join(directory, '.gitignore'), '.artifacts/\n');
    const registry = fixture(), registryBytes = JSON.stringify(registry), configBytes = JSON.stringify(metricConfig);
    writeFileSync(join(directory, 'qa/regression-pipeline.json'), registryBytes);
    writeFileSync(join(directory, 'qa/regression-journeys.json'), configBytes);
    git(['init']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid']); git(['add', '.']); git(['commit', '-m', 'baseline']);
    const baselineIdentity = captureIdentity(directory);
    writeFileSync(join(directory, 'source.js'), 'candidate'); git(['add', '.']); git(['commit', '-m', 'candidate']);
    const initial = captureIdentity(directory), env = { ...process.env, ROBYS_EXPECTED_HEAD: initial.head };
    const identity = { expectedHead: initial.head, initial, final: initial, status: 'PASS' };
    const run = spawnSync(process.execPath, ['scripts/run-regression-pipeline.mjs', '--group=menu', '--browser=chromium', '--output=.artifacts/source/suite'], { cwd: directory, env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const harnessDigest = digest(Buffer.concat(['measure-regression-journeys.mjs', 'regression-pipeline-lib.mjs'].map(name => readFileSync(join(directory, 'scripts', name)))));
    const metrics = { protocol: 1, kind: 'journey-run', label: 'candidate', status: 'PASS', applicationErrors: [], identity, harnessDigest, configDigest: digest(configBytes), ...completeMetric() };
    const baseline = { ...structuredClone(metrics), label: 'baseline', identity: { expectedHead: baselineIdentity.head, initial: baselineIdentity, final: baselineIdentity, status: 'PASS' } };
    const comparison = compareRegressionJourneys(baseline, metrics, metricConfig, digest(configBytes));
    assert.equal(comparison.status, 'PASS', comparison.validationErrors.join('; '));
    const metricFile = join(directory, '.artifacts/source/metrics/report.json');
    writeFileSync(metricFile, JSON.stringify(metrics));
    writeFileSync(join(directory, '.artifacts/source/baseline/report.json'), JSON.stringify(baseline));
    writeFileSync(join(directory, '.artifacts/source/comparison/report.json'), JSON.stringify(comparison));
    const aggregate = () => {
      const process = spawnSync(globalThis.process.execPath, ['scripts/aggregate-regression-pipeline.mjs', '.artifacts/source', '--output=.artifacts/summary'], { cwd: directory, env, encoding: 'utf8' });
      return { exit: process.status, report: JSON.parse(readFileSync(join(directory, '.artifacts/summary/report.json'))) };
    };
    const complete = aggregate(); assert.equal(complete.exit, 0, `Complete executed suite and metric matrix should pass: ${complete.report.errors.join('; ')}`);
    const suiteFile = join(directory, '.artifacts/source/suite/report.json'), suiteBytes = readFileSync(suiteFile);
    const incompleteIdentity = JSON.parse(suiteBytes); delete incompleteIdentity.identity.final;
    writeFileSync(suiteFile, JSON.stringify(incompleteIdentity));
    let result = aggregate(); assert.notEqual(result.exit, 0); assert.match(result.report.errors.join(), /Missing exact-head identity envelope/);
    writeFileSync(suiteFile, suiteBytes);
    const stdoutFile = join(directory, '.artifacts/source/suite/search.stdout.log'), stdout = readFileSync(stdoutFile);
    writeFileSync(stdoutFile, 'modified');
    result = aggregate(); assert.notEqual(result.exit, 0); assert.match(result.report.errors.join(), /modified stdout log/);
    writeFileSync(stdoutFile, stdout);
    writeFileSync(metricFile, JSON.stringify({ ...metrics, journeys: metrics.journeys.slice(1) }));
    result = aggregate(); assert.notEqual(result.exit, 0); assert.equal(result.report.features[0].status, 'NOT_RUN');
    writeFileSync(metricFile, JSON.stringify({ ...metrics, journeys: [...metrics.journeys, metrics.journeys[0]] }));
    result = aggregate(); assert.notEqual(result.exit, 0); assert.match(result.report.errors.join(), /Duplicate metric coordinate/);
    const fastWrong = structuredClone(metrics); fastWrong.journeys[0].assertions.expectedState = false;
    writeFileSync(metricFile, JSON.stringify(fastWrong));
    result = aggregate(); assert.notEqual(result.exit, 0); assert.match(result.report.errors.join(), /Independent raw metric comparison failed/);
    const changedTiming = structuredClone(metrics); changedTiming.journeys[0].durationMs = 125;
    writeFileSync(metricFile, JSON.stringify(changedTiming));
    result = aggregate(); assert.notEqual(result.exit, 0); assert.match(result.report.errors.join(), /Published comparison differs from raw evidence/);
    writeFileSync(metricFile, JSON.stringify(metrics));
    writeFileSync(join(directory, 'new-source.js'), 'changed source');
    result = aggregate(); assert.notEqual(result.exit, 0); assert.match(result.report.errors.join(), /Stale or mismatched source identity/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
