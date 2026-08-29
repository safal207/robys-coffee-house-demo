import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CONTRACT, DEFAULT_MODEL, REPOSITORY_ROOT, TOP_KEYS, exactKeys, ok, text
} from "./causal-refactoring-core.mjs";
import {
  validateBusiness, validateDiagnosis, validateRefactor
} from "./causal-refactoring-structure.mjs";
import {
  validateClaims, validateExperiment, validateGates, validateMeasurement
} from "./causal-refactoring-evidence.mjs";
import {
  DEFAULT_SHAPE_SCHEMA, parseJsonDocument, validateInstanceAgainstSchema
} from "./json-schema-contract.mjs";

const ROOT = realpathSync(REPOSITORY_ROOT);

function isWithinRoot(candidate) {
  return candidate === ROOT || candidate.startsWith(`${ROOT}${path.sep}`);
}

function readRepositoryJson(relativePath, label) {
  text(relativePath, `${label} path`);
  ok(!path.isAbsolute(relativePath), `${label} path must be repository-relative`);
  const absolute = path.resolve(ROOT, relativePath);
  ok(isWithinRoot(absolute), `${label} path escapes repository root`);
  ok(existsSync(absolute), `missing ${relativePath}`);
  const resolved = realpathSync(absolute);
  ok(isWithinRoot(resolved), `${label} path resolves outside repository root`);
  return parseJsonDocument(readFileSync(resolved, "utf8"), relativePath);
}

export function validateModel(model) {
  exactKeys(model, TOP_KEYS, "model");
  ok(model.schema === "robys-fractal-causal-refactoring/v0.1", "unsupported schema");
  ok(model.status === "draft-operational-contract", "status must remain draft-operational-contract");
  validateBusiness(model);
  const observed = validateDiagnosis(model);
  validateRefactor(model);
  const divergenceTransition = model.refactor.transitions.find((transition) => (
    transition.from === model.first_meaningful_divergence.from_state &&
    transition.to === model.first_meaningful_divergence.to_state
  ));
  ok(divergenceTransition, "First Meaningful Divergence must be an explicit refactor transition");
  validateMeasurement(model, observed);
  validateExperiment(model);
  validateGates(model);
  validateClaims(model);
  return {
    contract: CONTRACT,
    experiment: model.experiment.id,
    model_status: model.claim_boundary.current_status,
    stage_count: model.refactor.stages.length,
    first_meaningful_divergence: `${model.first_meaningful_divergence.from_state}->${model.first_meaningful_divergence.to_state}`,
    pilot_status: model.decision_gates.find((gate) => gate.id === "PILOT").result,
    primary_metric: model.measurement_contract.metrics.primary,
    open_business_inputs: model.open_business_inputs.length
  };
}

export function validateModelFile(relativePath = DEFAULT_MODEL) {
  const schema = readRepositoryJson(DEFAULT_SHAPE_SCHEMA, "shape schema");
  const model = readRepositoryJson(relativePath, "model");
  const shape = validateInstanceAgainstSchema(schema, model);
  return {
    ...validateModel(model),
    shape_schema: shape.schema_id,
    shape_validator: shape.validator
  };
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  try { process.stdout.write(`${JSON.stringify(validateModelFile(process.argv[2] || DEFAULT_MODEL), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
