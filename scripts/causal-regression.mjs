import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, constants, createWriteStream, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REGISTRY = 'qa/causal-regression-graph.json';
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z][a-z0-9-]*$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); };
const git = (args, root = ROOT) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = message => { throw new Error(message); };
const unique = values => [...new Set(values)];
const escaped = value => String(value).replace(/[&<>|\r\n]/g, ' ');

export function safePath(value) {
  return typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !value.includes('\\')
    && !value.split('/').some(part => part === '..' || part === '.' || part === '');
}

export function matchesPath(path, pattern) {
  // Explicit, anchored slash-aware globs. A double star can span directories.
  let expression = '^';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { expression += '(?:.*/)?'; i += 2; }
      else { expression += '.*'; i++; }
    } else if (pattern[i] === '*') expression += '[^/]*';
    else expression += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(expression + '$').test(path);
}

export function commandArgv(command, scripts = {}) {
  if (typeof command !== 'string' || !command.trim() || /[;&|`$<>\r\n"'\\]/.test(command)) fail('Unsafe check command');
  const args = command.split(/\s+/);
  if (args.length === 3 && args[0] === 'npm' && args[1] === 'run' && Object.hasOwn(scripts, args[2])) return ['npm', 'run', args[2]];
  const script = arg => /^scripts\/[a-zA-Z0-9_./-]+\.mjs$/.test(arg) && !arg.split('/').includes('..');
  if (args[0] === 'node' && args.length >= 2 && args.slice(1).every(arg => /^[a-zA-Z0-9_./:-]+$/.test(arg) && !arg.split('/').includes('..'))
    && (script(args[1]) || (args[1] === '--test' && args.length > 2 && args.slice(2).every(script)))) return [process.execPath, ...args.slice(1)];
  fail(`Unsupported check command: ${command}`);
}

export function validateGraph(graph, { files, scripts, featureIds } = {}) {
  if (graph.schemaVersion !== 1) fail('Unsupported graph schemaVersion');
  const groups = ['components', 'checks', 'journeys'];
  const maps = {};
  for (const group of groups) {
    if (!Array.isArray(graph[group]) || graph[group].length === 0) fail(`Missing ${group}`);
    maps[group] = new Map();
    for (const node of graph[group]) {
      if (!ID.test(node.id) || maps[group].has(node.id)) fail(`Invalid or duplicate ${group} id: ${node.id}`);
      if (typeof node.label !== 'string' || !node.label.trim()) fail(`Missing label: ${node.id}`);
      maps[group].set(node.id, node);
    }
  }
  const references = (ids, map, context) => {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) fail(`Invalid references: ${context}`);
    for (const id of ids) if (!map.has(id)) fail(`Unknown reference ${id}: ${context}`);
  };
  for (const component of graph.components) {
    references(component.dependsOn, maps.components, component.id);
    if (!Array.isArray(component.paths) || component.paths.length === 0) fail(`Missing source paths: ${component.id}`);
    for (const pattern of component.paths) {
      if (!safePath(pattern) || ['*', '**', '**/*'].includes(pattern)) fail(`Unsafe or unbounded path: ${pattern}`);
      if (files && !files.some(file => matchesPath(file, pattern))) fail(`Source pattern matches no tracked file: ${pattern}`);
    }
  }
  const active = new Set(), visited = new Set();
  function visit(id) {
    if (active.has(id)) fail(`Dependency cycle: ${id}`);
    if (visited.has(id)) return;
    active.add(id); maps.components.get(id).dependsOn.forEach(visit); active.delete(id); visited.add(id);
  }
  graph.components.forEach(node => visit(node.id));
  for (const check of graph.checks) {
    references(check.components, maps.components, check.id);
    if (check.components.length === 0) fail(`Unbound check: ${check.id}`);
    if (!['contract', 'browser', 'performance', 'visual', 'security'].includes(check.kind)) fail(`Invalid check kind: ${check.id}`);
    if (!['pipeline', 'existing-workflow', 'timing-probe'].includes(check.execution)) fail(`Missing execution policy: ${check.id}`);
    if (check.browsers && (!Array.isArray(check.browsers) || new Set(check.browsers).size !== check.browsers.length
      || check.browsers.some(browser => !['chromium', 'firefox', 'webkit'].includes(browser)))) fail(`Invalid browser selection: ${check.id}`);
    if (!safePath(check.workflow) || !check.workflow.startsWith('.github/workflows/') || (files && !files.includes(check.workflow))) fail(`Missing workflow: ${check.id}`);
    if (check.execution === 'pipeline' && scripts) {
      const argv = commandArgv(check.command, scripts);
      for (const arg of argv.slice(1).filter(arg => arg.startsWith('scripts/'))) if (!files.includes(arg)) fail(`Missing check script: ${arg}`);
    }
  }
  for (const [id, command] of [['source-contracts', 'npm run check'], ['security-contracts', 'npm run verify:security']]) {
    const check = maps.checks.get(id);
    if (!check || check.always !== true || check.execution !== 'pipeline' || check.command !== command) fail(`Mandatory baseline check changed: ${id}`);
  }
  for (const journey of graph.journeys) {
    references(journey.components, maps.components, journey.id); references(journey.checks, maps.checks, journey.id);
    if (journey.components.length === 0 || journey.checks.length === 0 || !Array.isArray(journey.metrics)) fail(`Unbound journey: ${journey.id}`);
    const metricIds = new Set();
    for (const metric of journey.metrics) {
      if (!/^[a-z][a-z0-9_]*$/.test(metric.id) || metricIds.has(metric.id) || metric.unit !== 'ms' || !Number.isFinite(metric.max) || metric.max <= 0
        || typeof metric.enforced !== 'boolean' || !metric.authority?.trim()) fail(`Invalid metric: ${journey.id}`);
      metricIds.add(metric.id);
    }
  }
  if (!Array.isArray(graph.featureCoverage)) fail('Missing feature coverage');
  const covered = new Set();
  for (const feature of graph.featureCoverage) {
    if (!feature.featureId || covered.has(feature.featureId) || !['mapped', 'planned', 'gap'].includes(feature.status) || !feature.reason?.trim()) fail('Invalid feature coverage');
    references(feature.journeys, maps.journeys, feature.featureId);
    if (feature.status === 'mapped' && feature.journeys.length === 0) fail(`Mapped feature has no journey: ${feature.featureId}`);
    covered.add(feature.featureId);
  }
  if (featureIds && (featureIds.some(id => !covered.has(id)) || [...covered].some(id => !featureIds.includes(id)))) fail('Feature coverage differs from TRACE-001 feature IDs');
  return graph;
}

export function impactPlan(graph, changedPaths, scope = 'affected') {
  if (!['all', 'affected'].includes(scope)) fail('Invalid scope');
  if (!Array.isArray(changedPaths) || changedPaths.some(path => !safePath(path))) fail('Invalid changed paths');
  const direct = graph.components.filter(node => changedPaths.some(path => node.paths.some(pattern => matchesPath(path, pattern)))).map(node => node.id);
  const impacted = new Set(scope === 'all' ? graph.components.map(node => node.id) : direct);
  let progress = true;
  while (progress) {
    progress = false;
    for (const node of graph.components) if (!impacted.has(node.id) && node.dependsOn.some(id => impacted.has(id))) { impacted.add(node.id); progress = true; }
  }
  const checks = graph.checks.filter(check => check.always === true || check.components.some(id => impacted.has(id)));
  const selectedChecks = checks.filter(check => check.execution === 'pipeline').map(check => check.id);
  return { scope, changedPaths: unique(changedPaths).sort(), directComponents: direct, impactedComponents: [...impacted].sort(),
    impactedJourneys: graph.journeys.filter(journey => journey.components.some(id => impacted.has(id))).map(journey => journey.id),
    selectedChecks, externalChecks: checks.filter(check => check.execution === 'existing-workflow').map(check => check.id),
    unmappedPaths: changedPaths.filter(path => !graph.components.some(node => node.paths.some(pattern => matchesPath(path, pattern)))),
    matrix: { include: checks.filter(check => check.execution === 'pipeline').map(check => ({ id: check.id, kind: check.kind, browsers: check.browsers ?? [] })) } };
}

export function assertMappedPlan(plan) {
  if (!Array.isArray(plan?.unmappedPaths) || plan.unmappedPaths.length) fail(`Plan has unmapped changed paths: ${JSON.stringify(plan?.unmappedPaths ?? null)}`);
  return plan;
}

function sourceIdentity(root = ROOT) {
  return { revision: git(['rev-parse', 'HEAD'], root), tree: git(['rev-parse', 'HEAD^{tree}'], root),
    dirty: git(['status', '--porcelain', '--untracked-files=normal'], root).length > 0 };
}
function loadGraph() {
  const packageJson = readJson(resolve(ROOT, 'package.json'));
  const matrix = readJson(resolve(ROOT, 'qa/feature-traceability-matrix.json'));
  const featureIds = matrix.featureFiles.flatMap(file => readJson(resolve(ROOT, file)).features.map(feature => feature.id));
  // Include new files during local development; the clean-head execution guard remains separate.
  const files = unique(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean));
  const bytes = readFileSync(resolve(ROOT, REGISTRY));
  const graph = validateGraph(JSON.parse(bytes), { files, scripts: packageJson.scripts, featureIds });
  const policy = readJson(resolve(ROOT, 'qa/journey-latency-budgets.json'));
  for (const [id, budget] of Object.entries(policy.journeys)) {
    const metric = graph.journeys.find(journey => journey.id === id)?.metrics.find(metric => metric.id === policy.metricId);
    if (!metric || metric.max !== budget.maxMs || metric.enforced !== budget.enforced) fail(`Timing registry/policy mismatch: ${id}`);
    if (['menu-switch-feed', 'menu-switch-list'].includes(id) && (!budget.enforced || budget.maxMs > 999)) fail('View-switch owner budget cannot be weakened');
  }
  return { graph, digest: sha256(bytes), scripts: packageJson.scripts };
}

function runtimeIdentity() {
  const manifestBytes = readFileSync(resolve(ROOT, 'integrity-manifest.json'));
  const hash = createHash('sha256').update(manifestBytes), seen = new Set();
  for (const file of [...JSON.parse(manifestBytes).files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!safePath(file.path) || seen.has(file.path)) fail('Invalid runtime manifest path');
    seen.add(file.path); const bytes = readFileSync(resolve(ROOT, file.path));
    hash.update(JSON.stringify({ path: file.path, bytes: bytes.length, sha256: sha256(bytes) }));
  }
  return { sha256: hash.digest('hex'), files: seen.size };
}
export function graphMermaid(graph) {
  const lines = ['flowchart TD'];
  for (const node of graph.components) lines.push(`  c_${node.id.replaceAll('-', '_')}["${escaped(node.label).replaceAll('"', '')}"]`);
  for (const node of graph.components) for (const dependency of node.dependsOn) lines.push(`  c_${dependency.replaceAll('-', '_')} -->|potential impact| c_${node.id.replaceAll('-', '_')}`);
  for (const journey of graph.journeys) {
    const j = `j_${journey.id.replaceAll('-', '_')}`;
    lines.push(`  ${j}["${escaped(journey.label).replaceAll('"', '')}"]`);
    for (const component of journey.components) lines.push(`  c_${component.replaceAll('-', '_')} --> ${j}`);
    for (const check of journey.checks) lines.push(`  ${j} --> k_${check.replaceAll('-', '_')}`);
  }
  for (const check of graph.checks) lines.push(`  k_${check.id.replaceAll('-', '_')}["${escaped(check.label).replaceAll('"', '')}"]`);
  return lines.join('\n') + '\n';
}

// Wall clocks may differ slightly across CI jobs. This is a bounded sanity
// contract for recorded evidence, not authentication of an artifact producer.
const CLOCK_SKEW_MS = 2000;
function executionWindow(record, plan, now, requireDuration = false) {
  const errors = [], started = Date.parse(record.startedAt), finished = Date.parse(record.finishedAt), planned = Date.parse(plan.createdAt);
  if (!Number.isFinite(now) || !Number.isFinite(planned) || !Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) errors.push('invalid execution times');
  else {
    if (planned > now + CLOCK_SKEW_MS || started < planned - CLOCK_SKEW_MS || finished > now + CLOCK_SKEW_MS) errors.push('execution interval is outside the plan/collection clock window');
    if (requireDuration && (!Number.isFinite(record.durationMs) || record.durationMs <= 0
      || Math.abs(record.durationMs - (finished - started)) > Math.max(1000, (finished - started) * .02))) errors.push('monotonic duration differs from the wall-clock interval');
  }
  return { errors, started, finished };
}

export function verifyReceipt(receipt, plan, check, verifyArtifact = () => true, { now = Date.now() } = {}) {
  const errors = [];
  if (receipt.schemaVersion !== 1 || receipt.checkId !== check.id || receipt.complete !== true) errors.push('incomplete or foreign receipt');
  if (receipt.source?.revision !== plan.source.revision || receipt.source?.tree !== plan.source.tree || receipt.source?.dirty !== false) errors.push('stale or dirty source');
  if (receipt.registrySha256 !== plan.registrySha256 || receipt.command !== check.command) errors.push('registry or command mismatch');
  if (receipt.exitCode !== 0 || receipt.signal || receipt.timedOut || receipt.status !== 'PASS') errors.push('command did not pass');
  errors.push(...executionWindow(receipt, plan, now, true).errors);
  if (receipt.selection?.mode !== 'full' || receipt.selection?.filters?.length) errors.push('filtered or undeclared execution');
  if (!Array.isArray(receipt.artifacts) || receipt.artifacts.length === 0 || receipt.artifacts.some(artifact => !safePath(artifact.path)
    || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isInteger(artifact.bytes) || artifact.bytes < 0 || !verifyArtifact(artifact))) errors.push('missing or altered artifacts');
  if (Array.isArray(receipt.artifacts) && new Set(receipt.artifacts.map(artifact => artifact.path)).size !== receipt.artifacts.length) errors.push('duplicate artifacts');
  return { status: errors.length ? (receipt.source?.revision !== plan.source.revision ? 'STALE' : receipt.status === 'FAIL' ? 'FAIL' : 'INCOMPLETE') : 'PASS', errors };
}

export function expectedTimingMatrix(policy) {
  return policy.matrix.widths.flatMap(width => policy.matrix.languages.flatMap(language => policy.matrix.motions.flatMap(motion =>
    Array.from({ length: policy.matrix.attemptsDefault }, (_, i) => Object.keys(policy.journeys).map(journeyId => ({ journeyId, metricId: policy.metricId,
      profile: `${width === 390 ? 'mobile390' : 'desktop1280'}-${language}-${motion}`, attempt: i + 1 }))).flat())));
}

export function evaluateTimings(report, plan, graph, policy = readJson(resolve(ROOT, 'qa/journey-latency-budgets.json')), { now = Date.now() } = {}) {
  const errors = [], rows = [];
  if (!report) return { status: 'NOT_RUN', errors: ['Timing report not provided'], rows };
  if (report.schemaVersion !== 1 || report.complete !== true || report.source?.revision !== plan.source.revision || report.source?.tree !== plan.source.tree || report.source?.dirty !== false) errors.push('Incomplete, stale or dirty timing evidence');
  if (report.environment?.browser !== 'chromium' || report.environment?.cpuRate !== 4 || report.environment?.latencyMs !== 150
    || report.environment?.downloadMbps !== 1.6 || report.environment?.serviceWorkers !== 'blocked') errors.push('Unexpected timing environment');
  const window = executionWindow(report, plan, now); errors.push(...window.errors);
  let declaredOrigin;
  try {
    const url = new URL(report.environment?.origin);
    if (url.protocol !== 'https:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.origin !== report.environment.origin) throw new Error('Origin must be canonical local HTTPS');
    declaredOrigin = url.origin;
  } catch { errors.push('Timing origin is not an explicit loopback HTTPS origin'); }
  const expected = expectedTimingMatrix(policy);
  if (report.environment?.networkGuard !== 'loopback-only CONNECT proxy'
    || report.environment?.cache !== 'per-context fetch-to-stylesheet reuse and external denial observed') errors.push('Timing cache/network guard contract was not declared');
  const contexts = new Set(expected.map(sample => `${sample.profile}|${sample.attempt}`)), proofs = new Set();
  if (!Array.isArray(report.cacheProofs)) errors.push('Missing per-context HTTP cache/network guard evidence');
  for (const proof of Array.isArray(report.cacheProofs) ? report.cacheProofs : []) {
    const id = `${proof.profile}|${proof.attempt}`;
    if (!contexts.has(id) || proofs.has(id)) errors.push(`Unexpected or duplicate cache proof: ${id}`);
    proofs.add(id);
    try {
      const url = new URL(proof.url), external = new URL(proof.external?.url), entries = proof.entries;
      if (proof.origin !== declaredOrigin || url.origin !== declaredOrigin || url.pathname !== '/menu-feed.css'
        || !url.searchParams.get('journey-cache-proof') || url.username || url.password
        || !Number.isFinite(proof.start) || !Number.isFinite(proof.end) || proof.end <= proof.start
        || proof.start < window.started - CLOCK_SKEW_MS || proof.end > window.finished + CLOCK_SKEW_MS
        || !Number.isInteger(proof.proxyLocalConnections) || proof.proxyLocalConnections < 1
        || !Array.isArray(entries) || entries.length !== 3 || entries[0].initiatorType !== 'fetch' || !Number.isFinite(entries[0].transferSize) || !(entries[0].transferSize > 0)
        || entries[1].initiatorType !== 'fetch' || entries[2].initiatorType !== 'link'
        || entries.some(entry => !Number.isFinite(entry.decodedBodySize) || entry.decodedBodySize <= 0 || entry.decodedBodySize !== entries[0].decodedBodySize)
        || entries.slice(1).some(entry => entry.transferSize !== 0)
        || external.protocol !== 'https:' || !/^journey-deny-[a-f0-9-]+\.invalid$/.test(external.hostname)
        || external.username || external.password || external.port || external.pathname !== '/blocked'
        || proof.external.rejected !== true || proof.external.proxyDenied !== true) throw Error('Cache or denial was not observed');
    } catch { errors.push(`Invalid HTTP cache/network guard proof: ${id}`); }
  }
  if (proofs.size !== contexts.size || [...contexts].some(id => !proofs.has(id))) errors.push('Missing cache proof for an expected timing context');
  if (!Array.isArray(report.expectedSamples) || report.expectedSamples.length !== expected.length || !Array.isArray(report.samples)) errors.push('Missing declared timing sample matrix');
  const key = sample => `${sample.journeyId}|${sample.metricId}|${sample.profile}|${sample.attempt}`;
  const samples = new Map(), transitionIds = new Set();
  let semanticFailure = false;
  for (const sample of report.samples ?? []) {
    const id = key(sample);
    if (samples.has(id)) errors.push(`Duplicate timing sample: ${id}`);
    samples.set(id, sample);
    if (!graph.journeys.some(journey => journey.id === sample.journeyId) || !sample.profile || !Number.isInteger(sample.attempt) || sample.attempt < 1
      || !Number.isFinite(sample.value) || sample.value <= 0 || sample.timingStatus !== 'VALID') errors.push(`Invalid timing sample: ${id}`);
    if (sample.correctnessStatus !== 'PASS' || sample.evidence?.correct !== true) semanticFailure = true;
    const evidence = sample.evidence;
    if (!evidence?.id || transitionIds.has(evidence.id) || !Number.isFinite(evidence.start) || !Number.isFinite(evidence.end)
      || evidence.end <= evidence.start || Math.abs(evidence.end - evidence.start - sample.value) > 1) errors.push(`Missing or replayed transition evidence: ${id}`);
    if (!Number.isFinite(window.started) || !Number.isFinite(window.finished) || evidence?.start < window.started - CLOCK_SKEW_MS
      || evidence?.end > window.finished + CLOCK_SKEW_MS) errors.push(`Transition epoch is outside its timing run: ${id}`);
    try {
      const url = new URL(evidence?.url);
      const expectedPath = sample.journeyId === 'menu-switch-feed' ? '/menu-feed.html' : '/menu.html';
      if (!declaredOrigin || url.origin !== declaredOrigin || url.pathname !== expectedPath || url.username || url.password) throw new Error('Wrong outcome URL');
    } catch { errors.push(`Transition outcome URL differs from its declared local journey: ${id}`); }
    if (evidence?.id) transitionIds.add(evidence.id);
  }
  const keys = new Set(expected.map(key)), declared = new Set((report.expectedSamples ?? []).map(key));
  if (keys.size !== expected.length || keys.size !== samples.size || [...keys].some(id => !samples.has(id))
    || declared.size !== keys.size || [...keys].some(id => !declared.has(id))) errors.push('Missing, additional or duplicate timing samples');
  for (const journey of graph.journeys.filter(journey => journey.metrics.length)) for (const metric of journey.metrics) {
    const authority = policy.journeys[journey.id];
    if (!authority || authority.maxMs !== metric.max || authority.enforced !== metric.enforced) errors.push(`Metric policy mismatch: ${journey.id}`);
    const values = [...samples.values()].filter(sample => sample.journeyId === journey.id && sample.metricId === metric.id);
    if (!values.length) errors.push(`Missing measured journey: ${journey.id}/${metric.id}`);
    for (const profile of unique(values.map(sample => sample.profile))) {
      const profileSamples = values.filter(sample => sample.profile === profile);
      const numbers = profileSamples.map(sample => sample.value).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
      if (!numbers.length) continue;
      const max = Math.max(...numbers), median = numbers.length % 2 ? numbers[Math.floor(numbers.length / 2)] : (numbers[numbers.length / 2 - 1] + numbers[numbers.length / 2]) / 2;
      rows.push({ journeyId: journey.id, metricId: metric.id, profile, samples: numbers.length, median, max,
        limit: metric.max, enforced: metric.enforced, authority: metric.authority,
        status: profileSamples.some(sample => sample.correctnessStatus !== 'PASS') ? 'FAIL' : max > metric.max ? (metric.enforced ? 'FAIL' : 'OBSERVED_ABOVE_TARGET') : 'PASS' });
    }
  }
  return { status: errors.length ? 'INCOMPLETE' : semanticFailure || rows.some(row => row.status === 'FAIL') ? 'FAIL' : 'PASS', errors, rows };
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isSymbolicLink() ? [] : entry.isDirectory() ? walkFiles(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
}
export function checkedArtifact(base, artifact) {
  let descriptor;
  try {
    // Linux /proc binds containment to the opened object. A pathname checked
    // before readFileSync(path) can be replaced, including through an ancestor.
    // Refuse platforms without this descriptor-containment contract.
    if (process.platform !== 'linux' || !Number.isInteger(constants.O_NOFOLLOW) || !safePath(artifact.path)
      || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) return false;
    const root = realpathSync(base), file = resolve(base, artifact.path);
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(artifact.bytes)
      || !realpathSync(`/proc/self/fd/${descriptor}`).startsWith(root + sep)) return false;
    // Read the same descriptor that was inspected; never reopen its pathname.
    const bytes = readFileSync(descriptor), after = fstatSync(descriptor, { bigint: true });
    return before.dev === after.dev && before.ino === after.ino && before.size === after.size
      && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs
      && bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256;
  } catch { return false; }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

async function runCheck(check, head, output, loaded) {
  const source = sourceIdentity();
  const filters = Object.entries(process.env).filter(([name, value]) => value
    && (name === 'CHECKOUT_BROWSERS' || /^ROBYS_.*(?:FILTER|BROWSERS?|ENGINES)$/.test(name))).map(([name]) => name);
  const receipt = { schemaVersion: 1, checkId: check.id, source, registrySha256: loaded.digest, command: check.command,
    selection: { mode: 'full', filters, browser: process.env.CHECKOUT_BROWSERS ?? 'suite default' }, complete: false, status: 'INCOMPLETE',
    startedAt: new Date().toISOString(), finishedAt: null, durationMs: 0, exitCode: null, signal: null, timedOut: false, artifacts: [],
    evidenceScope: 'Full command execution and exit state; legacy report case completeness is not inferred.' };
  mkdirSync(output, { recursive: true });
  const logFile = resolve(output, `${check.id}.log`), started = performance.now();
  if (!SHA.test(head) || source.revision !== head || source.dirty || filters.length || check.execution !== 'pipeline') {
    save(logFile, 'Execution refused: head mismatch, dirty source, filtered selection or unsupported execution policy.\n');
  } else {
    const [command, ...args] = commandArgv(check.command, loaded.scripts);
    const log = createWriteStream(logFile);
    await new Promise(resolveResult => {
      const child = spawn(command, args, { cwd: ROOT, detached: true, env: { ...process.env, ROBYS_SOURCE_REVISION: head }, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
      const stop = signal => { try { process.kill(-child.pid, signal); } catch { /* Process already ended. */ } };
      let killTimer;
      const timer = setTimeout(() => { receipt.timedOut = true; stop('SIGTERM'); killTimer = setTimeout(() => stop('SIGKILL'), 5000); }, 20 * 60 * 1000);
      child.on('error', error => log.write(`${error.message}\n`));
      child.on('close', (code, signal) => {
        clearTimeout(timer); clearTimeout(killTimer); receipt.exitCode = code; receipt.signal = signal;
        log.end(resolveResult);
      });
    });
    receipt.complete = true;
    const after = sourceIdentity();
    receipt.status = receipt.exitCode === 0 && !receipt.signal && !receipt.timedOut && !after.dirty && after.revision === head ? 'PASS' : 'FAIL';
    if (after.dirty || after.revision !== head) receipt.source.dirty = true;
  }
  receipt.finishedAt = new Date().toISOString(); receipt.durationMs = performance.now() - started;
  const logBytes = readFileSync(logFile);
  receipt.artifacts.push({ path: `${check.id}.log`, bytes: logBytes.length, sha256: sha256(logBytes), role: 'command-log' });
  save(resolve(output, `receipt-${check.id}.json`), receipt);
  return receipt;
}

export function collectReport(plan, graph, receiptRecords, timingReport, { now = Date.now() } = {}) {
  const checks = [], errors = [];
  const byId = new Map();
  for (const record of receiptRecords) {
    if (byId.has(record.receipt.checkId)) errors.push(`Duplicate receipt: ${record.receipt.checkId}`);
    byId.set(record.receipt.checkId, record);
    if (!plan.selectedChecks.includes(record.receipt.checkId)) errors.push(`Unexpected receipt: ${record.receipt.checkId}`);
  }
  for (const check of graph.checks) {
    if (plan.selectedChecks.includes(check.id)) {
      const record = byId.get(check.id);
      const verdict = record ? verifyReceipt(record.receipt, plan, check, record.verifyArtifact, { now }) : { status: 'NOT_RUN', errors: ['Missing receipt'] };
      checks.push({ id: check.id, label: check.label, kind: check.kind, workflow: check.workflow, selected: true, ...verdict });
    } else checks.push({ id: check.id, label: check.label, kind: check.kind, workflow: check.workflow, selected: false,
      status: check.execution === 'timing-probe' ? 'SEE_TIMINGS' : check.execution === 'existing-workflow' ? 'NOT_RUN' : 'NOT_SELECTED', errors: [] });
  }
  const timings = evaluateTimings(timingReport, plan, graph, undefined, { now });
  const incomplete = errors.length || plan.source.dirty || plan.unmappedPaths.length || timings.status === 'INCOMPLETE' || timings.status === 'NOT_RUN'
    || checks.some(check => check.selected && ['INCOMPLETE', 'STALE', 'NOT_RUN'].includes(check.status));
  const failed = timings.status === 'FAIL' || checks.some(check => check.selected && check.status === 'FAIL');
  const journeys = graph.journeys.map(journey => {
    const measured = timings.rows.filter(row => row.journeyId === journey.id);
    return { id: journey.id, label: journey.label, impacted: plan.impactedJourneys.includes(journey.id),
      checks: journey.checks.map(id => ({ id, status: checks.find(check => check.id === id)?.status ?? 'NOT_RUN' })),
      timing: journey.metrics.length ? (['INCOMPLETE', 'NOT_RUN'].includes(timings.status) ? timings.status : measured.some(row => row.status === 'FAIL') ? 'FAIL' : 'PASS') : 'NOT_MEASURED',
      functionalOutcome: !journey.metrics.length ? 'NOT_ASSESSED_BY_TIMING_PROBE' : (timingReport?.samples ?? []).filter(sample => sample.journeyId === journey.id).some(sample => sample.correctnessStatus !== 'PASS') ? 'FAIL'
        : ['INCOMPLETE', 'NOT_RUN'].includes(timings.status) ? 'INCOMPLETE' : 'PASS', coverageGap: journey.coverageGap ?? null };
  });
  return { schemaVersion: 1, collectedAt: Number.isFinite(now) ? new Date(now).toISOString() : null, source: plan.source, base: plan.base, registrySha256: plan.registrySha256,
    status: failed ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS', scope: plan.scope,
    claim: 'Selected command outcomes and bounded measured journeys only. Dependency edges indicate potential impact, not confirmed root cause or release approval.',
    changedPaths: plan.changedPaths, impactedComponents: plan.impactedComponents, impactedJourneys: plan.impactedJourneys, unmappedPaths: plan.unmappedPaths,
    checks, journeys, timings, errors, timingCoverageGaps: graph.journeys.filter(journey => !journey.metrics.length).map(journey => journey.id),
    featureCoverage: graph.featureCoverage };
}

function renderReport(report) {
  const lines = ['# Robys regression evidence', '', `Status: **${report.status}** · scope: ${report.scope}`, '',
    `Source: \`${report.source.revision}\` · tree: \`${report.source.tree}\` · dirty: ${report.source.dirty}`, '', report.claim, '',
    '## Checks', '', '| Check | Evidence type | Status |', '| --- | --- | --- |',
    ...report.checks.map(check => `| ${escaped(check.label)} | ${check.kind} | ${check.status} |`), '', '## Interaction metrics', '',
    '| Journey / profile | Median ms | Max ms | Limit ms | Enforcement | Result |', '| --- | ---: | ---: | ---: | --- | --- |',
    ...report.timings.rows.map(row => `| ${row.journeyId} / ${row.profile} | ${row.median.toFixed(1)} | ${row.max.toFixed(1)} | ${row.limit} | ${row.enforced ? 'owner requirement' : 'informational'} | ${row.status} |`), '',
    '## Journey coverage', '', '| Journey | Direct functional outcome | Direct timing | Linked command evidence |', '| --- | --- | --- | --- |',
    ...report.journeys.map(journey => `| ${escaped(journey.label)} | ${journey.functionalOutcome} | ${journey.timing} | ${journey.checks.map(check => `${check.id}: ${check.status}`).join('; ')} |`), '',
    '## Gaps', '', `Timing not measured for: ${report.timingCoverageGaps.join(', ') || 'none'}.`,
    `Unmapped changed paths: ${report.unmappedPaths.join(', ') || 'none'}.`,
    ...report.journeys.filter(journey => journey.coverageGap).map(journey => `- ${journey.id}: ${escaped(journey.coverageGap)}`),
    ...report.errors.concat(report.timings.errors, report.checks.flatMap(check => check.errors.map(error => `${check.id}: ${error}`))).map(error => `- ${escaped(error)}`), '',
    'External workflow checks shown as NOT_RUN were not imported or certified by this run. Existing CI gates remain in force.', ''];
  return lines.join('\n');
}

export function verifyPlanIdentity(plan, graph, digest, current, changedPaths, expected) {
  if (plan.schemaVersion !== 1 || !SHA.test(plan.source?.revision ?? '') || !SHA.test(plan.source?.tree ?? '') || plan.registrySha256 !== digest
    || JSON.stringify(plan.graph) !== JSON.stringify(graph)) fail('Stale or altered plan/registry');
  if (!SHA.test(expected.head ?? '') || !SHA.test(expected.base ?? '') || plan.source.revision !== expected.head || plan.base !== expected.base) fail('Plan differs from independently supplied event revisions');
  if (current.revision !== plan.source.revision || current.tree !== plan.source.tree || current.dirty || plan.source.dirty) fail('Collector checkout differs from the clean planned source');
  const recomputed = impactPlan(graph, changedPaths, plan.scope);
  if (Object.keys(recomputed).some(key => JSON.stringify(recomputed[key]) !== JSON.stringify(plan[key]))) fail('Altered impact plan');
  return recomputed;
}

function argumentsMap(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z-]+$/.test(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(result, args[i].slice(2))) fail('Invalid CLI arguments');
    result[args[i].slice(2)] = args[i + 1];
  }
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const [mode, ...rest] = args, options = argumentsMap(rest), loaded = loadGraph(), { graph } = loaded;
  if (mode === 'validate') { console.log(JSON.stringify({ status: 'PASS', components: graph.components.length, journeys: graph.journeys.length, checks: graph.checks.length })); return; }
  const output = resolve(options.output ?? '.artifacts/causal-regression');
  if (mode === 'plan') {
    const source = sourceIdentity(), head = options.head ?? source.revision, base = options.base;
    if (!SHA.test(head) || !SHA.test(base ?? '') || source.revision !== head) fail('Plan requires exact checked-out head and base SHAs');
    git(['cat-file', '-e', `${base}^{commit}`]);
    const changedPaths = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    const plan = { schemaVersion: 1, createdAt: new Date().toISOString(), source, base, registrySha256: loaded.digest,
      graph, ...impactPlan(graph, changedPaths, options.scope ?? 'affected') };
    save(resolve(output, 'plan.json'), plan); save(resolve(output, 'graph.mmd'), graphMermaid(graph));
    save(resolve(output, 'impact.md'), `# Potential regression impact\n\nHead: ${head}\n\nChanged paths: ${changedPaths.length}\n\nComponents: ${plan.impactedComponents.join(', ') || 'none'}\n\nJourneys: ${plan.impactedJourneys.join(', ') || 'none'}\n\nChecks: ${plan.selectedChecks.join(', ')}\n\nUnmapped paths: ${plan.unmappedPaths.join(', ') || 'none'}\n\nThis is a dependency hypothesis; it does not identify a confirmed cause.\n`);
    console.log(JSON.stringify({ matrix: plan.matrix })); return;
  }
  if (mode === 'run-check') {
    const check = graph.checks.find(check => check.id === options.check); if (!check) fail('Unknown check');
    const receipt = await runCheck(check, options.head, output, loaded);
    console.log(JSON.stringify({ check: check.id, status: receipt.status })); if (receipt.status !== 'PASS') process.exitCode = 1; return;
  }
  if (mode === 'collect') {
    const plan = readJson(resolve(options.plan ?? resolve(output, 'plan.json')));
    const current = sourceIdentity();
    if (!SHA.test(options.base ?? '') || !SHA.test(options.head ?? '')) fail('Collection requires independently supplied --base and --head SHAs');
    git(['cat-file', '-e', `${options.base}^{commit}`]);
    const changedPaths = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', options.base, current.revision], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    verifyPlanIdentity(plan, graph, loaded.digest, current, changedPaths, { base: options.base, head: options.head });
    const files = walkFiles(resolve(options.receipts ?? output)).filter(path => /^receipt-[a-z0-9-]+\.json$/.test(path.split(sep).pop()));
    const records = files.map(file => ({ receipt: readJson(file), verifyArtifact: artifact => checkedArtifact(dirname(file), artifact) }));
    const timingReport = options.timings && existsSync(resolve(options.timings)) ? readJson(resolve(options.timings)) : null;
    const report = collectReport(plan, graph, records, timingReport);
    if (timingReport && (timingReport.harness?.sha256 !== sha256(readFileSync(resolve(ROOT, 'scripts/measure-journey-responsiveness.mjs')))
      || timingReport.harness?.policySha256 !== sha256(readFileSync(resolve(ROOT, 'qa/journey-latency-budgets.json'))))) {
      report.errors.push('Timing harness or policy digest differs from the checked-out source'); report.status = 'INCOMPLETE';
    }
    if (timingReport) {
      const runtime = runtimeIdentity();
      if (timingReport.source?.runtimeSha256 !== runtime.sha256 || timingReport.source?.finalRuntimeSha256 !== runtime.sha256 || timingReport.source?.runtimeFiles !== runtime.files) {
        report.errors.push('Measured runtime bytes differ from the checked-out source'); report.status = 'INCOMPLETE';
      }
    }
    const final = sourceIdentity();
    if (final.revision !== current.revision || final.tree !== current.tree || final.dirty) { report.errors.push('Source moved during collection'); report.status = 'INCOMPLETE'; }
    save(resolve(output, 'report.json'), report); save(resolve(output, 'report.md'), renderReport(report)); save(resolve(output, 'graph.mmd'), graphMermaid(graph));
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, timingRows: report.timings.rows.length }));
    if (report.status !== 'PASS') process.exitCode = 1; return;
  }
  fail('Usage: causal-regression.mjs validate|plan|run-check|collect [--key value]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
