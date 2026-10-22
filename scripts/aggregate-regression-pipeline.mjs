import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { captureIdentity, sameIdentity, digest, validateRegistry, summarizeFeatures, summarizeJourneyCoverage, downstreamNodes, reportMarkdown } from './regression-pipeline-lib.mjs';
import { compareRegressionJourneys } from './compare-regression-journeys.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const positional = process.argv.slice(2).filter(value => !value.startsWith('--'));
const output = resolve(process.argv.find(value => value.startsWith('--output='))?.slice(9) ?? '.artifacts/causal-regression/summary');
if (positional.length !== 1) throw new Error('Usage: node scripts/aggregate-regression-pipeline.mjs <reports-directory> --output=...');
const initial = captureIdentity(root), expectedHead = process.env.ROBYS_EXPECTED_HEAD ?? initial.head;
const registryBytes = readFileSync(join(root, 'qa/regression-pipeline.json')), registry = JSON.parse(registryBytes);
const configBytes = readFileSync(join(root, 'qa/regression-journeys.json')), config = JSON.parse(configBytes);
const errors = validateRegistry(registry), reports = [], consumed = [];
if (initial.head !== expectedHead) errors.push('Aggregator checkout differs from expected head');
function walk(directory) {
  if (resolve(directory) === output) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name === 'report.json') {
      try {
        const bytes = readFileSync(file), report = JSON.parse(bytes);
        if (!['suite-run', 'journey-run', 'metric-comparison'].includes(report.kind)) continue;
        reports.push({ report, directory: dirname(file), sha256: digest(bytes) }); consumed.push({ path: file, sha256: digest(bytes) });
      } catch (error) { errors.push(`Unreadable report ${file}: ${error.message}`); }
    }
  }
}
walk(resolve(positional[0]));
const registrySha256 = digest(registryBytes), suites = [], metricReports = [], baselineReports = [], comparisons = [], comparisonBindings = [];
const suiteHarness = digest(Buffer.concat(['scripts/run-regression-pipeline.mjs', 'scripts/regression-pipeline-lib.mjs'].map(file => readFileSync(join(root, file)))));
const metricHarness = digest(Buffer.concat(['scripts/measure-regression-journeys.mjs', 'scripts/regression-pipeline-lib.mjs'].map(file => readFileSync(join(root, file)))));
for (const { report, directory, sha256 } of reports) {
  // A baseline can be slow and belongs to another revision. Retain its raw
  // bytes for independent comparison without treating it as current coverage.
  if (report.kind === 'journey-run' && report.label === 'baseline') { baselineReports.push({ report, sha256 }); continue; }
  if (report.kind === 'journey-run' && report.label !== 'candidate') { errors.push('Unknown journey run label'); continue; }
  const identity = report.identity?.initial ?? report.identity;
  if (report.identity?.status !== 'PASS' || report.identity?.expectedHead !== initial.head || !report.identity?.initial || !report.identity?.final) errors.push(`Missing exact-head identity envelope in ${report.kind}`);
  if (!sameIdentity(initial, identity)) errors.push(`Stale or mismatched source identity in ${report.kind}`);
  if (report.identity?.status && report.identity.status !== 'PASS') errors.push(`Unverified final identity in ${report.kind}`);
  if (report.identity?.final && !sameIdentity(identity, report.identity.final)) errors.push(`Source moved during ${report.kind}`);
  if (report.registrySha256 && report.registrySha256 !== registrySha256) errors.push(`Registry mismatch in ${report.kind}`);
  if (report.errors?.length || !['PASS', 'FAIL', 'HOLD'].includes(report.status)) errors.push(`Incomplete or erroneous ${report.kind}`);
  if (report.status !== 'PASS') errors.push(`A current-head ${report.kind} did not pass: ${report.status}`);
  if (report.kind === 'suite-run') {
    if (report.registrySha256 !== registrySha256 || report.harnessSha256 !== suiteHarness) errors.push('Suite registry or harness provenance mismatch');
    for (const suite of report.suites ?? []) {
      const definition = registry.suites.find(item => item.id === suite.id);
      if (definition && JSON.stringify(suite.command) !== JSON.stringify(definition.command.map(part => part.replaceAll('{browser}', suite.browser)))) errors.push(`Suite command mismatch: ${suite.id}`);
      if (suite.group !== report.scope?.group || suite.browser !== report.scope?.browser) errors.push(`Suite scope mismatch: ${suite.id}`);
      if (suite.status === 'PASS' && (suite.exitCode !== 0 || !Number.isFinite(suite.durationMs) || suite.durationMs < 0)) errors.push(`Invalid successful suite result: ${suite.id}`);
      for (const key of ['stdout', 'stderr']) {
        const path = resolve(directory, suite.logs?.[key] ?? '');
        try {
          if (!path.startsWith(resolve(directory) + sep) || !suite.logSha256?.[key] || digest(readFileSync(path)) !== suite.logSha256[key]) errors.push(`Missing or modified ${key} log: ${suite.id}`);
        } catch { errors.push(`Missing ${key} log: ${suite.id}`); }
      }
    }
    suites.push(...(report.suites ?? []));
  }
  if (report.kind === 'journey-run') {
    if (report.configDigest !== digest(configBytes)) errors.push('Metric config digest mismatch');
    if (report.harnessDigest !== metricHarness) errors.push('Metric harness provenance mismatch');
    metricReports.push(report);
  }
  if (report.kind === 'metric-comparison') {
    if (!(registry.metricEnvironments ?? []).some(item => item.browser === report.environment?.browser && item.profile === report.environment?.profile)) errors.push('Unexpected comparison environment');
    comparisons.push(report);
  }
}
const seenSuites = new Set();
for (const suite of suites) {
  const key = `${suite.id}/${suite.browser}`;
  if (seenSuites.has(key)) errors.push(`Duplicate suite evidence: ${key}`);
  seenSuites.add(key);
  const definition = registry.suites.find(item => item.id === suite.id);
  if (!definition || !definition.engines.includes(suite.browser)) errors.push(`Unknown suite evidence: ${key}`);
}
const coverage = summarizeJourneyCoverage(registry, config, metricReports); errors.push(...coverage.errors);
for (const environment of registry.metricEnvironments ?? []) {
  const matches = comparisons.filter(report => report.environment?.browser === environment.browser && report.environment?.profile === environment.profile);
  if (matches.length !== 1) errors.push(`Expected one performance comparison for ${environment.browser}/${environment.profile}; found ${matches.length}`);
  const rawCandidates = reports.filter(({ report }) => report.kind === 'journey-run' && report.label === 'candidate' && report.environment?.browser === environment.browser && report.environment?.profile === environment.profile);
  const rawBaselines = baselineReports.filter(({ report }) => report.environment?.browser === environment.browser && report.environment?.profile === environment.profile);
  if (rawCandidates.length !== 1 || rawBaselines.length !== 1) errors.push(`Expected exactly one raw baseline/candidate pair for ${environment.browser}/${environment.profile}`);
  if (rawCandidates.length === 1 && rawBaselines.length === 1) {
    const recomputed = compareRegressionJourneys(rawBaselines[0].report, rawCandidates[0].report, config, digest(configBytes));
    if (recomputed.status !== 'PASS') errors.push(`Independent raw metric comparison failed: ${environment.browser}/${environment.profile}`);
    for (const published of matches) if (!isDeepStrictEqual(recomputed, published)) errors.push(`Published comparison differs from raw evidence: ${environment.browser}/${environment.profile}`);
    comparisonBindings.push({ environment, baselineSha256: rawBaselines[0].sha256, candidateSha256: rawCandidates[0].sha256, recomputedStatus: recomputed.status });
  }
  for (const comparison of matches) {
    for (const journey of config.journeys) {
      if ((comparison.journeys ?? []).filter(item => item.id === journey.id && item.browser === environment.browser && item.profile === environment.profile).length !== 1) errors.push(`Missing or duplicate metric comparison: ${environment.browser}/${environment.profile}/${journey.id}`);
    }
  }
}
const journeys = coverage.journeys.map(row => ({ ...row,
  status: comparisons.some(report => report.journeys?.some(item => item.id === row.id && item.status !== 'PASS')) ? 'FAIL' : row.status }));
const features = summarizeFeatures(registry, suites, journeys);
const missingSuites = registry.suites.flatMap(suite => suite.engines.filter(browser => !seenSuites.has(`${suite.id}/${browser}`)).map(browser => `${suite.id}/${browser}`));
const final = captureIdentity(root);
if (!sameIdentity(initial, final)) errors.push('Aggregator source identity changed');
const report = { version: 1, kind: 'regression-summary', completedAt: new Date().toISOString(), registrySha256,
  identity: { expectedHead, initial, final, status: sameIdentity(initial, final) && initial.head === expectedHead ? 'PASS' : 'HOLD' },
  status: errors.length || suites.some(row => row.status !== 'PASS') || comparisons.some(row => row.status !== 'PASS') || features.some(row => row.status === 'FAIL') ? 'HOLD'
    : missingSuites.length || features.some(row => row.status !== 'PASS') ? 'INCOMPLETE' : 'PASS',
  errors, missingSuites, suites, journeys, features, comparisons: comparisons.map(item => ({ environment: item.environment, status: item.status })),
  consumed, comparisonBindings, gaps: registry.gaps ?? [],
  investigation: features.filter(item => item.status === 'FAIL').map(item => ({ feature: item.id, nodes: downstreamNodes(registry, item.nodes), classification: 'dependency hypothesis; root cause unproven' })) };
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(output, 'report.md'), reportMarkdown(report));
console.log(`${report.status}: ${features.filter(item => item.status === 'PASS').length}/${features.length} fully evidenced features`);
process.exitCode = report.status === 'PASS' ? 0 : 1;
