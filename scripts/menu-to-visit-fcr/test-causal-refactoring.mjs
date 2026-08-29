import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPOSITORY_ROOT } from "./causal-refactoring-core.mjs";
import { validateModel, validateModelFile } from "./verify-causal-refactoring.mjs";
import {
  DEFAULT_SHAPE_SCHEMA,
  parseJsonDocument,
  validateInstanceAgainstSchema
} from "./json-schema-contract.mjs";

const ROOT = REPOSITORY_ROOT;
const MODEL_PATH = path.resolve(
  ROOT,
  "qa/fixtures/causal-refactoring/robys-menu-to-visit-v0.1.json"
);
const SHAPE_SCHEMA_PATH = path.resolve(ROOT, DEFAULT_SHAPE_SCHEMA);
const VERIFY_PATH = path.resolve(
  ROOT,
  "scripts/menu-to-visit-fcr/verify-causal-refactoring.mjs"
);
const canonical = JSON.parse(readFileSync(MODEL_PATH, "utf8"));
const canonicalSchema = JSON.parse(readFileSync(SHAPE_SCHEMA_PATH, "utf8"));

function cloneModel() {
  return JSON.parse(JSON.stringify(canonical));
}

function cloneSchema() {
  return JSON.parse(JSON.stringify(canonicalSchema));
}

function expectFailure(name, mutate, expected) {
  const model = cloneModel();
  mutate(model);
  assert.throws(
    () => validateModel(model),
    (error) => {
      assert.equal(error.code, "FCR-001", `${name}: expected FCR-001`);
      assert.match(error.message, expected, `${name}: unexpected failure reason`);
      return true;
    },
    name
  );
}

function expectShapeFailure(name, schema, model, expected) {
  assert.throws(
    () => validateInstanceAgainstSchema(schema, model),
    (error) => {
      assert.equal(error.code, "FCR-001", `${name}: expected FCR-001`);
      assert.match(error.message, expected, `${name}: unexpected shape failure reason`);
      return true;
    },
    name
  );
}

const canonicalShapeResult = validateInstanceAgainstSchema(canonicalSchema, cloneModel());
assert.equal(canonicalShapeResult.result, "PASS");
assert.equal(canonicalShapeResult.validator, "dependency-free-supported-subset");

const canonicalResult = validateModel(cloneModel());
assert.equal(canonicalResult.contract, "FCR-001");
assert.equal(canonicalResult.experiment, "FCR-ROBY-001");
assert.equal(canonicalResult.first_meaningful_divergence, "COMMITMENT->ARRIVAL");
assert.equal(canonicalResult.model_status, "MODEL_DEFINED_NOT_EMPIRICALLY_VERIFIED");

const canonicalFileResult = validateModelFile();
assert.equal(canonicalFileResult.shape_schema, canonicalSchema.$id);
assert.equal(canonicalFileResult.shape_validator, "dependency-free-supported-subset");

const outsideCwd = spawnSync(process.execPath, [VERIFY_PATH], {
  cwd: tmpdir(),
  encoding: "utf8"
});
assert.equal(outsideCwd.status, 0, outsideCwd.stderr || outsideCwd.stdout);
assert.match(outsideCwd.stdout, /"shape_validator": "dependency-free-supported-subset"/);

const negativeCases = [
  {
    name: "reject unknown model fields",
    expected: /model keys must be exactly/,
    mutate(model) {
      model.empirical_result = "profit-increased";
    }
  },
  {
    name: "reject moving the First Meaningful Divergence",
    expected: /must end at ARRIVAL/,
    mutate(model) {
      model.first_meaningful_divergence.to_state = "SALE";
    }
  },
  {
    name: "reject display code as proof",
    expected: /display code must never be treated as proof/,
    mutate(model) {
      model.measurement_contract.linkage.display_code_is_proof = true;
    }
  },
  {
    name: "reject proxy promoted to outcome",
    expected: /cannot be both a proxy and an outcome/,
    mutate(model) {
      model.measurement_contract.metrics.outcomes.push("page_view");
    }
  },
  {
    name: "reject scale without positive net contribution",
    expected: /SCALE\.requires is missing required item positive_net_contribution/,
    mutate(model) {
      const scale = model.decision_gates.find((gate) => gate.id === "SCALE");
      scale.requires = scale.requires.filter((item) => item !== "positive_net_contribution");
    }
  },
  {
    name: "reject pilot marked ready before owner inputs",
    expected: /PILOT gate must fail closed/,
    mutate(model) {
      const pilot = model.decision_gates.find((gate) => gate.id === "PILOT");
      pilot.result = "PILOT_READY";
    }
  },
  {
    name: "reject missing campaign cost",
    expected: /cost_inputs is missing required item promotion_cost/,
    mutate(model) {
      model.measurement_contract.cost_inputs = model.measurement_contract.cost_inputs.filter(
        (item) => item !== "promotion_cost"
      );
    }
  },
  {
    name: "reject unsupported empirical claim",
    expected: /claim_boundary\.can_claim must be exactly/,
    mutate(model) {
      model.claim_boundary.can_claim.push("The current website increased profit.");
    }
  },
  {
    name: "reject causal paraphrase in permitted claims",
    expected: /claim_boundary\.can_claim must be exactly/,
    mutate(model) {
      model.claim_boundary.can_claim.push("The treatment caused more cafe visits.");
    }
  },
  {
    name: "reject reordered causal stages",
    expected: /stage 2 must be COMMITMENT/,
    mutate(model) {
      const temporary = model.refactor.stages[2];
      model.refactor.stages[2] = model.refactor.stages[3];
      model.refactor.stages[3] = temporary;
    }
  },
  {
    name: "reject substituted ARRIVAL evidence",
    expected: /ARRIVAL\.evidence_required must be exactly/,
    mutate(model) {
      const arrival = model.refactor.stages.find((stage) => stage.id === "ARRIVAL");
      arrival.evidence_required = ["directions_open"];
    }
  },
  {
    name: "reject substituted non-FMD transition gate",
    expected: /DISCOVERY->INTENT gate must be explicit_selection_event/,
    mutate(model) {
      model.refactor.transitions[0].gate = "page_view";
    }
  },
  {
    name: "reject frozen candidate price",
    expected: /candidate_pairing must not freeze a price/,
    mutate(model) {
      model.experiment.candidate_pairing = "Iced Latte + San Sebastian 370 TRY";
    }
  },
  {
    name: "reject prefix-form frozen candidate price",
    expected: /candidate_pairing must not freeze a price/,
    mutate(model) {
      model.experiment.candidate_pairing = "Iced Latte + San Sebastian ₺370";
    }
  },
  {
    name: "reject empty experiment name",
    expected: /experiment\.name must be a non-empty string/,
    mutate(model) {
      model.experiment.name = "";
    }
  },
  {
    name: "reject non-string experiment treatment",
    expected: /experiment\.treatment must be a non-empty string/,
    mutate(model) {
      model.experiment.treatment = null;
    }
  }
];

for (const testCase of negativeCases) {
  expectFailure(testCase.name, testCase.mutate, testCase.expected);
}

assert.throws(
  () => parseJsonDocument("{", "shape schema"),
  (error) => error.code === "FCR-001" && /not valid JSON/.test(error.message),
  "reject malformed shape schema JSON"
);

const schemaWithUnknownKeyword = cloneSchema();
schemaWithUnknownKeyword.properties.status.pattern = "^draft";
expectShapeFailure(
  "reject unsupported schema keywords",
  schemaWithUnknownKeyword,
  cloneModel(),
  /unsupported JSON Schema keyword pattern/
);

const schemaWithDriftedConst = cloneSchema();
schemaWithDriftedConst.properties.status.const = "production-ready";
expectShapeFailure(
  "reject schema and canonical fixture drift",
  schemaWithDriftedConst,
  cloneModel(),
  /value must equal const "production-ready"/
);

const modelWithSchemaOnlyExtraField = cloneModel();
modelWithSchemaOnlyExtraField.shape_bypass = true;
expectShapeFailure(
  "reject additional fields through the published shape contract",
  cloneSchema(),
  modelWithSchemaOnlyExtraField,
  /shape_bypass: additional property is not allowed/
);

const schemaWithBrokenReference = cloneSchema();
schemaWithBrokenReference.properties.visible_symptom.$ref = "#/$defs/missing";
expectShapeFailure(
  "reject unresolved schema references",
  schemaWithBrokenReference,
  cloneModel(),
  /cannot resolve #\/\$defs\/missing/
);

process.stdout.write(
  `${JSON.stringify({
    contract: "FCR-001",
    canonical_cases: 4,
    falsification_cases: negativeCases.length,
    shape_contract_cases: 5,
    path_contract_cases: 1,
    result: "PASS"
  }, null, 2)}\n`
);
