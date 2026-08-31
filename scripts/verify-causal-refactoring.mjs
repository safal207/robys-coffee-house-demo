import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import {
  CANONICAL_BUSINESS_PROFILE_PATH,
  OWNER_ATTESTATION_HISTORY_POLICY,
  digestBusinessValue,
  rankPatterns,
  renderCausalReport,
  validateBusinessTruthStatus,
  validateOwnerAttestationEvidence,
  validateOwnerAttestationManifest,
  validateRegistry
} from './causal-refactoring-lib.mjs';
import { isSafeRepositoryPath } from './repository-path-lib.mjs';

const REGISTRY_PATH = 'qa/causal-refactoring/registry.json';
const TRUTH_STATUS_PATH = 'qa/causal-refactoring/business-truth-status.json';
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
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
  const evidenceByPath = new Map();
  const ownerAttestations = new Map();

  const patterns = Array.isArray(registry?.patterns) ? registry.patterns : [];
  for (const pattern of patterns) {
    const evidenceItems = Array.isArray(pattern?.evidence) ? pattern.evidence : [];
    for (const evidence of evidenceItems) {
      if (evidence === null || typeof evidence !== 'object') continue;
      if (typeof evidence.path === 'string') {
        paths.add(evidence.path);
        const normalizedPath = path.posix.normalize(evidence.path.replaceAll('\\', '/'));
        const references = evidenceByPath.get(normalizedPath) ?? [];
        references.push(evidence);
        evidenceByPath.set(normalizedPath, references);
      }
      if (evidence.kind !== 'owner-attestation') continue;

      if (!SHA256_DIGEST.test(evidence.canonical_json_sha256)) {
        errors.push(
          `owner-attestation evidence ${evidence.path ?? '<missing path>'} `
          + 'canonical_json_sha256 must be sha256:<64 lowercase hex>'
        );
      }

      if (typeof evidence.path !== 'string') continue;
      const previous = ownerAttestations.get(evidence.path);
      if (previous) {
        if (previous.canonical_json_sha256 === evidence.canonical_json_sha256) {
          errors.push(`owner-attestation evidence path is duplicated: ${evidence.path}`);
        } else {
          errors.push(
            `owner-attestation evidence path has conflicting canonical_json_sha256: `
            + evidence.path
          );
        }
        continue;
      }
      ownerAttestations.set(evidence.path, evidence);
    }
  }

  for (const [candidate, expectedDigest] of Object.entries(OWNER_ATTESTATION_HISTORY_POLICY)) {
    const references = evidenceByPath.get(candidate) ?? [];
    if (references.length === 0) {
      errors.push(
        `owner-attestation history policy entry is missing from registry: ${candidate}`
      );
      continue;
    }
    if (references.length !== 1) {
      errors.push(
        `owner-attestation history policy path must appear exactly once in registry evidence: `
        + candidate
      );
      continue;
    }

    const [registered] = references;
    if (registered.kind !== 'owner-attestation') {
      errors.push(
        `owner-attestation history policy path must use kind owner-attestation: ${candidate}`
      );
    } else if (registered.canonical_json_sha256 !== expectedDigest) {
      errors.push(
        `owner-attestation evidence digest must match independent history policy: ${candidate}`
      );
    }
  }
  for (const candidate of ownerAttestations.keys()) {
    if (!Object.hasOwn(OWNER_ATTESTATION_HISTORY_POLICY, candidate)) {
      errors.push(
        `owner-attestation registry path is not declared in independent history policy: `
        + candidate
      );
    }
  }

  for (const candidate of paths) {
    try {
      await resolveRepositoryFile(candidate);
    } catch (error) {
      errors.push(`invalid evidence path ${candidate}: ${error.message}`);
    }
  }

  const manifests = new Map(Object.entries(OWNER_ATTESTATION_HISTORY_POLICY));
  for (const [candidate, evidence] of ownerAttestations) {
    if (
      !manifests.has(candidate)
      && SHA256_DIGEST.test(evidence.canonical_json_sha256)
    ) {
      manifests.set(candidate, evidence.canonical_json_sha256);
    }
  }
  for (const [candidate, expectedDigest] of manifests) {
    try {
      const resolved = await resolveRepositoryFile(candidate);
      const manifestText = await readFile(resolved, 'utf8');
      const intrinsicErrors = validateOwnerAttestationManifest(manifestText);
      for (const error of intrinsicErrors) {
        errors.push(`invalid owner-attestation history manifest ${candidate}: ${error}`);
      }
      const manifest = JSON.parse(manifestText);
      if (digestBusinessValue(manifest) !== expectedDigest) {
        errors.push(`registered owner-attestation manifest digest mismatch: ${candidate}`);
      }
    } catch (error) {
      errors.push(`invalid registered owner-attestation manifest ${candidate}: ${error.message}`);
    }
  }
  return errors;
}

async function verifyOwnerAttestation(registry, truthStatus, profile) {
  const errors = [];
  const reference = truthStatus.owner_attestation;
  if (reference === null || typeof reference !== 'object') return errors;
  if (typeof reference.path !== 'string') return errors;

  const registered = (registry.patterns ?? [])
    .flatMap((pattern) => pattern.evidence ?? [])
    .find((evidence) => (
      evidence.kind === 'owner-attestation' && evidence.path === reference.path
    ));
  if (!registered) {
    errors.push(
      'owner_attestation.path must be registered as owner-attestation causal evidence'
    );
  } else if (registered.canonical_json_sha256 !== reference.canonical_json_sha256) {
    errors.push(
      'owner_attestation.canonical_json_sha256 must match the registered '
      + 'owner-attestation evidence digest'
    );
  }
  const historicalDigest = OWNER_ATTESTATION_HISTORY_POLICY[reference.path];
  if (historicalDigest === undefined) {
    errors.push(
      'owner_attestation.path must be declared in the independent owner-attestation '
      + 'history policy'
    );
  } else if (historicalDigest !== reference.canonical_json_sha256) {
    errors.push(
      'owner_attestation.canonical_json_sha256 must match the independent '
      + 'owner-attestation history policy'
    );
  }

  try {
    const resolved = await resolveRepositoryFile(reference.path);
    const evidenceText = await readFile(resolved, 'utf8');
    errors.push(...validateOwnerAttestationEvidence(truthStatus, evidenceText, profile));
  } catch (error) {
    errors.push(`invalid owner attestation ${reference.path}: ${error.message}`);
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
    ...await verifyEvidencePaths(registry),
    ...await verifyOwnerAttestation(registry, truthStatus, profile)
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
