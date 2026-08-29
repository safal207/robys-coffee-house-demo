import { access, readFile } from 'node:fs/promises';
import {
  rankPatterns,
  renderCausalReport,
  validateBusinessTruthStatus,
  validateRegistry
} from './causal-refactoring-lib.mjs';

const REGISTRY_PATH = 'qa/causal-refactoring/registry.json';
const TRUTH_STATUS_PATH = 'qa/causal-refactoring/business-truth-status.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function verifyEvidencePaths(registry) {
  const errors = [];
  const paths = new Set();

  for (const pattern of registry.patterns ?? []) {
    for (const evidence of pattern.evidence ?? []) {
      if (typeof evidence.path === 'string') paths.add(evidence.path);
    }
  }

  for (const path of paths) {
    try {
      await access(path);
    } catch {
      errors.push(`evidence path does not exist: ${path}`);
    }
  }
  return errors;
}

try {
  const args = process.argv.slice(2);
  const allowed = new Set(['--report']);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);

  const registry = await readJson(REGISTRY_PATH);
  const truthStatus = await readJson(TRUTH_STATUS_PATH);
  const profile = await readJson(truthStatus.source);

  const errors = [
    ...validateRegistry(registry),
    ...validateBusinessTruthStatus(truthStatus, profile),
    ...await verifyEvidencePaths(registry)
  ];

  if (errors.length > 0) {
    console.error('Fractal causal refactoring contract is invalid:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    const ranked = rankPatterns(registry);
    const unresolved = truthStatus.fields.filter(
      (field) => field.owner_critical && field.attestation !== 'owner-confirmed'
    );

    console.log(
      `Fractal causal refactoring valid: ${ranked.length} patterns, `
      + `${unresolved.length} owner-critical fields pending encoded confirmation, `
      + `publication mode=${truthStatus.publication_mode}.`
    );

    if (args.includes('--report')) {
      console.log('');
      process.stdout.write(renderCausalReport(registry, truthStatus));
    }
  }
} catch (error) {
  console.error(`Unable to verify fractal causal refactoring: ${error.message}`);
  process.exitCode = 1;
}
