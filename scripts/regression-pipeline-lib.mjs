import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, lstatSync, readlinkSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENGINES = ['node', 'chromium', 'firefox', 'webkit'];
export const digest = value => createHash('sha256').update(value).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });

// Bind a local dirty checkout as well as its commit. Artifacts belong in an
// ignored directory; tracked generated-file changes must invalidate evidence.
export function captureIdentity(root) {
  const head = git(root, ['rev-parse', 'HEAD']).toString().trim();
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']).toString().trim();
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const changes = git(root, ['diff', '--binary', 'HEAD']);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean).sort();
  const hash = createHash('sha256').update(status).update(changes);
  for (const path of untracked) {
    const file = join(root, path), stat = lstatSync(file);
    hash.update(path).update('\0').update(String(stat.mode)).update('\0');
    hash.update(stat.isSymbolicLink() ? readlinkSync(file) : readFileSync(file));
  }
  return { head, tree, dirty: status.length !== 0, worktreeDigest: hash.digest('hex') };
}

export function sameIdentity(a, b) {
  return Boolean(a && b && a.head === b.head && a.tree === b.tree && a.worktreeDigest === b.worktreeDigest);
}

export function validateRegistry(registry) {
  const errors = [];
  const sets = {};
  if (registry.version !== 1) errors.push('Unsupported registry version');
  for (const key of ['features', 'nodes', 'edges', 'suites']) {
    if (!Array.isArray(registry[key])) errors.push(`${key} must be an array`);
  }
  if (errors.length) return errors;
  for (const key of ['features', 'nodes', 'suites']) {
    sets[key] = new Set();
    for (const item of registry[key]) {
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(item.id)) errors.push(`Invalid ${key} id`);
      else if (sets[key].has(item.id)) errors.push(`Duplicate ${key} id: ${item.id}`);
      sets[key].add(item.id);
    }
  }
  const adjacency = new Map([...sets.nodes].map(id => [id, []]));
  for (const edge of registry.edges) {
    if (!sets.nodes.has(edge.from) || !sets.nodes.has(edge.to)) errors.push(`Unknown graph edge: ${edge.from} -> ${edge.to}`);
    else adjacency.get(edge.from).push(edge.to);
    if (typeof edge.mechanism !== 'string' || !edge.mechanism.trim()) errors.push(`Missing mechanism: ${edge.from} -> ${edge.to}`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency graph cycle at ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id)) visit(next);
    visiting.delete(id); visited.add(id);
  }
  for (const id of adjacency.keys()) visit(id);
  for (const suite of registry.suites) {
    if (!Array.isArray(suite.command) || !suite.command.length || suite.command.some(part => typeof part !== 'string') || !['node', 'npm', 'npx'].includes(suite.command[0])) errors.push(`Invalid command: ${suite.id}`);
    if (typeof suite.group !== 'string' || !suite.group) errors.push(`Missing group: ${suite.id}`);
    if (!Array.isArray(suite.engines) || !suite.engines.length || suite.engines.some(engine => !ENGINES.includes(engine))) errors.push(`Invalid engines: ${suite.id}`);
    if (!Number.isSafeInteger(suite.timeoutMs) || suite.timeoutMs < 1 || suite.timeoutMs > 30 * 60 * 1000) errors.push(`Invalid timeout: ${suite.id}`);
    if (suite.env && (typeof suite.env !== 'object' || Object.values(suite.env).some(value => typeof value !== 'string'))) errors.push(`Invalid environment: ${suite.id}`);
  }
  for (const feature of registry.features) {
    for (const [field, set] of [['nodes', sets.nodes], ['suites', sets.suites]]) {
      if (!Array.isArray(feature[field])) errors.push(`Missing ${field}: ${feature.id}`);
      else for (const id of feature[field]) if (!set.has(id)) errors.push(`Unknown ${field} reference: ${feature.id}/${id}`);
    }
    if (!Array.isArray(feature.journeys) || feature.journeys.some(id => typeof id !== 'string' || !id)) errors.push(`Invalid journeys: ${feature.id}`);
    if (!feature.suites?.length && !feature.journeys?.length) errors.push(`Feature has no executable check: ${feature.id}`);
  }
  return errors;
}

export function selectSuites(registry, group, browser) {
  if (!ENGINES.includes(browser)) throw new Error(`Unsupported browser: ${browser}`);
  if (!registry.suites.some(suite => suite.group === group)) throw new Error(`Unknown suite group: ${group}`);
  return registry.suites.filter(suite => suite.group === group && suite.engines.includes(browser));
}

export async function executeSuite(suite, { root, browser, output }) {
  mkdirSync(output, { recursive: true });
  const command = suite.command.map(part => part.replaceAll('{browser}', browser));
  const env = Object.fromEntries(Object.entries(suite.env ?? {}).map(([key, value]) => [key, value.replaceAll('{browser}', browser)]));
  const startedAt = new Date().toISOString(), start = performance.now();
  const logPaths = { stdout: `${suite.id}.stdout.log`, stderr: `${suite.id}.stderr.log` };
  for (const file of Object.values(logPaths)) writeFileSync(join(output, file), '');
  let timedOut = false, launchError = null;
  let child;
  const result = await new Promise(resolveResult => {
    child = spawn(command[0] === 'node' ? process.execPath : command[0], command.slice(1), {
      cwd: root, env: { ...process.env, ...env }, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* process already exited */ }
    }, suite.timeoutMs);
    child.stdout.on('data', data => appendFileSync(join(output, logPaths.stdout), data));
    child.stderr.on('data', data => appendFileSync(join(output, logPaths.stderr), data));
    child.once('error', error => { launchError = error.message; });
    child.once('close', (exitCode, signal) => { clearTimeout(timer); resolveResult({ exitCode, signal }); });
  });
  return { id: suite.id, group: suite.group, browser, command, startedAt, completedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - start),
    status: timedOut ? 'TIMEOUT' : launchError ? 'ERROR' : result.exitCode === 0 ? 'PASS' : 'FAIL', ...result, error: launchError, logs: logPaths,
    logSha256: Object.fromEntries(Object.entries(logPaths).map(([key, file]) => [key, digest(readFileSync(join(output, file)))])),
    boundary: suite.boundary ?? null, artifacts: suite.artifacts ?? [] };
}

// A metric only covers a journey when every declared engine/profile/viewport/
// cycle executed. A successful partial sample is never whole-feature evidence.
export function summarizeJourneyCoverage(registry, config, reports) {
  const rows = [], errors = [], seen = new Set();
  for (const report of reports) {
    for (const row of report.journeys ?? []) {
      const browser = report.environment?.browser, profile = report.environment?.profile;
      const coordinate = `${row.id}/${browser}/${profile}/${row.width}/${row.cycle}`;
      if (seen.has(coordinate)) errors.push(`Duplicate metric coordinate: ${coordinate}`);
      if (!(registry.metricEnvironments ?? []).some(item => item.browser === browser && item.profile === profile)
        || !config.widths.includes(row.width) || !Number.isSafeInteger(row.cycle) || row.cycle < 0 || row.cycle >= config.cycles) errors.push(`Unexpected metric coordinate: ${coordinate}`);
      seen.add(coordinate);
      rows.push({ ...row, browser, profile });
    }
  }
  const results = config.journeys.map(journey => {
    const missing = [], selected = rows.filter(row => row.id === journey.id);
    for (const environment of registry.metricEnvironments ?? []) {
      for (const width of config.widths) for (let cycle = 0; cycle < config.cycles; cycle++) {
        if (!selected.some(row => row.browser === environment.browser && row.profile === environment.profile && row.width === width && row.cycle === cycle)) missing.push(`${environment.browser}/${environment.profile}/${width}/${cycle}`);
      }
    }
    const failed = selected.some(row => row.status !== 'PASS' || !Number.isFinite(row.durationMs) || row.durationMs < 0);
    const status = failed ? 'FAIL' : missing.length || !selected.length || !(registry.metricEnvironments?.length) ? 'NOT_RUN' : 'PASS';
    return { id: journey.id, status, missing, samples: selected.length };
  });
  const allowed = new Set(config.journeys.map(item => item.id));
  for (const row of rows) if (!allowed.has(row.id)) errors.push(`Unknown metric journey: ${row.id}`);
  return { journeys: results, errors };
}

export function downstreamNodes(registry, initialIds) {
  const seen = new Set(initialIds), queue = [...initialIds];
  while (queue.length) {
    const from = queue.shift();
    for (const edge of registry.edges.filter(edge => edge.from === from)) if (!seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
  }
  return [...seen];
}

export function summarizeFeatures(registry, suiteResults, journeyResults = []) {
  const failed = value => ['FAIL', 'ERROR', 'TIMEOUT', 'HOLD'].includes(value.status);
  return registry.features.map(feature => {
    const missing = [], evidence = [];
    for (const id of feature.suites) {
      const suite = registry.suites.find(item => item.id === id);
      for (const browser of suite.engines) {
        const matches = suiteResults.filter(item => item.id === id && item.browser === browser);
        if (!matches.length) missing.push(`suite:${id}/${browser}`);
        evidence.push(...matches);
      }
    }
    for (const id of feature.journeys) {
      const matches = journeyResults.filter(item => item.id === id);
      if (!matches.length) missing.push(`journey:${id}`);
      evidence.push(...matches);
    }
    const status = evidence.some(failed) ? 'FAIL' : missing.length || evidence.some(item => item.status !== 'PASS') ? 'NOT_RUN' : 'PASS';
    return { id: feature.id, label: feature.label, status, missing, nodes: feature.nodes, evidence: evidence.map(item => ({ id: item.id, browser: item.browser ?? null, status: item.status })) };
  });
}

export function reportMarkdown(report) {
  const lines = ['# Robys causal regression', '', `Status: **${report.status}**. This reports the declared scope, not every possible product behavior.`, '',
    `Head: \`${report.identity?.initial?.head ?? 'unknown'}\`. Dirty local checkout: ${report.identity?.initial?.dirty ?? 'unknown'}.`, '',
    'Graph reachability identifies investigation paths; it does not prove a root cause.', ''];
  if (report.scope) lines.push(`Scope: ${report.scope.group}/${report.scope.browser}`, '');
  if (report.errors?.length) lines.push('Errors:', ...report.errors.map(error => `- ${error}`), '');
  if (report.suites?.length) lines.push('| Suite | Engine | Result | Duration ms |', '| --- | --- | --- | ---: |', ...report.suites.map(item => `| ${item.id} | ${item.browser} | ${item.status} | ${item.durationMs ?? ''} |`), '');
  if (report.features?.length) lines.push('| Feature | Result | Missing evidence |', '| --- | --- | --- |', ...report.features.map(item => `| ${item.label} | ${item.status} | ${item.missing.join(', ')} |`), '');
  if (report.investigation?.length) lines.push('Investigation candidates (dependency hypotheses):', ...report.investigation.map(item => `- ${item.feature}: ${item.nodes.join(' → ')}`), '');
  if (report.gaps?.length) lines.push('Declared coverage gaps:', ...report.gaps.map(gap => `- ${typeof gap === 'string' ? gap : JSON.stringify(gap)}`), '');
  return lines.join('\n') + '\n';
}
