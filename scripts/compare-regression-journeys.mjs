import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const coordinate = sample => `${sample.id}/${sample.width}/${sample.cycle}`;
const quantile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const same = isDeepStrictEqual;
const snapshotFields = value => object(value) ? {
  head: value.head, tree: value.tree, dirty: value.dirty, worktreeDigest: value.worktreeDigest
} : null;

export function loadJourneyBudgets() {
  const bytes = readFileSync(new URL('../qa/regression-journeys.json', import.meta.url));
  return { config: JSON.parse(bytes), configDigest: createHash('sha256').update(bytes).digest('hex') };
}

function validateConfig(config, errors) {
  if (!object(config) || config.version !== 1) errors.push('Unsupported journey budget version');
  if (!Array.isArray(config?.widths) || !config.widths.length || !config.widths.every(width => Number.isInteger(width) && width > 0)
      || new Set(config.widths).size !== config.widths.length) errors.push('Widths must be unique positive integers');
  if (!Number.isInteger(config?.cycles) || config.cycles < 2) errors.push('At least two complete measurement cycles are required');
  if (!finite(config?.regressionPercent) || !finite(config?.noiseMs)) errors.push('Relative regression and noise budgets must be finite');
  if (!Array.isArray(config?.journeys) || !config.journeys.length) errors.push('Missing journey registry');
  const ids = new Set();
  for (const entry of config?.journeys ?? []) {
    if (!object(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) errors.push('Journey IDs must be present and unique');
    ids.add(entry?.id);
    if (!finite(entry?.maxMs) || entry.maxMs === 0) errors.push(`Invalid absolute budget: ${entry?.id}`);
  }
}

/** Validate the complete observation boundary, separately from speed budgets. */
export function validateJourneyRun(report, config, { label, expectedConfigDigest } = {}) {
  const errors = [];
  validateConfig(config, errors);
  if (errors.length) return errors;
  if (!object(report) || report.protocol !== 1 || report.kind !== 'journey-run') errors.push('Unsupported or missing journey measurement protocol');
  if (report?.label !== label) errors.push(`Expected ${label} evidence, received ${report?.label ?? 'no label'}`);
  const identity = report?.identity;
  if (!object(identity) || identity.status !== 'PASS' || !sha.test(identity.expectedHead ?? '')) errors.push('Missing or held immutable source identity');
  for (const stage of ['initial', 'final']) {
    const snapshot = identity?.[stage];
    if (!object(snapshot) || !sha.test(snapshot.head ?? '') || !sha.test(snapshot.tree ?? '')
        || typeof snapshot.dirty !== 'boolean' || !digest.test(snapshot.worktreeDigest ?? '')) errors.push(`Invalid ${stage} source snapshot`);
  }
  if (identity?.expectedHead !== identity?.initial?.head) errors.push('Initial source differs from expected head');
  if (!same(snapshotFields(identity?.initial), snapshotFields(identity?.final))) errors.push('Source changed during measurement');
  if (!digest.test(report?.harnessDigest ?? '')) errors.push('Missing measurement harness digest');
  if (!digest.test(report?.configDigest ?? '')) errors.push('Missing budget configuration digest');
  if (expectedConfigDigest && report?.configDigest !== expectedConfigDigest) errors.push('Measurement used different budget configuration bytes');
  const env = report?.environment;
  if (!object(env) || !['chromium', 'firefox', 'webkit'].includes(env.browser)) errors.push('Missing or unsupported browser engine');
  if (typeof env?.browserVersion !== 'string' || !env.browserVersion) errors.push('Missing browser version');
  if (!['native', 'throttled'].includes(env?.profile)) errors.push('Missing measurement profile');
  if (!same(env?.widths, config.widths) || env?.cycles !== config.cycles) errors.push('Measurement does not cover the configured widths and cycles');
  if (env?.serviceWorkers !== 'blocked' || env?.motion !== 'no-preference' || typeof env?.cache !== 'string' || !env.cache) errors.push('Missing cache, service-worker or motion controls');
  if (env?.profile === 'native' && (env.cpu !== 1 || env.latencyMs !== 0 || env.downloadMbps !== null)) errors.push('Native profile must declare unthrottled CPU and network');
  if (env?.profile === 'throttled' && (env.browser !== 'chromium' || env.cpu !== 4 || env.latencyMs !== 150 || env.downloadMbps !== 1.6)) errors.push('Throttled profile must use Chromium CPU ×4, 150 ms and 1.6 Mbps');
  if (!['PASS', 'FAIL'].includes(report?.status)) errors.push('Missing execution result');
  if (!Array.isArray(report?.applicationErrors) || report.applicationErrors.length) errors.push('Setup or application errors, or missing whole-run error observation');
  if (!Array.isArray(report?.journeys)) { errors.push('Missing journey observations'); return errors; }
  const expected = new Set(config.journeys.flatMap(journey => config.widths.flatMap(width =>
    Array.from({ length: config.cycles }, (_, cycle) => coordinate({ id: journey.id, width, cycle })))));
  const seen = new Set();
  for (const sample of report.journeys) {
    const key = coordinate(sample ?? {});
    if (!expected.has(key)) errors.push(`Unexpected observation ${key}`);
    if (seen.has(key)) errors.push(`Duplicate observation ${key}`);
    seen.add(key);
    if (sample?.status !== 'PASS') errors.push(`Action did not complete correctly: ${key}`);
    if (!finite(sample?.durationMs)) errors.push(`Missing or invalid action duration: ${key}`);
    if (!object(sample?.assertions) || sample.assertions.expectedState !== true
        || Object.values(sample.assertions).some(value => value === false)) errors.push(`Incorrect or unverified expected state: ${key}`);
    if (!Array.isArray(sample?.errors) || sample.errors.length) errors.push(`Application errors or missing error observation: ${key}`);
    if (!Array.isArray(sample?.frameGaps) || !sample.frameGaps.every(finite)) errors.push(`Invalid frame observations: ${key}`);
    if (!Array.isArray(sample?.longTasks) || !sample.longTasks.every(task => object(task) && finite(task.duration))) errors.push(`Invalid long-task observations: ${key}`);
  }
  for (const key of expected) if (!seen.has(key)) errors.push(`Missing observation ${key}`);
  return errors;
}

/** Identifies a timing regression; dependency paths remain diagnostic hypotheses. */
export function compareRegressionJourneys(baseline, candidate, suppliedConfig, expectedConfigDigest) {
  const loaded = suppliedConfig ? { config: suppliedConfig, configDigest: expectedConfigDigest } : loadJourneyBudgets();
  const config = loaded.config;
  const errors = [
    ...validateJourneyRun(baseline, config, { label: 'baseline', expectedConfigDigest: loaded.configDigest }).map(error => `baseline: ${error}`),
    ...validateJourneyRun(candidate, config, { label: 'candidate', expectedConfigDigest: loaded.configDigest }).map(error => `candidate: ${error}`)
  ];
  if (baseline?.identity?.initial?.head === candidate?.identity?.initial?.head) errors.push('Baseline must be a distinct immutable source revision');
  if (baseline?.harnessDigest !== candidate?.harnessDigest) errors.push('Baseline and candidate used different measurement harnesses');
  if (baseline?.configDigest !== candidate?.configDigest) errors.push('Baseline and candidate used different budget configurations');
  if (!same(baseline?.environment, candidate?.environment)) errors.push('Baseline and candidate environments differ');
  const result = {
    protocol: 1, kind: 'metric-comparison', baseline: baseline?.identity?.initial?.head ?? null,
    candidate: candidate?.identity?.initial?.head ?? null,
    identity: candidate?.identity ?? null,
    environment: candidate?.environment ?? null,
    harnessDigest: candidate?.harnessDigest ?? null, configDigest: candidate?.configDigest ?? null,
    validationErrors: errors, checks: [], actions: [],
    journeys: (config?.journeys ?? []).map(journey => ({ id: journey.id,
      browser: candidate?.environment?.browser ?? null, profile: candidate?.environment?.profile ?? null, status: 'HOLD' })),
    scope: 'Controlled local action-to-correct-visible-state timing; not field INP or proof of root cause.',
    smoothness: 'Per-action frame gaps and long tasks are diagnostic. Dedicated scroll/frame gates remain required.',
    localEvidenceOnly: Boolean(baseline?.identity?.initial?.dirty || candidate?.identity?.initial?.dirty),
    status: 'HOLD', passed: false
  };
  if (errors.length) return result;
  const check = (name, actual, limit) => result.checks.push({ name, actual, limit, passed: actual <= limit });
  for (const journey of config.journeys) for (const width of config.widths) {
    const samples = report => report.journeys.filter(sample => sample.id === journey.id && sample.width === width);
    const beforeSamples = samples(baseline), afterSamples = samples(candidate);
    const before = beforeSamples.map(sample => sample.durationMs), after = afterSamples.map(sample => sample.durationMs);
    const prefix = `${journey.id}/${width}`;
    const medianBefore = quantile(before, .5), medianAfter = quantile(after, .5);
    const p95Before = quantile(before, .95), p95After = quantile(after, .95);
    const relativeLimit = value => value * (1 + config.regressionPercent / 100) + config.noiseMs;
    check(`${prefix}/max-ms`, Math.max(...after), journey.maxMs);
    check(`${prefix}/median-ms`, medianAfter, relativeLimit(medianBefore));
    check(`${prefix}/p95-ms`, p95After, relativeLimit(p95Before));
    result.actions.push({ id: journey.id, label: journey.label ?? journey.id, width,
      baselineMedianMs: medianBefore, candidateMedianMs: medianAfter,
      baselineP95Ms: p95Before, candidateP95Ms: p95After, maximumMs: Math.max(...after),
      latencyChangePercent: medianBefore === 0 ? null : (medianAfter - medianBefore) / medianBefore * 100,
      longTaskCount: afterSamples.reduce((sum, sample) => sum + sample.longTasks.length, 0),
      maximumFrameGapMs: Math.max(0, ...afterSamples.flatMap(sample => sample.frameGaps)),
      passed: result.checks.filter(item => item.name.startsWith(`${prefix}/`)).every(item => item.passed) });
  }
  if (candidate.status !== 'PASS') result.checks.push({ name: 'candidate/execution-result', actual: candidate.status, limit: 'PASS', passed: false });
  result.passed = result.checks.every(item => item.passed);
  result.status = result.passed ? 'PASS' : 'FAIL';
  result.journeys.forEach(journey => {
    journey.status = result.actions.filter(action => action.id === journey.id).every(action => action.passed)
      ? 'PASS' : 'FAIL';
  });
  return result;
}

export function renderJourneyComparison(report) {
  const rows = (report.actions ?? []).map(action => `| ${action.id} | ${action.width} | ${action.baselineMedianMs.toFixed(1)} | ${action.candidateMedianMs.toFixed(1)} | ${action.candidateP95Ms.toFixed(1)} | ${action.maximumMs.toFixed(1)} | ${action.passed ? 'PASS' : 'FAIL'} |`);
  const diagnostics = report.validationErrors.length ? `\n${report.validationErrors.map(error => `- ${error}`).join('\n')}\n` : '';
  return `# Action regression comparison\n\nStatus: **${report.status}**\n\nBaseline: \`${report.baseline}\`\n\nCandidate: \`${report.candidate}\`\n\n${report.scope}\n\n${report.smoothness}\n${report.localEvidenceOnly ? '\nDirty local worktree evidence is retained; this report is not clean-commit release proof.\n' : ''}${diagnostics}\n| Action | Width | Before median ms | After median ms | After p95 ms | After max ms | Result |\n| --- | ---: | ---: | ---: | ---: | ---: | --- |\n${rows.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baselinePath, candidatePath, output] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error('Usage: node scripts/compare-regression-journeys.mjs baseline.json candidate.json [comparison.json]');
    process.exitCode = 2;
  } else {
    let report;
    try {
      report = compareRegressionJourneys(JSON.parse(readFileSync(baselinePath, 'utf8')), JSON.parse(readFileSync(candidatePath, 'utf8')));
    } catch (error) {
      report = { protocol: 1, kind: 'metric-comparison', identity: null, baseline: null, candidate: null, status: 'HOLD', passed: false,
        checks: [], actions: [], journeys: [], validationErrors: [`Cannot read complete comparison evidence: ${error.message}`],
        scope: 'Incomplete evidence cannot satisfy the action regression gate.', smoothness: 'Not evaluated.' };
    }
    if (output) {
      mkdirSync(dirname(resolve(output)), { recursive: true });
      writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
      writeFileSync(output.replace(/\.json$/i, '') + '.md', renderJourneyComparison(report));
    }
    console.log(`${report.status}: ${(report.checks ?? []).filter(check => check.passed).length}/${report.checks?.length ?? 0} action checks; ${report.validationErrors.length} evidence errors`);
    if (!report.passed) process.exitCode = 1;
  }
}
