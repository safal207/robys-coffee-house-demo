import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureIdentity, sameIdentity, digest, validateRegistry, selectSuites, executeSuite, summarizeFeatures, downstreamNodes, reportMarkdown } from './regression-pipeline-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(value => { const split = value.indexOf('='); if (!value.startsWith('--') || split < 0) throw new Error('Use --name=value arguments'); return [value.slice(2, split), value.slice(split + 1)]; }));
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(args.output ?? '.artifacts/causal-regression/local');
const registryPath = resolve(root, args.registry ?? 'qa/regression-pipeline.json');
mkdirSync(output, { recursive: true });
const bytes = readFileSync(registryPath), registry = JSON.parse(bytes);
const errors = validateRegistry(registry), initial = captureIdentity(root);
const expectedHead = process.env.ROBYS_EXPECTED_HEAD ?? initial.head;
if (initial.head !== expectedHead) errors.push(`Expected head ${expectedHead}; found ${initial.head}`);
const report = { version: 1, kind: 'suite-run', startedAt: new Date().toISOString(), scope: { group: args.group, browser: args.browser },
  registrySha256: digest(bytes), harnessSha256: digest(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(new URL('./regression-pipeline-lib.mjs', import.meta.url))])),
  identity: { expectedHead, initial, final: null, status: 'INCOMPLETE' }, suites: [], features: [], errors, gaps: registry.gaps ?? [] };
try {
  if (!errors.length) {
    const selected = selectSuites(registry, args.group, args.browser);
    if (!selected.length) errors.push(`No suites support ${args.group}/${args.browser}`);
    for (const suite of selected) {
      console.log(`RUN ${suite.id} (${args.browser})`);
      const result = await executeSuite(suite, { root, browser: args.browser, output });
      report.suites.push(result);
      console.log(`${result.status} ${suite.id} (${result.durationMs} ms)`);
      writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
} catch (error) { errors.push(error.message); }
report.identity.final = captureIdentity(root);
report.identity.status = sameIdentity(initial, report.identity.final) && initial.head === expectedHead && digest(readFileSync(registryPath)) === report.registrySha256 ? 'PASS' : 'HOLD';
if (report.identity.status !== 'PASS') errors.push('Source identity changed during the run');
report.features = summarizeFeatures(registry, report.suites);
report.investigation = report.features.filter(item => item.status === 'FAIL').map(item => ({ feature: item.id, nodes: downstreamNodes(registry, item.nodes), classification: 'dependency hypothesis; root cause unproven' }));
report.status = errors.length || report.suites.some(item => item.status !== 'PASS') ? 'HOLD' : report.suites.length ? 'PASS' : 'NOT_RUN';
report.completedAt = new Date().toISOString();
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(output, 'report.md'), reportMarkdown(report));
console.log(`${report.status}: ${report.suites.length} executed suites; report ${join(output, 'report.json')}`);
process.exitCode = report.status === 'PASS' ? 0 : 1;
