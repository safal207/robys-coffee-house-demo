import {
  CAN_CLAIM_ALLOWLIST, REQUIRED_COSTS, REQUIRED_OPEN_INPUTS, REQUIRED_PILOT,
  REQUIRED_SCALE, contains, exactKeys, exactStringSet, getGate, ok, text,
  uniqueStrings
} from "./causal-refactoring-core.mjs";

const PRICE_AMOUNT = String.raw`\d+(?:[\s.,]\d+)*`;
const PRICE_CURRENCY = String.raw`(?:₺|try|tl|lira)`;
const FROZEN_PRICE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${PRICE_CURRENCY}\s*${PRICE_AMOUNT}|${PRICE_AMOUNT}\s*${PRICE_CURRENCY})(?![\p{L}\p{N}])`,
  "iu"
);

export function validateMeasurement(model, observed) {
  exactKeys(model.measurement_contract, [
    "linkage", "metrics", "forbidden_substitutions", "attribution_window",
    "cost_inputs", "privacy_guardrails"
  ], "measurement_contract");
  const measurement = model.measurement_contract;
  exactKeys(measurement.linkage, ["status", "mode", "pii_required", "display_code_is_proof", "required_bindings"], "measurement_contract.linkage");
  ok(measurement.linkage.status === "BLOCKED_PENDING_OWNER_INPUT", "linkage status must fail closed pending owner input");
  ok(measurement.linkage.mode === "privacy_safe_opaque_token", "linkage mode must use a privacy-safe opaque token");
  ok(measurement.linkage.pii_required === false, "linkage must not require PII");
  ok(measurement.linkage.display_code_is_proof === false, "display code must never be treated as proof");
  contains(uniqueStrings(measurement.linkage.required_bindings, "measurement_contract.linkage.required_bindings"), [
    "web_moment", "cafe_side_observation", "approved_sale_record"
  ], "measurement_contract.linkage.required_bindings");

  exactKeys(measurement.metrics, ["proxies", "outcomes", "primary"], "measurement_contract.metrics");
  const proxies = uniqueStrings(measurement.metrics.proxies, "measurement_contract.metrics.proxies");
  const outcomes = uniqueStrings(measurement.metrics.outcomes, "measurement_contract.metrics.outcomes");
  for (const proxy of observed) ok(proxies.has(proxy), `observed proxy ${proxy} must remain a declared proxy`);
  for (const metric of proxies) ok(!outcomes.has(metric), `${metric} cannot be both a proxy and an outcome`);
  ok(measurement.metrics.primary === "net_contribution_per_eligible_session", "primary metric must be net_contribution_per_eligible_session");
  ok(outcomes.has(measurement.metrics.primary), "primary metric must be a declared outcome");
  contains(uniqueStrings(measurement.forbidden_substitutions, "measurement_contract.forbidden_substitutions"), [
    "page_view!=visit", "directions_open!=arrival", "token_generated!=sale", "gross_revenue!=net_contribution"
  ], "measurement_contract.forbidden_substitutions");
  ok(measurement.attribution_window === "OWNER_DEFINED_BEFORE_PILOT", "attribution window must be owner-defined before pilot");
  contains(uniqueStrings(measurement.cost_inputs, "cost_inputs"), REQUIRED_COSTS, "cost_inputs");
  contains(uniqueStrings(measurement.privacy_guardrails, "measurement_contract.privacy_guardrails"), [
    "no_name_required", "no_phone_required", "no_email_required", "token_retention_defined_before_pilot"
  ], "measurement_contract.privacy_guardrails");
}

export function validateExperiment(model) {
  exactKeys(model.experiment, [
    "id", "name", "candidate_pairing", "price_source", "hypothesis",
    "baseline", "treatment", "assignment", "primary_metric",
    "secondary_metrics", "guardrails", "pre_registration_required"
  ], "experiment");
  const experiment = model.experiment;
  ok(experiment.id === "FCR-ROBY-001", "experiment.id must be FCR-ROBY-001");
  text(experiment.name, "experiment.name");
  text(experiment.candidate_pairing, "experiment.candidate_pairing");
  text(experiment.hypothesis, "experiment.hypothesis");
  text(experiment.baseline, "experiment.baseline");
  text(experiment.treatment, "experiment.treatment");
  ok(!FROZEN_PRICE.test(experiment.candidate_pairing), "candidate_pairing must not freeze a price");
  ok(experiment.price_source === "approved menu truth at pilot start", "price must come from approved menu truth at pilot start");
  ok(experiment.assignment === "randomized_session_or_pre_registered_time_block", "assignment must be randomized or pre-registered time blocks");
  ok(experiment.primary_metric === model.measurement_contract.metrics.primary, "experiment primary metric must match measurement contract");
  const outcomes = new Set(model.measurement_contract.metrics.outcomes);
  for (const metric of uniqueStrings(experiment.secondary_metrics, "experiment.secondary_metrics")) ok(outcomes.has(metric), `secondary metric ${metric} must be a declared outcome`);
  contains(uniqueStrings(experiment.guardrails, "experiment.guardrails"), [
    "menu_truth_mismatch", "token_collision_or_reuse", "barista_workflow_delay",
    "customer_confusion", "privacy_violation"
  ], "experiment.guardrails");
  ok(experiment.pre_registration_required === true, "experiment must require pre-registration");
}

export function validateGates(model) {
  ok(Array.isArray(model.decision_gates) && model.decision_gates.length === 4, "decision_gates must contain MODEL, PILOT, SCALE, and ROLLBACK");
  ok(JSON.stringify(model.decision_gates.map((gate) => gate.id)) === JSON.stringify(["MODEL", "PILOT", "SCALE", "ROLLBACK"]), "decision gates must be ordered MODEL, PILOT, SCALE, ROLLBACK");
  const modelGate = getGate(model, "MODEL");
  ok(modelGate.gate.result === "MODEL_DEFINED", "MODEL gate must produce MODEL_DEFINED");
  contains(modelGate.requires, ["executable_contract_passes", "falsification_tests_pass"], "MODEL.requires");
  const pilot = getGate(model, "PILOT");
  ok(pilot.gate.result === "BLOCKED_UNTIL_BUSINESS_INPUTS_EXIST", "PILOT gate must fail closed");
  contains(pilot.requires, REQUIRED_PILOT, "PILOT.requires");
  const scale = getGate(model, "SCALE");
  ok(scale.gate.result === "ALLOWED_ONLY_AFTER_CAUSAL_AND_ECONOMIC_EVIDENCE", "SCALE gate must remain conditional");
  contains(scale.requires, REQUIRED_SCALE, "SCALE.requires");
  const rollback = getGate(model, "ROLLBACK");
  ok(rollback.gate.result === "REQUIRED_ON_MATERIAL_BREACH", "ROLLBACK gate must require action on material breach");
  contains(rollback.requires, ["truth_privacy_or_workflow_breach_or_negative_contribution"], "ROLLBACK.requires");
}

export function validateClaims(model) {
  exactKeys(model.claim_boundary, ["current_status", "can_claim", "cannot_claim"], "claim_boundary");
  ok(model.claim_boundary.current_status === "MODEL_DEFINED_NOT_EMPIRICALLY_VERIFIED", "claim boundary must remain MODEL_DEFINED_NOT_EMPIRICALLY_VERIFIED");
  exactStringSet(model.claim_boundary.can_claim, CAN_CLAIM_ALLOWLIST, "claim_boundary.can_claim");
  const cannotClaim = uniqueStrings(model.claim_boundary.cannot_claim, "claim_boundary.cannot_claim");
  const cannotText = [...cannotClaim].join("\n").toLowerCase();
  for (const phrase of [
    "caused additional cafe visits", "increased revenue", "increased profit",
    "production token-to-pos integration exists", "cafe staff accepted",
    "ordering, payment, reservation, or inventory guarantees"
  ]) ok(cannotText.includes(phrase), `claim_boundary.cannot_claim must preserve: ${phrase}`);
  contains(uniqueStrings(model.open_business_inputs, "open_business_inputs"), REQUIRED_OPEN_INPUTS, "open_business_inputs");
  text(model.next_falsifiable_question, "next_falsifiable_question");
  ok(model.next_falsifiable_question.trim().endsWith("?"), "next_falsifiable_question must be a question");
}
