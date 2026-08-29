export const CONTRACT = "FCR-001";
export const DEFAULT_MODEL = "qa/fixtures/causal-refactoring/robys-menu-to-visit-v0.1.json";
export const TOP_KEYS = [
  "business_context", "claim_boundary", "decision_gates", "experiment",
  "first_meaningful_divergence", "measurement_contract",
  "next_falsifiable_question", "open_business_inputs", "refactor",
  "root_rule", "schema", "status", "unsafe_patches", "visible_symptom"
];
export const STAGES = ["DISCOVERY", "INTENT", "COMMITMENT", "ARRIVAL", "SALE", "CONTRIBUTION", "LEARNING"];
export const DOMAINS = ["digital", "digital", "digital", "physical", "operational", "economic", "decision"];
export const REQUIRED_COSTS = [
  "product_variable_cost", "promotion_cost", "staff_handling_cost",
  "measurement_operating_cost"
];
export const REQUIRED_PILOT = [
  "named_operational_owner", "approved_menu_truth_at_pilot_start",
  "cafe_staff_workflow_acceptance", "approved_token_to_sale_reconciliation",
  "predeclared_attribution_and_retention_window", "declared_cost_inputs",
  "pre_registered_sample_size_and_stop_rule"
];
export const REQUIRED_SCALE = [
  "causal_uplift_over_pre_registered_baseline", "positive_net_contribution",
  "all_guardrails_within_limits", "operational_owner_approval"
];
export const REQUIRED_OPEN_INPUTS = [
  "named_operational_owner", "approved_menu_truth_at_pilot_start",
  "cafe_staff_workflow_acceptance", "approved_token_to_sale_reconciliation",
  "attribution_window", "token_retention_rule", "product_and_campaign_costs",
  "sample_size_and_stop_rule"
];

export function fail(message) {
  const error = new Error(`${CONTRACT}: ${message}`);
  error.code = CONTRACT;
  throw error;
}
export function ok(condition, message) { if (!condition) fail(message); }
export function text(value, label) {
  ok(typeof value === "string" && value.trim(), `${label} must be a non-empty string`);
}
export function exactKeys(value, expected, label) {
  ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ok(JSON.stringify(actual) === JSON.stringify(wanted), `${label} keys must be exactly [${wanted.join(", ")}], got [${actual.join(", ")}]`);
}
export function uniqueStrings(value, label, min = 1) {
  ok(Array.isArray(value) && value.length >= min, `${label} must contain at least ${min} item(s)`);
  const set = new Set();
  for (const item of value) {
    text(item, `${label} item`);
    ok(!set.has(item), `${label} contains duplicate ${item}`);
    set.add(item);
  }
  return set;
}
export function contains(set, required, label) {
  for (const item of required) ok(set.has(item), `${label} is missing required item ${item}`);
}
export function getGate(model, id) {
  const gate = model.decision_gates.find((candidate) => candidate.id === id);
  ok(gate, `missing ${id} gate`);
  exactKeys(gate, ["id", "result", "requires"], `${id} gate`);
  return { gate, requires: uniqueStrings(gate.requires, `${id}.requires`) };
}
