import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import {
  CANONICAL_BUSINESS_PROFILE_PATH,
  rankPatterns,
  renderCausalReport,
  validateBusinessTruthStatus,
  validateRegistry
} from './causal-refactoring-lib.mjs';
import { isSafeRepositoryPath } from './repository-path-lib.mjs';

const REGISTRY_PATH = 'qa/causal-refactoring/registry.json';
const TRUTH_STATUS_PATH = 'qa/causal-refactoring/business-truth-status.json';
const ROOT = await realpath(process.cwd());

function isWithinRoot(candidate) {
  return candidate === ROOT || candidate.startsWith(`${ROOT}${path.sep}`);
}

async function resolveRepositoryFile(candidate) {
  if (!isSafeRepositoryPath(candidate)) {
    throw new Error(`unsafe repository-relative path: ${candidate}`);
  }

  const absolute = path.resolve(ROOT, candidate);
  if (!isWithinRoot(absolute)) {
    throw new Error(`path escapes repository root: ${candidate}`);
  }

  const resolved = await realpath(absolute);
  if (!isWithinRoot(resolved)) {
    throw new Error(`path resolves outside repository root: ${candidate}`);
  }
  return resolved;
}

async function readJson(candidate) {
  const resolved = await resolveRepositoryFile(candidate);
  return JSON.parse(await readFile(resolved, 'utf8'));
}

async function verifyEvidencePaths(registry) {
  const errors = [];
  const paths = new Set();

  for (const pattern of registry.patterns ?? []) {
    for (const evidence of pattern.evidence ?? []) {
      if (typeof evidence.path === 'string') paths.add(evidence.path);
    }
  }

  for (const candidate of paths) {
    try {
      await resolveRepositoryFile(candidate);
    } catch (error) {
      errors.push(`invalid evidence path ${candidate}: ${error.message}`);
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
  const profile = await readJson(CANONICAL_BUSINESS_PROFILE_PATH);

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
