import {
  SMART_CHOICE_CATALOG,
  type PartySize,
  type SmartChoiceBump,
  type SmartChoiceCatalog,
  type SmartChoiceCombo,
  type SmartChoiceIntent,
  type SmartChoiceItem,
  type SmartChoiceLanguage
} from "./catalog.js";

export type RequestedTemperature = "hot" | "cold" | "any";
export type RequestedTaste = "sweet" | "neutral" | "any";
export type TimeOfDay = "morning" | "day" | "evening" | "late";
export type BudgetClass = "regular" | "premium-stretch";
export type RecommendationStatus = "ok" | "no-match" | "invalid-input";
export type SelectionRole = "top" | "economy" | "premium";

export interface BudgetRange {
  minMinor?: number;
  maxMinor: number;
}

export interface RecommendationInput {
  intent: SmartChoiceIntent;
  temperature: RequestedTemperature;
  taste: RequestedTaste;
  partySize: PartySize;
  budget: BudgetRange;
  locale: SmartChoiceLanguage;
  timeOfDay?: TimeOfDay;
  activeExclusions?: readonly string[];
}

export interface RecommendationWeights {
  intent: number;
  temperature: number;
  taste: number;
  budget: number;
  partySize: number;
  timeOfDay: number;
  businessPriority: number;
}

export interface RecommendationConfig {
  version: string;
  weights: RecommendationWeights;
  premiumStretchRatioBps: number;
  businessPriorityByCandidateId: Readonly<Record<string, number>>;
}

export interface InputDiagnostic {
  code: string;
  path: string;
  message: string;
}

export type ScoreDimension = keyof RecommendationWeights;

export interface ScoreContribution {
  dimension: ScoreDimension;
  weight: number;
  rawScore: number;
  contribution: number;
  reasonCode: string;
}

export interface HardConstraintRejection {
  code: string;
  detail?: string;
}

export interface CandidateDecisionTrace {
  candidateId: string;
  eligible: boolean;
  budgetClass?: BudgetClass;
  priceMinor: number;
  rejectedBy: readonly HardConstraintRejection[];
  score?: number;
  scoreBreakdown?: readonly ScoreContribution[];
}

export interface RankedRecommendation {
  role: SelectionRole;
  candidateId: string;
  name: SmartChoiceCombo["name"];
  priceMinor: number;
  currency: "TRY";
  budgetClass: BudgetClass;
  premiumStretch: boolean;
  score: number;
  scoreBreakdown: readonly ScoreContribution[];
  componentItemIds: readonly string[];
  reasonCodes: readonly string[];
}

export interface EligibleBump {
  bumpId: string;
  targetItemId: string;
  deltaPriceMinor: number;
  finalPriceMinor: number;
  reasonCode: "bump.trigger-match";
}

export interface RecommendationDecisionTrace {
  engineVersion: string;
  configVersion: string;
  catalogVersion: string;
  normalizedInput: RecommendationInput | null;
  inputDiagnostics: readonly InputDiagnostic[];
  appliedHardConstraints: readonly string[];
  premiumStretchLimitMinor: number | null;
  candidates: readonly CandidateDecisionTrace[];
  selections: {
    topCandidateId: string | null;
    economyCandidateId: string | null;
    premiumCandidateId: string | null;
    bumpId: string | null;
  };
}

export interface RecommendationResult {
  status: RecommendationStatus;
  top: RankedRecommendation | null;
  economy: RankedRecommendation | null;
  premium: RankedRecommendation | null;
  bump: EligibleBump | null;
  trace: RecommendationDecisionTrace;
}

interface CandidateProfile {
  combo: SmartChoiceCombo;
  items: readonly SmartChoiceItem[];
  temperatures: ReadonlySet<string>;
  tastes: ReadonlySet<string>;
  tags: ReadonlySet<string>;
}

interface ScoredCandidate {
  combo: SmartChoiceCombo;
  budgetClass: BudgetClass;
  score: number;
  scoreBreakdown: readonly ScoreContribution[];
}

const ENGINE_VERSION = "smart-choice-engine.v0.1.0";
const INTENTS: readonly SmartChoiceIntent[] = ["coffee", "breakfast", "snack", "dessert", "refresh"];
const TEMPERATURES: readonly RequestedTemperature[] = ["hot", "cold", "any"];
const TASTES: readonly RequestedTaste[] = ["sweet", "neutral", "any"];
const PARTY_SIZES: readonly PartySize[] = ["one", "two", "family"];
const LANGUAGES: readonly SmartChoiceLanguage[] = ["tr", "en", "ru"];
const TIMES: readonly TimeOfDay[] = ["morning", "day", "evening", "late"];
const TEMPORAL_TAGS = new Set<string>(TIMES);

export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  version: "smart-choice-recommendation-config.v0.2.0",
  weights: {
    intent: 30,
    temperature: 15,
    taste: 15,
    budget: 15,
    partySize: 10,
    timeOfDay: 5,
    businessPriority: 10
  },
  premiumStretchRatioBps: 12_500,
  businessPriorityByCandidateId: {}
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function addInputDiagnostic(
  diagnostics: InputDiagnostic[],
  code: string,
  path: string,
  message: string
): void {
  diagnostics.push({ code, path, message });
}

function normalizeInput(value: unknown): {
  input: RecommendationInput | null;
  diagnostics: InputDiagnostic[];
} {
  const diagnostics: InputDiagnostic[] = [];
  if (!isRecord(value)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-001", "$", "Input must be an object.");
    return { input: null, diagnostics };
  }

  const intent = value.intent;
  const temperature = value.temperature;
  const taste = value.taste;
  const partySize = value.partySize;
  const locale = value.locale;
  const timeOfDay = value.timeOfDay;
  const budget = value.budget;

  if (!isOneOf(intent, INTENTS)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-002", "intent", "Intent is missing or unsupported.");
  }
  if (!isOneOf(temperature, TEMPERATURES)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-003", "temperature", "Temperature is missing or unsupported.");
  }
  if (!isOneOf(taste, TASTES)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-004", "taste", "Taste is missing or unsupported.");
  }
  if (!isOneOf(partySize, PARTY_SIZES)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-005", "partySize", "Party size is missing or unsupported.");
  }
  if (!isOneOf(locale, LANGUAGES)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-006", "locale", "Locale is missing or unsupported.");
  }
  if (timeOfDay !== undefined && !isOneOf(timeOfDay, TIMES)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-007", "timeOfDay", "Time of day is unsupported.");
  }

  let minMinor: number | undefined;
  let maxMinor: number | undefined;
  if (!isRecord(budget)) {
    addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-008", "budget", "Budget must be an object.");
  } else {
    if (budget.minMinor !== undefined) {
      if (!Number.isInteger(budget.minMinor) || (budget.minMinor as number) < 0) {
        addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-009", "budget.minMinor", "Minimum budget must be a non-negative integer in minor units.");
      } else {
        minMinor = budget.minMinor as number;
      }
    }
    if (!Number.isInteger(budget.maxMinor) || (budget.maxMinor as number) <= 0) {
      addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-010", "budget.maxMinor", "Maximum budget must be a positive integer in minor units.");
    } else {
      maxMinor = budget.maxMinor as number;
    }
    if (minMinor !== undefined && maxMinor !== undefined && minMinor > maxMinor) {
      addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-011", "budget", "Minimum budget cannot exceed maximum budget.");
    }
  }

  let activeExclusions: string[] | undefined;
  if (value.activeExclusions !== undefined) {
    if (!Array.isArray(value.activeExclusions) || value.activeExclusions.some((entry) => typeof entry !== "string" || !entry.trim())) {
      addInputDiagnostic(diagnostics, "SC-ENGINE-INPUT-012", "activeExclusions", "Active exclusions must be non-empty strings.");
    } else {
      activeExclusions = [...new Set(value.activeExclusions.map((entry) => (entry as string).trim()))].sort();
    }
  }

  if (diagnostics.length > 0 || maxMinor === undefined) return { input: null, diagnostics };

  return {
    input: {
      intent: intent as SmartChoiceIntent,
      temperature: temperature as RequestedTemperature,
      taste: taste as RequestedTaste,
      partySize: partySize as PartySize,
      budget: {
        ...(minMinor !== undefined ? { minMinor } : {}),
        maxMinor
      },
      locale: locale as SmartChoiceLanguage,
      ...(timeOfDay !== undefined ? { timeOfDay: timeOfDay as TimeOfDay } : {}),
      ...(activeExclusions ? { activeExclusions } : {})
    },
    diagnostics
  };
}

export function validateRecommendationConfig(config: RecommendationConfig): readonly string[] {
  const errors: string[] = [];
  if (!config.version.trim()) errors.push("Config version is missing.");

  const entries = Object.entries(config.weights) as [ScoreDimension, number][];
  for (const [dimension, weight] of entries) {
    if (!Number.isInteger(weight) || weight < 0) errors.push(`${dimension} weight must be a non-negative integer.`);
  }
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight !== 100) errors.push(`Weights must total 100, found ${totalWeight}.`);
  if (config.weights.businessPriority > 10) errors.push("Business-priority weight must not exceed 10.");
  if (!Number.isInteger(config.premiumStretchRatioBps) || config.premiumStretchRatioBps < 10_000) {
    errors.push("Premium stretch ratio must be an integer of at least 10000 basis points.");
  }
  for (const [candidateId, priority] of Object.entries(config.businessPriorityByCandidateId)) {
    if (!candidateId.trim() || !Number.isInteger(priority) || priority < 0 || priority > 100) {
      errors.push(`Business priority for ${candidateId || "<empty>"} must be an integer from 0 to 100.`);
    }
  }
  return errors;
}

function assertConfig(config: RecommendationConfig): void {
  const errors = validateRecommendationConfig(config);
  if (errors.length > 0) throw new Error(`[SMART-CHOICE-ENGINE-CONFIG] ${errors.join(" ")}`);
}

function buildCandidateProfile(combo: SmartChoiceCombo, itemIndex: ReadonlyMap<string, SmartChoiceItem>): {
  profile: CandidateProfile | null;
  rejections: HardConstraintRejection[];
} {
  const rejections: HardConstraintRejection[] = [];
  const items: SmartChoiceItem[] = [];

  for (const component of combo.components) {
    const item = itemIndex.get(component.itemId);
    if (!item) {
      rejections.push({ code: "hard.missing-component", detail: component.itemId });
      continue;
    }
    items.push(item);
    if (item.sourceStatus !== "confirmed") {
      rejections.push({ code: "hard.component-unconfirmed", detail: item.id });
    }
    if (item.availability !== "available") {
      rejections.push({ code: "hard.component-unavailable", detail: item.id });
    }
  }

  if (rejections.length > 0) return { profile: null, rejections };

  const temperatures = new Set<string>();
  const tastes = new Set<string>();
  const tags = new Set<string>(combo.tags);
  for (const item of items) {
    if (item.temperature !== "not-applicable") temperatures.add(item.temperature);
    tastes.add(item.taste);
    item.tags.forEach((tag) => tags.add(tag));
  }

  return {
    profile: { combo, items, temperatures, tastes, tags },
    rejections
  };
}

function evaluateHardConstraints(
  profile: CandidateProfile,
  input: RecommendationInput,
  stretchLimitMinor: number
): { rejections: HardConstraintRejection[]; budgetClass?: BudgetClass } {
  const { combo, items, temperatures, tastes } = profile;
  const rejections: HardConstraintRejection[] = [];

  if (combo.sourceStatus !== "confirmed") rejections.push({ code: "hard.combo-unconfirmed" });
  if (combo.availability !== "available") rejections.push({ code: "hard.combo-unavailable" });
  if (!combo.intents.includes(input.intent)) rejections.push({ code: "hard.intent-mismatch", detail: input.intent });
  if (input.temperature !== "any" && !temperatures.has(input.temperature)) {
    rejections.push({ code: "hard.temperature-mismatch", detail: input.temperature });
  }
  if (input.taste !== "any" && !tastes.has(input.taste)) {
    rejections.push({ code: "hard.taste-mismatch", detail: input.taste });
  }
  if (!items.some((item) => item.partySizes.includes(input.partySize))) {
    rejections.push({ code: "hard.party-size-mismatch", detail: input.partySize });
  }
  if (combo.pricingMode === "menu-item" && input.partySize !== "one") {
    rejections.push({ code: "hard.single-item-party-size-mismatch", detail: input.partySize });
  }
  if (!combo.name[input.locale]?.trim() || items.some((item) => !item.name[input.locale]?.trim())) {
    rejections.push({ code: "hard.locale-content-missing", detail: input.locale });
  }

  if (combo.priceMinor > stretchLimitMinor) {
    rejections.push({ code: "hard.budget-stretch-limit", detail: String(input.budget.maxMinor) });
  }

  if (rejections.length > 0) return { rejections };
  return {
    rejections,
    budgetClass: combo.priceMinor <= input.budget.maxMinor ? "regular" : "premium-stretch"
  };
}

function contribution(
  dimension: ScoreDimension,
  weight: number,
  rawScore: number,
  reasonCode: string
): ScoreContribution {
  const normalizedRaw = Math.max(0, Math.min(100, Math.trunc(rawScore)));
  return {
    dimension,
    weight,
    rawScore: normalizedRaw,
    contribution: Math.floor((weight * normalizedRaw) / 100),
    reasonCode
  };
}

function budgetRawScore(priceMinor: number, budget: BudgetRange, budgetClass: BudgetClass): number {
  if (budgetClass === "premium-stretch") return 20;
  if (budget.minMinor !== undefined && priceMinor >= budget.minMinor) return 100;
  if (budget.minMinor !== undefined && budget.minMinor > 0) {
    return Math.max(50, Math.floor((priceMinor * 100) / budget.minMinor));
  }
  const distance = budget.maxMinor - priceMinor;
  return Math.max(50, 100 - Math.floor((distance * 50) / budget.maxMinor));
}

function partyRawScore(items: readonly SmartChoiceItem[], partySize: PartySize): number {
  const matching = items.filter((item) => item.partySizes.includes(partySize)).length;
  if (matching === items.length) return 100;
  if (matching > 0) return 60;
  return 0;
}

function timeRawScore(tags: ReadonlySet<string>, timeOfDay: TimeOfDay | undefined): number {
  if (!timeOfDay) return 50;
  if (tags.has(timeOfDay)) return 100;
  const hasTemporalTag = [...TEMPORAL_TAGS].some((tag) => tags.has(tag));
  return hasTemporalTag ? 0 : 50;
}

function scoreCandidate(
  profile: CandidateProfile,
  input: RecommendationInput,
  budgetClass: BudgetClass,
  config: RecommendationConfig
): ScoredCandidate {
  const businessPriority = config.businessPriorityByCandidateId[profile.combo.id] ?? 0;
  const breakdown: ScoreContribution[] = [
    contribution("intent", config.weights.intent, 100, `score.intent.${input.intent}`),
    contribution(
      "temperature",
      config.weights.temperature,
      input.temperature === "any" ? 100 : 100,
      input.temperature === "any" ? "score.temperature.any" : `score.temperature.${input.temperature}`
    ),
    contribution(
      "taste",
      config.weights.taste,
      input.taste === "any" ? 100 : 100,
      input.taste === "any" ? "score.taste.any" : `score.taste.${input.taste}`
    ),
    contribution(
      "budget",
      config.weights.budget,
      budgetRawScore(profile.combo.priceMinor, input.budget, budgetClass),
      budgetClass === "regular" ? "score.budget.within-range" : "score.budget.premium-stretch"
    ),
    contribution(
      "partySize",
      config.weights.partySize,
      partyRawScore(profile.items, input.partySize),
      `score.party-size.${input.partySize}`
    ),
    contribution(
      "timeOfDay",
      config.weights.timeOfDay,
      timeRawScore(profile.tags, input.timeOfDay),
      input.timeOfDay ? `score.time.${input.timeOfDay}` : "score.time.unspecified"
    ),
    contribution(
      "businessPriority",
      config.weights.businessPriority,
      businessPriority,
      businessPriority > 0 ? "score.business-priority.configured" : "score.business-priority.none"
    )
  ];

  return {
    combo: profile.combo,
    budgetClass,
    score: breakdown.reduce((sum, entry) => sum + entry.contribution, 0),
    scoreBreakdown: breakdown
  };
}

function rankingComparator(left: ScoredCandidate, right: ScoredCandidate): number {
  return right.score - left.score || left.combo.priceMinor - right.combo.priceMinor || left.combo.id.localeCompare(right.combo.id, "en");
}

function economyComparator(left: ScoredCandidate, right: ScoredCandidate): number {
  return left.combo.priceMinor - right.combo.priceMinor || right.score - left.score || left.combo.id.localeCompare(right.combo.id, "en");
}

function toRecommendation(candidate: ScoredCandidate, role: SelectionRole): RankedRecommendation {
  return {
    role,
    candidateId: candidate.combo.id,
    name: candidate.combo.name,
    priceMinor: candidate.combo.priceMinor,
    currency: candidate.combo.currency,
    budgetClass: candidate.budgetClass,
    premiumStretch: candidate.budgetClass === "premium-stretch",
    score: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
    componentItemIds: candidate.combo.components.map((component) => component.itemId),
    reasonCodes: candidate.scoreBreakdown.map((entry) => entry.reasonCode)
  };
}

function selectBump(
  top: ScoredCandidate | undefined,
  input: RecommendationInput,
  catalog: SmartChoiceCatalog
): EligibleBump | null {
  if (!top) return null;
  const itemIndex = new Map(catalog.items.map((item) => [item.id, item]));
  const activeExclusions = new Set(input.activeExclusions ?? []);
  const includedItems = new Set(top.combo.components.map((component) => component.itemId));

  const candidates = catalog.bumps
    .filter((bump) => bump.sourceStatus === "confirmed" && bump.availability === "available")
    .filter((bump) => bump.trigger.comboIds?.includes(top.combo.id))
    .filter((bump) => !includedItems.has(bump.targetItemId))
    .filter((bump) => bump.exclusions.every((rule) => !activeExclusions.has(rule)))
    .filter((bump) => {
      const target = itemIndex.get(bump.targetItemId);
      return target?.sourceStatus === "confirmed" && target.availability === "available";
    })
    .filter((bump) => top.combo.priceMinor + bump.deltaPriceMinor <= input.budget.maxMinor)
    .sort((left, right) => left.deltaPriceMinor - right.deltaPriceMinor || left.id.localeCompare(right.id, "en"));

  const bump: SmartChoiceBump | undefined = candidates[0];
  if (!bump) return null;
  return {
    bumpId: bump.id,
    targetItemId: bump.targetItemId,
    deltaPriceMinor: bump.deltaPriceMinor,
    finalPriceMinor: top.combo.priceMinor + bump.deltaPriceMinor,
    reasonCode: "bump.trigger-match"
  };
}

function emptyTrace(
  config: RecommendationConfig,
  catalog: SmartChoiceCatalog,
  input: RecommendationInput | null,
  diagnostics: readonly InputDiagnostic[]
): RecommendationDecisionTrace {
  return {
    engineVersion: ENGINE_VERSION,
    configVersion: config.version,
    catalogVersion: catalog.version,
    normalizedInput: input,
    inputDiagnostics: diagnostics,
    appliedHardConstraints: [
      "confirmed-source",
      "availability",
      "component-integrity",
      "intent",
      "temperature",
      "taste",
      "party-size",
      "single-item-party-size",
      "locale-content",
      "budget-ceiling"
    ],
    premiumStretchLimitMinor: null,
    candidates: [],
    selections: {
      topCandidateId: null,
      economyCandidateId: null,
      premiumCandidateId: null,
      bumpId: null
    }
  };
}

export function recommendSmartChoice(
  rawInput: unknown,
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG,
  config: RecommendationConfig = DEFAULT_RECOMMENDATION_CONFIG
): RecommendationResult {
  assertConfig(config);
  const normalized = normalizeInput(rawInput);
  const baseTrace = emptyTrace(config, catalog, normalized.input, normalized.diagnostics);

  if (!normalized.input) {
    return {
      status: "invalid-input",
      top: null,
      economy: null,
      premium: null,
      bump: null,
      trace: baseTrace
    };
  }

  const input = normalized.input;
  const stretchLimitMinor = Math.floor((input.budget.maxMinor * config.premiumStretchRatioBps) / 10_000);
  const itemIndex = new Map(catalog.items.map((item) => [item.id, item]));
  const traces: CandidateDecisionTrace[] = [];
  const regularCandidates: ScoredCandidate[] = [];
  const stretchCandidates: ScoredCandidate[] = [];

  const combos = [...catalog.combos].sort((left, right) => left.id.localeCompare(right.id, "en"));
  for (const combo of combos) {
    const built = buildCandidateProfile(combo, itemIndex);
    if (!built.profile) {
      traces.push({
        candidateId: combo.id,
        eligible: false,
        priceMinor: combo.priceMinor,
        rejectedBy: built.rejections
      });
      continue;
    }

    const hard = evaluateHardConstraints(built.profile, input, stretchLimitMinor);
    if (hard.rejections.length > 0 || !hard.budgetClass) {
      traces.push({
        candidateId: combo.id,
        eligible: false,
        priceMinor: combo.priceMinor,
        rejectedBy: hard.rejections
      });
      continue;
    }

    const scored = scoreCandidate(built.profile, input, hard.budgetClass, config);
    traces.push({
      candidateId: combo.id,
      eligible: true,
      budgetClass: hard.budgetClass,
      priceMinor: combo.priceMinor,
      rejectedBy: [],
      score: scored.score,
      scoreBreakdown: scored.scoreBreakdown
    });
    if (hard.budgetClass === "regular") regularCandidates.push(scored);
    else stretchCandidates.push(scored);
  }

  regularCandidates.sort(rankingComparator);
  stretchCandidates.sort(rankingComparator);

  const topCandidate = regularCandidates[0];
  const economyCandidate = topCandidate
    ? [...regularCandidates]
        .filter(
          (candidate) =>
            candidate.combo.id !== topCandidate.combo.id &&
            candidate.combo.priceMinor < topCandidate.combo.priceMinor
        )
        .sort(economyComparator)[0]
    : undefined;

  const usedIds = new Set([topCandidate?.combo.id, economyCandidate?.combo.id].filter((value): value is string => Boolean(value)));
  const regularPremiumCandidate = topCandidate
    ? regularCandidates
        .filter((candidate) => !usedIds.has(candidate.combo.id) && candidate.combo.priceMinor > topCandidate.combo.priceMinor)
        .sort(rankingComparator)[0]
    : undefined;
  const premiumCandidate = regularPremiumCandidate ?? (topCandidate ? stretchCandidates[0] : undefined);
  const bump = selectBump(topCandidate, input, catalog);

  const top = topCandidate ? toRecommendation(topCandidate, "top") : null;
  const economy = economyCandidate ? toRecommendation(economyCandidate, "economy") : null;
  const premium = premiumCandidate ? toRecommendation(premiumCandidate, "premium") : null;

  return {
    status: top ? "ok" : "no-match",
    top,
    economy,
    premium,
    bump,
    trace: {
      ...baseTrace,
      premiumStretchLimitMinor: stretchLimitMinor,
      candidates: traces,
      selections: {
        topCandidateId: top?.candidateId ?? null,
        economyCandidateId: economy?.candidateId ?? null,
        premiumCandidateId: premium?.candidateId ?? null,
        bumpId: bump?.bumpId ?? null
      }
    }
  };
}
