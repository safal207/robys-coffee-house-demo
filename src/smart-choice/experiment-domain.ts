import { SMART_CHOICE_CATALOG } from "./catalog.js";

export const SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION = "robys.smart-choice-experiment.v1" as const;
export const SMART_CHOICE_EXPERIMENT_PLATFORM_VERSION = "smart-choice-experiments.v0.1.0" as const;

export type ExperimentSurface =
  | "entry-cta"
  | "flow-length"
  | "benefit-copy"
  | "question-order"
  | "bump-price-presentation"
  | "social-proof";

export type PrimaryMetric = "handoff-rate" | "completion-rate" | "bump-acceptance-rate";
export type SecondaryMetric = PrimaryMetric | "cta-click-rate" | "median-time-to-choice";
export type ExperimentRole = "control" | "treatment";
export type ExperimentDecision =
  | "kill-switched"
  | "invalid-config"
  | "insufficient-sample"
  | "financial-data-required"
  | "guardrail-breach"
  | "inconclusive"
  | "candidate-for-human-review";

export interface ExperimentTreatmentPayload {
  entryCtaMode?: "menu-first" | "smart-choice-first";
  flowMode?: "full" | "short";
  benefitCopyCode?: "verified-fit" | "fast-clear-choice";
  questionOrderCode?: "intent-first" | "budget-first";
  bumpPricePresentation?: "standalone-price" | "combo-delta";
  socialProofCode?: "none" | "verified-popular-choice";
}

export interface ExperimentVariant {
  id: string;
  role: ExperimentRole;
  allocationBps: number;
  payload: ExperimentTreatmentPayload;
}

export interface MinimumSamplePolicy {
  minSessionsPerVariant: number;
  minPrimaryConversionsPerVariant: number;
  minExposureDays: number;
}

export interface FinancialGuardrails {
  minGrossMarginBps: number;
  maxDiscountBps: number;
  requireNonNegativeIncrementalGrossProfit: boolean;
  maxMedianTimeIncreaseMs: number;
  maxHandoffRateDropBps: number;
}

export interface CommerceParityContract {
  catalogVersion: string;
  pricingFingerprint: string;
  availabilityFingerprint: string;
  pricesIdenticalAcrossVariants: true;
  availabilityIdenticalAcrossVariants: true;
}

export interface ExperimentDefinition {
  schemaVersion: typeof SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION;
  id: string;
  version: string;
  surface: ExperimentSurface;
  enabled: boolean;
  killSwitch: boolean;
  randomizationUnit: "anonymous-session";
  controlVariantId: string;
  variants: readonly ExperimentVariant[];
  primaryMetric: PrimaryMetric;
  secondaryMetrics: readonly SecondaryMetric[];
  minimumSample: MinimumSamplePolicy;
  guardrails: FinancialGuardrails;
  commerce: CommerceParityContract;
  verifiedSocialProofEvidenceId?: string;
}

export interface ExperimentAssignment {
  schemaVersion: typeof SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION;
  platformVersion: typeof SMART_CHOICE_EXPERIMENT_PLATFORM_VERSION;
  experimentId: string;
  experimentVersion: string;
  variantId: string;
  role: ExperimentRole;
  bucket: number;
  randomizationUnit: "anonymous-session";
  catalogVersion: string;
  pricingFingerprint: string;
  availabilityFingerprint: string;
}

export interface VariantObservation {
  variantId: string;
  sessions: number;
  exposureDays: number;
  ctaClicks: number;
  completedRecommendations: number;
  handoffs: number;
  bumpShown: number;
  bumpAccepted: number;
  medianTimeToChoiceMs: number | null;
  revenueMinor?: number;
  grossProfitMinor?: number;
  discountMinor?: number;
  listRevenueMinor?: number;
}

export interface ExperimentAnalysisInput {
  definition: ExperimentDefinition;
  control: VariantObservation;
  treatment: VariantObservation;
  randomizedAssignment: boolean;
  eventSchemaVersion: string;
  catalogVersion: string;
  pricingFingerprint: string;
  availabilityFingerprint: string;
}

export interface MetricEstimate {
  metric: PrimaryMetric;
  controlRate: number | null;
  treatmentRate: number | null;
  observedAbsoluteLiftBps: number | null;
  observedRelativeLiftBps: number | null;
  confidence95LowerBps: number | null;
  confidence95UpperBps: number | null;
}

export interface GuardrailResult {
  id:
    | "commerce-parity"
    | "gross-margin"
    | "discount"
    | "incremental-gross-profit"
    | "time-to-choice"
    | "handoff-conversion";
  status: "pass" | "breach" | "unavailable";
  observed?: number;
  limit?: number;
  reasonCode: string;
}

export interface ExperimentReport {
  schemaVersion: "robys.smart-choice-experiment-report.v1";
  experimentId: string;
  experimentVersion: string;
  decision: ExperimentDecision;
  primary: MetricEstimate;
  guardrails: readonly GuardrailResult[];
  sample: {
    sufficient: boolean;
    reasons: readonly string[];
  };
  uncertainty: {
    method: "normal-approximation-95";
    causalClaim: "not-established" | "eligible-for-human-causal-review";
    randomizedAssignment: boolean;
  };
  notices: readonly string[];
}

const CODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const ALLOWED_PAYLOAD_KEYS = new Set<keyof ExperimentTreatmentPayload>([
  "entryCtaMode",
  "flowMode",
  "benefitCopyCode",
  "questionOrderCode",
  "bumpPricePresentation",
  "socialProofCode"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableFingerprint(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const character of parts.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

export const SMART_CHOICE_PRICING_FINGERPRINT = stableFingerprint(
  SMART_CHOICE_CATALOG.items
    .map((item) => `${item.id}:${item.priceMinor}:${item.currency}`)
    .concat(SMART_CHOICE_CATALOG.combos.map((combo) => `${combo.id}:${combo.priceMinor}:${combo.currency}`))
    .sort()
);

export const SMART_CHOICE_AVAILABILITY_FINGERPRINT = stableFingerprint(
  SMART_CHOICE_CATALOG.items
    .map((item) => `${item.id}:${item.sourceStatus}:${item.availability}`)
    .concat(SMART_CHOICE_CATALOG.combos.map((combo) => `${combo.id}:${combo.sourceStatus}:${combo.availability}`))
    .sort()
);

export const DEFAULT_EXPERIMENT_GUARDRAILS: FinancialGuardrails = {
  minGrossMarginBps: 5_500,
  maxDiscountBps: 1_000,
  requireNonNegativeIncrementalGrossProfit: true,
  maxMedianTimeIncreaseMs: 15_000,
  maxHandoffRateDropBps: 300
};

export const SMART_CHOICE_EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    schemaVersion: SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION,
    id: "smart-choice-benefit-copy-v1",
    version: "1.0.0",
    surface: "benefit-copy",
    enabled: true,
    killSwitch: false,
    randomizationUnit: "anonymous-session",
    controlVariantId: "control-verified-fit",
    variants: [
      {
        id: "control-verified-fit",
        role: "control",
        allocationBps: 5_000,
        payload: { benefitCopyCode: "verified-fit" }
      },
      {
        id: "treatment-fast-clear-choice",
        role: "treatment",
        allocationBps: 5_000,
        payload: { benefitCopyCode: "fast-clear-choice" }
      }
    ],
    primaryMetric: "handoff-rate",
    secondaryMetrics: ["completion-rate", "cta-click-rate", "median-time-to-choice"],
    minimumSample: {
      minSessionsPerVariant: 200,
      minPrimaryConversionsPerVariant: 20,
      minExposureDays: 7
    },
    guardrails: DEFAULT_EXPERIMENT_GUARDRAILS,
    commerce: {
      catalogVersion: SMART_CHOICE_CATALOG.version,
      pricingFingerprint: SMART_CHOICE_PRICING_FINGERPRINT,
      availabilityFingerprint: SMART_CHOICE_AVAILABILITY_FINGERPRINT,
      pricesIdenticalAcrossVariants: true,
      availabilityIdenticalAcrossVariants: true
    }
  },
  {
    schemaVersion: SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION,
    id: "smart-choice-social-proof-v1",
    version: "1.0.0",
    surface: "social-proof",
    enabled: false,
    killSwitch: true,
    randomizationUnit: "anonymous-session",
    controlVariantId: "control-no-social-proof",
    variants: [
      { id: "control-no-social-proof", role: "control", allocationBps: 5_000, payload: { socialProofCode: "none" } },
      { id: "treatment-verified-popular", role: "treatment", allocationBps: 5_000, payload: { socialProofCode: "verified-popular-choice" } }
    ],
    primaryMetric: "handoff-rate",
    secondaryMetrics: ["completion-rate"],
    minimumSample: { minSessionsPerVariant: 200, minPrimaryConversionsPerVariant: 20, minExposureDays: 7 },
    guardrails: DEFAULT_EXPERIMENT_GUARDRAILS,
    commerce: {
      catalogVersion: SMART_CHOICE_CATALOG.version,
      pricingFingerprint: SMART_CHOICE_PRICING_FINGERPRINT,
      availabilityFingerprint: SMART_CHOICE_AVAILABILITY_FINGERPRINT,
      pricesIdenticalAcrossVariants: true,
      availabilityIdenticalAcrossVariants: true
    }
  }
];

export function validateExperimentDefinition(definition: ExperimentDefinition): readonly string[] {
  const errors: string[] = [];
  if (definition.schemaVersion !== SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION) errors.push("Unsupported experiment schema version.");
  if (!CODE_PATTERN.test(definition.id)) errors.push("Experiment ID must be a bounded internal code.");
  if (!CODE_PATTERN.test(definition.version)) errors.push("Experiment version must be a bounded internal code.");
  if (definition.randomizationUnit !== "anonymous-session") errors.push("MVP randomization unit must be anonymous-session.");
  if (definition.variants.length < 2) errors.push("Experiment must contain at least two variants.");
  if (definition.variants.reduce((sum, variant) => sum + variant.allocationBps, 0) !== 10_000) {
    errors.push("Variant allocation must total 10000 basis points.");
  }
  const ids = new Set<string>();
  for (const variant of definition.variants) {
    if (!CODE_PATTERN.test(variant.id)) errors.push(`Variant ID is invalid: ${variant.id || "<empty>"}.`);
    if (ids.has(variant.id)) errors.push(`Duplicate variant ID: ${variant.id}.`);
    ids.add(variant.id);
    if (!Number.isInteger(variant.allocationBps) || variant.allocationBps <= 0) {
      errors.push(`Allocation for ${variant.id} must be a positive integer.`);
    }
    if (!isRecord(variant.payload)) errors.push(`Payload for ${variant.id} must be an object.`);
    for (const key of Object.keys(variant.payload)) {
      if (!ALLOWED_PAYLOAD_KEYS.has(key as keyof ExperimentTreatmentPayload)) {
        errors.push(`Variant ${variant.id} contains forbidden payload key: ${key}.`);
      }
    }
  }
  if (!ids.has(definition.controlVariantId)) errors.push("Control variant ID is missing from variants.");
  const control = definition.variants.find((variant) => variant.id === definition.controlVariantId);
  if (control?.role !== "control") errors.push("Configured control variant must have control role.");
  if (definition.variants.filter((variant) => variant.role === "control").length !== 1) {
    errors.push("Experiment must contain exactly one control variant.");
  }
  if (definition.primaryMetric === ("cta-click-rate" as PrimaryMetric)) {
    errors.push("Clicks cannot be the primary decision metric.");
  }
  if (definition.minimumSample.minSessionsPerVariant < 1 || definition.minimumSample.minPrimaryConversionsPerVariant < 1) {
    errors.push("Minimum sample thresholds must be positive.");
  }
  if (definition.minimumSample.minExposureDays < 1) errors.push("Minimum exposure days must be positive.");
  if (definition.guardrails.minGrossMarginBps < 0 || definition.guardrails.minGrossMarginBps > 10_000) {
    errors.push("Minimum gross margin must be between 0 and 10000 basis points.");
  }
  if (definition.guardrails.maxDiscountBps < 0 || definition.guardrails.maxDiscountBps > 10_000) {
    errors.push("Maximum discount must be between 0 and 10000 basis points.");
  }
  if (!definition.commerce.pricesIdenticalAcrossVariants || !definition.commerce.availabilityIdenticalAcrossVariants) {
    errors.push("Control and treatment must share prices and availability.");
  }
  const usesVerifiedSocialProof = definition.variants.some(
    (variant) => variant.payload.socialProofCode === "verified-popular-choice"
  );
  if (usesVerifiedSocialProof && !definition.verifiedSocialProofEvidenceId) {
    errors.push("Verified social proof requires a verified evidence ID before activation.");
  }
  return errors;
}

function hashBucket(seed: string, experimentId: string, version: string): number {
  const fingerprint = stableFingerprint([seed, experimentId, version]);
  return Number.parseInt(fingerprint.slice(-8), 16) % 10_000;
}

export function assignExperiment(
  definition: ExperimentDefinition,
  anonymousSessionSeed: string,
  options: { globalKillSwitch?: boolean } = {}
): ExperimentAssignment | null {
  if (validateExperimentDefinition(definition).length > 0) return null;
  if (!definition.enabled || definition.killSwitch || options.globalKillSwitch) return null;
  if (!CODE_PATTERN.test(anonymousSessionSeed)) return null;

  const bucket = hashBucket(anonymousSessionSeed, definition.id, definition.version);
  let cursor = 0;
  const variant = definition.variants.find((candidate) => {
    cursor += candidate.allocationBps;
    return bucket < cursor;
  });
  if (!variant) return null;

  return {
    schemaVersion: SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION,
    platformVersion: SMART_CHOICE_EXPERIMENT_PLATFORM_VERSION,
    experimentId: definition.id,
    experimentVersion: definition.version,
    variantId: variant.id,
    role: variant.role,
    bucket,
    randomizationUnit: definition.randomizationUnit,
    catalogVersion: definition.commerce.catalogVersion,
    pricingFingerprint: definition.commerce.pricingFingerprint,
    availabilityFingerprint: definition.commerce.availabilityFingerprint
  };
}

export function assignmentMatchesDefinition(
  assignment: ExperimentAssignment,
  definition: ExperimentDefinition
): boolean {
  return assignment.schemaVersion === SMART_CHOICE_EXPERIMENT_SCHEMA_VERSION &&
    assignment.platformVersion === SMART_CHOICE_EXPERIMENT_PLATFORM_VERSION &&
    assignment.experimentId === definition.id &&
    assignment.experimentVersion === definition.version &&
    definition.variants.some((variant) => variant.id === assignment.variantId && variant.role === assignment.role) &&
    assignment.catalogVersion === definition.commerce.catalogVersion &&
    assignment.pricingFingerprint === definition.commerce.pricingFingerprint &&
    assignment.availabilityFingerprint === definition.commerce.availabilityFingerprint;
}

function metricCounts(metric: PrimaryMetric, observation: VariantObservation): [number, number] {
  switch (metric) {
    case "handoff-rate": return [observation.handoffs, observation.sessions];
    case "completion-rate": return [observation.completedRecommendations, observation.sessions];
    case "bump-acceptance-rate": return [observation.bumpAccepted, observation.bumpShown];
  }
}

function safeRate(successes: number, total: number): number | null {
  return Number.isInteger(successes) && Number.isInteger(total) && total > 0 && successes >= 0 && successes <= total
    ? successes / total
    : null;
}

function metricEstimate(
  metric: PrimaryMetric,
  control: VariantObservation,
  treatment: VariantObservation
): MetricEstimate {
  const [controlSuccesses, controlTotal] = metricCounts(metric, control);
  const [treatmentSuccesses, treatmentTotal] = metricCounts(metric, treatment);
  const controlRate = safeRate(controlSuccesses, controlTotal);
  const treatmentRate = safeRate(treatmentSuccesses, treatmentTotal);
  if (controlRate === null || treatmentRate === null) {
    return {
      metric,
      controlRate,
      treatmentRate,
      observedAbsoluteLiftBps: null,
      observedRelativeLiftBps: null,
      confidence95LowerBps: null,
      confidence95UpperBps: null
    };
  }
  const difference = treatmentRate - controlRate;
  const standardError = Math.sqrt(
    (controlRate * (1 - controlRate)) / controlTotal +
    (treatmentRate * (1 - treatmentRate)) / treatmentTotal
  );
  const margin = 1.96 * standardError;
  return {
    metric,
    controlRate,
    treatmentRate,
    observedAbsoluteLiftBps: Math.round(difference * 10_000),
    observedRelativeLiftBps: controlRate > 0 ? Math.round((difference / controlRate) * 10_000) : null,
    confidence95LowerBps: Math.round((difference - margin) * 10_000),
    confidence95UpperBps: Math.round((difference + margin) * 10_000)
  };
}

function integerOrUndefined(value: number | undefined): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? value : undefined;
}

function grossMarginBps(observation: VariantObservation): number | null {
  const revenue = integerOrUndefined(observation.revenueMinor);
  const grossProfit = integerOrUndefined(observation.grossProfitMinor);
  if (revenue === undefined || grossProfit === undefined || revenue === 0 || grossProfit > revenue) return null;
  return Math.floor((grossProfit * 10_000) / revenue);
}

function discountBps(observation: VariantObservation): number | null {
  const discount = integerOrUndefined(observation.discountMinor);
  const listRevenue = integerOrUndefined(observation.listRevenueMinor);
  if (discount === undefined || listRevenue === undefined || listRevenue === 0 || discount > listRevenue) return null;
  return Math.floor((discount * 10_000) / listRevenue);
}

function grossProfitPerSession(observation: VariantObservation): number | null {
  const grossProfit = integerOrUndefined(observation.grossProfitMinor);
  if (grossProfit === undefined || observation.sessions <= 0) return null;
  return grossProfit / observation.sessions;
}

function handoffRate(observation: VariantObservation): number | null {
  return safeRate(observation.handoffs, observation.sessions);
}

function evaluateGuardrails(input: ExperimentAnalysisInput): GuardrailResult[] {
  const { definition, control, treatment } = input;
  const parity =
    input.catalogVersion === definition.commerce.catalogVersion &&
    input.pricingFingerprint === definition.commerce.pricingFingerprint &&
    input.availabilityFingerprint === definition.commerce.availabilityFingerprint;
  const results: GuardrailResult[] = [
    {
      id: "commerce-parity",
      status: parity ? "pass" : "breach",
      reasonCode: parity ? "guardrail.commerce-parity.pass" : "guardrail.commerce-parity.breach"
    }
  ];

  const treatmentMargin = grossMarginBps(treatment);
  results.push({
    id: "gross-margin",
    status: treatmentMargin === null ? "unavailable" : treatmentMargin >= definition.guardrails.minGrossMarginBps ? "pass" : "breach",
    ...(treatmentMargin !== null ? { observed: treatmentMargin } : {}),
    limit: definition.guardrails.minGrossMarginBps,
    reasonCode: treatmentMargin === null
      ? "guardrail.gross-margin.missing-cost-data"
      : treatmentMargin >= definition.guardrails.minGrossMarginBps
        ? "guardrail.gross-margin.pass"
        : "guardrail.gross-margin.breach"
  });

  const treatmentDiscount = discountBps(treatment);
  results.push({
    id: "discount",
    status: treatmentDiscount === null ? "unavailable" : treatmentDiscount <= definition.guardrails.maxDiscountBps ? "pass" : "breach",
    ...(treatmentDiscount !== null ? { observed: treatmentDiscount } : {}),
    limit: definition.guardrails.maxDiscountBps,
    reasonCode: treatmentDiscount === null
      ? "guardrail.discount.missing-list-price-data"
      : treatmentDiscount <= definition.guardrails.maxDiscountBps
        ? "guardrail.discount.pass"
        : "guardrail.discount.breach"
  });

  const controlProfit = grossProfitPerSession(control);
  const treatmentProfit = grossProfitPerSession(treatment);
  const incrementalProfit = controlProfit === null || treatmentProfit === null ? null : treatmentProfit - controlProfit;
  results.push({
    id: "incremental-gross-profit",
    status: incrementalProfit === null
      ? "unavailable"
      : !definition.guardrails.requireNonNegativeIncrementalGrossProfit || incrementalProfit >= 0
        ? "pass"
        : "breach",
    ...(incrementalProfit !== null ? { observed: Math.round(incrementalProfit) } : {}),
    limit: 0,
    reasonCode: incrementalProfit === null
      ? "guardrail.incremental-gross-profit.missing-cost-data"
      : incrementalProfit >= 0
        ? "guardrail.incremental-gross-profit.pass"
        : "guardrail.incremental-gross-profit.breach"
  });

  const timeIncrease = control.medianTimeToChoiceMs === null || treatment.medianTimeToChoiceMs === null
    ? null
    : treatment.medianTimeToChoiceMs - control.medianTimeToChoiceMs;
  results.push({
    id: "time-to-choice",
    status: timeIncrease === null ? "unavailable" : timeIncrease <= definition.guardrails.maxMedianTimeIncreaseMs ? "pass" : "breach",
    ...(timeIncrease !== null ? { observed: timeIncrease } : {}),
    limit: definition.guardrails.maxMedianTimeIncreaseMs,
    reasonCode: timeIncrease === null
      ? "guardrail.time-to-choice.missing-data"
      : timeIncrease <= definition.guardrails.maxMedianTimeIncreaseMs
        ? "guardrail.time-to-choice.pass"
        : "guardrail.time-to-choice.breach"
  });

  const controlHandoff = handoffRate(control);
  const treatmentHandoff = handoffRate(treatment);
  const handoffDropBps = controlHandoff === null || treatmentHandoff === null
    ? null
    : Math.round((controlHandoff - treatmentHandoff) * 10_000);
  results.push({
    id: "handoff-conversion",
    status: handoffDropBps === null ? "unavailable" : handoffDropBps <= definition.guardrails.maxHandoffRateDropBps ? "pass" : "breach",
    ...(handoffDropBps !== null ? { observed: handoffDropBps } : {}),
    limit: definition.guardrails.maxHandoffRateDropBps,
    reasonCode: handoffDropBps === null
      ? "guardrail.handoff.missing-data"
      : handoffDropBps <= definition.guardrails.maxHandoffRateDropBps
        ? "guardrail.handoff.pass"
        : "guardrail.handoff.breach"
  });

  return results;
}

export function analyzeExperiment(input: ExperimentAnalysisInput): ExperimentReport {
  const configErrors = validateExperimentDefinition(input.definition);
  const primary = metricEstimate(input.definition.primaryMetric, input.control, input.treatment);
  const guardrails = evaluateGuardrails(input);
  const [, controlConversions] = [input.definition.primaryMetric, metricCounts(input.definition.primaryMetric, input.control)[0]];
  const [, treatmentConversions] = [input.definition.primaryMetric, metricCounts(input.definition.primaryMetric, input.treatment)[0]];
  const sampleReasons: string[] = [];
  if (input.control.sessions < input.definition.minimumSample.minSessionsPerVariant) sampleReasons.push("sample.control-sessions-below-minimum");
  if (input.treatment.sessions < input.definition.minimumSample.minSessionsPerVariant) sampleReasons.push("sample.treatment-sessions-below-minimum");
  if (controlConversions < input.definition.minimumSample.minPrimaryConversionsPerVariant) sampleReasons.push("sample.control-primary-conversions-below-minimum");
  if (treatmentConversions < input.definition.minimumSample.minPrimaryConversionsPerVariant) sampleReasons.push("sample.treatment-primary-conversions-below-minimum");
  if (input.control.exposureDays < input.definition.minimumSample.minExposureDays) sampleReasons.push("sample.control-exposure-days-below-minimum");
  if (input.treatment.exposureDays < input.definition.minimumSample.minExposureDays) sampleReasons.push("sample.treatment-exposure-days-below-minimum");
  const sampleSufficient = sampleReasons.length === 0;
  const unavailableFinancial = guardrails.some((result) =>
    ["gross-margin", "discount", "incremental-gross-profit"].includes(result.id) && result.status === "unavailable"
  );
  const breached = guardrails.some((result) => result.status === "breach");

  let decision: ExperimentDecision;
  if (input.definition.killSwitch || !input.definition.enabled) decision = "kill-switched";
  else if (configErrors.length > 0) decision = "invalid-config";
  else if (!sampleSufficient) decision = "insufficient-sample";
  else if (unavailableFinancial) decision = "financial-data-required";
  else if (breached) decision = "guardrail-breach";
  else if (primary.confidence95LowerBps !== null && primary.confidence95LowerBps > 0) decision = "candidate-for-human-review";
  else decision = "inconclusive";

  const eligibleForCausalReview =
    decision === "candidate-for-human-review" &&
    input.randomizedAssignment &&
    input.eventSchemaVersion === "robys.smart-choice-event.v1";

  return {
    schemaVersion: "robys.smart-choice-experiment-report.v1",
    experimentId: input.definition.id,
    experimentVersion: input.definition.version,
    decision,
    primary,
    guardrails,
    sample: { sufficient: sampleSufficient, reasons: sampleReasons },
    uncertainty: {
      method: "normal-approximation-95",
      causalClaim: eligibleForCausalReview ? "eligible-for-human-causal-review" : "not-established",
      randomizedAssignment: input.randomizedAssignment
    },
    notices: [
      "Observed lift is an estimate, not an automatic winner declaration.",
      "A human must review uncertainty, data quality, guardrails and implementation integrity before promotion.",
      ...(configErrors.length > 0 ? configErrors.map((error) => `config:${error}`) : [])
    ]
  };
}
