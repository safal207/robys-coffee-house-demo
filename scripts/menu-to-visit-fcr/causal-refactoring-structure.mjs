import {
  DOMAINS, STAGES, STAGE_EVIDENCE, TRANSITION_GATES, contains, exactKeys,
  exactStringSet, ok, text, uniqueStrings
} from "./causal-refactoring-core.mjs";

export function validateBusiness(model) {
  exactKeys(model.business_context, [
    "venue", "location", "repository", "customer_languages",
    "current_surfaces", "non_capabilities"
  ], "business_context");
  ok(model.business_context.venue === "Roby's Coffee House", "venue must remain Roby's Coffee House");
  ok(model.business_context.location === "Gazipaşa, Antalya", "location must remain Gazipaşa, Antalya");
  ok(model.business_context.repository === "safal207/robys-coffee-house-demo", "repository binding is invalid");
  ok(JSON.stringify(model.business_context.customer_languages) === JSON.stringify(["tr", "en", "ru"]), "customer languages must remain tr, en, ru");
  uniqueStrings(model.business_context.current_surfaces, "business_context.current_surfaces");
  contains(uniqueStrings(model.business_context.non_capabilities, "business_context.non_capabilities"), [
    "ordering", "payment", "reservation", "inventory-guarantee"
  ], "business_context.non_capabilities");
}

export function validateDiagnosis(model) {
  exactKeys(model.visible_symptom, ["id", "statement", "observed_proxies", "unproven_outcomes"], "visible_symptom");
  ok(model.visible_symptom.id === "SYM-ROBY-001", "visible_symptom.id must be SYM-ROBY-001");
  text(model.visible_symptom.statement, "visible_symptom.statement");
  const observed = uniqueStrings(model.visible_symptom.observed_proxies, "visible_symptom.observed_proxies");
  uniqueStrings(model.visible_symptom.unproven_outcomes, "visible_symptom.unproven_outcomes");

  exactKeys(model.first_meaningful_divergence, ["id", "from_state", "to_state", "statement", "why_first", "not_at"], "first_meaningful_divergence");
  const divergence = model.first_meaningful_divergence;
  ok(divergence.id === "FMD-ROBY-001", "first_meaningful_divergence.id must be FMD-ROBY-001");
  ok(divergence.from_state === "COMMITMENT", "First Meaningful Divergence must start at COMMITMENT");
  ok(divergence.to_state === "ARRIVAL", "First Meaningful Divergence must end at ARRIVAL");
  text(divergence.statement, "first_meaningful_divergence.statement");
  text(divergence.why_first, "first_meaningful_divergence.why_first");
  uniqueStrings(divergence.not_at, "first_meaningful_divergence.not_at");

  exactKeys(model.root_rule, ["id", "current", "replacement"], "root_rule");
  ok(model.root_rule.id === "RULE-ROBY-001", "root_rule.id must be RULE-ROBY-001");
  text(model.root_rule.current, "root_rule.current");
  text(model.root_rule.replacement, "root_rule.replacement");
  ok(model.root_rule.current !== model.root_rule.replacement, "root rule replacement must differ from current rule");

  ok(Array.isArray(model.unsafe_patches) && model.unsafe_patches.length >= 4, "unsafe_patches must contain at least four falsified shortcuts");
  const patchIds = new Set();
  model.unsafe_patches.forEach((patch, index) => {
    exactKeys(patch, ["patch", "why_unsafe"], `unsafe_patches[${index}]`);
    text(patch.patch, `unsafe_patches[${index}].patch`);
    text(patch.why_unsafe, `unsafe_patches[${index}].why_unsafe`);
    ok(!patchIds.has(patch.patch), `unsafe_patches contains duplicate ${patch.patch}`);
    patchIds.add(patch.patch);
  });
  return observed;
}

export function validateRefactor(model) {
  exactKeys(model.refactor, ["principle", "preserve", "stages", "transitions", "forbidden_state_substitutions"], "refactor");
  text(model.refactor.principle, "refactor.principle");
  uniqueStrings(model.refactor.preserve, "refactor.preserve");
  ok(Array.isArray(model.refactor.stages) && model.refactor.stages.length === STAGES.length, `refactor.stages must contain exactly ${STAGES.length} stages`);
  model.refactor.stages.forEach((stage, index) => {
    exactKeys(stage, ["id", "domain", "evidence_required", "claim_allowed"], `refactor.stages[${index}]`);
    ok(stage.id === STAGES[index], `stage ${index} must be ${STAGES[index]}, got ${stage.id}`);
    ok(stage.domain === DOMAINS[index], `${stage.id} domain must be ${DOMAINS[index]}`);
    exactStringSet(stage.evidence_required, STAGE_EVIDENCE[stage.id], `${stage.id}.evidence_required`);
    text(stage.claim_allowed, `${stage.id}.claim_allowed`);
  });
  ok(Array.isArray(model.refactor.transitions) && model.refactor.transitions.length === STAGES.length - 1, "refactor.transitions must connect every adjacent stage exactly once");
  model.refactor.transitions.forEach((transition, index) => {
    exactKeys(transition, ["from", "to", "gate"], `refactor.transitions[${index}]`);
    const expectedFrom = STAGES[index];
    const expectedTo = STAGES[index + 1];
    const expectedGate = TRANSITION_GATES[index];
    ok(transition.from === expectedFrom && transition.to === expectedTo, `transition ${index} must be ${expectedFrom}->${expectedTo}`);
    ok(transition.gate === expectedGate, `${expectedFrom}->${expectedTo} gate must be ${expectedGate}`);
  });
  contains(uniqueStrings(model.refactor.forbidden_state_substitutions, "refactor.forbidden_state_substitutions"), [
    "DISCOVERY!=INTENT", "INTENT!=ARRIVAL", "COMMITMENT!=ARRIVAL", "ARRIVAL!=SALE", "SALE!=CONTRIBUTION"
  ], "refactor.forbidden_state_substitutions");
}
