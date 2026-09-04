export const REVENUE_SIMULATION_SCHEMA_VERSION = "robys.smart-choice-revenue-simulation.v1";
export const REVENUE_MODEL_VERSION = "smart-choice-revenue-model.v1";

export type SimulationLocale = "tr-TR" | "en-US" | "ru-RU";
export type ScenarioId = "conservative" | "expected" | "stretch";
export type GrowthLever = "conversion" | "aov" | "repeat";
export type HypothesisStatus = "eligible" | "requires-data" | "unavailable";

export interface SimulationGuardrails {
  minGrossMarginBps: number;
  maxDiscountBps: number;
}

export interface AvailableMechanisms {
  comboIds: readonly string[];
  upgradeIds: readonly string[];
  bumpIds: readonly string[];
}

export interface RevenueMechanismCatalog {
  combos: readonly {
    id: string;
    sourceStatus: string;
    availability: string;
    pricingMode: string;
    upgrades: readonly { id: string }[];
  }[];
  bumps: readonly {
    id: string;
    sourceStatus: string;
    availability: string;
  }[];
}

export function deriveAvailableMechanisms(catalog: RevenueMechanismCatalog): AvailableMechanisms {
  const pairingCombos = catalog.combos.filter(
    (combo) =>
      combo.sourceStatus === "confirmed" &&
      combo.availability === "available" &&
      combo.pricingMode !== "menu-item"
  );
  return {
    comboIds: pairingCombos.map((combo) => combo.id),
    upgradeIds: pairingCombos.flatMap((combo) => combo.upgrades.map((upgrade) => upgrade.id)),
    bumpIds: catalog.bumps
      .filter((bump) => bump.sourceStatus === "confirmed" && bump.availability === "available")
      .map((bump) => bump.id)
  };
}

export interface RevenueSimulationInput {
  currency: string;
  locale: SimulationLocale;
  currentMonthlyRevenueMinor: number;
  monthlyOrders: number;
  averageOrderValueMinor: number;
  targetGrowthBps: number;
  repeatRateBps?: number;
  averageCogsPerOrderMinor?: number;
  mechanisms: AvailableMechanisms;
  guardrails?: Partial<SimulationGuardrails>;
}

export interface SimulationDiagnostic {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface LeverRequirement {
  lever: GrowthLever;
  shareBps: number;
  requiredLiftBps: number;
  factor: number;
}

export interface ScenarioFinancials {
  mode: "gross-profit";
  projectedGrossProfitMinor: number;
  incrementalGrossProfitMinor: number;
  projectedGrossMarginBps: number;
  marginGuardrail: "pass" | "breach";
}

export interface RevenueScenario {
  id: ScenarioId;
  label: string;
  planningGrowthBps: number;
  targetFractionBps: number;
  projectedRevenueMinor: number;
  projectedOrders: number;
  projectedAverageOrderValueMinor: number;
  projectedRepeatRateBps?: number;
  gapCoveredMinor: number;
  remainingToRequestedTargetMinor: number;
  uncertaintyLowMinor: number;
  uncertaintyHighMinor: number;
  requirements: readonly LeverRequirement[];
  formula: string;
  financials?: ScenarioFinancials;
  warnings: readonly string[];
}

export interface GrowthHypothesis {
  id: string;
  title: string;
  lever: GrowthLever;
  status: HypothesisStatus;
  linkedMechanismIds: readonly string[];
  primaryMetric: string;
  futureExperimentId: string;
  expectedDirection: "increase";
  discountBps: 0;
  evidenceRequired: readonly string[];
  guardrail: string;
}

export interface RevenueSimulationResult {
  schemaVersion: typeof REVENUE_SIMULATION_SCHEMA_VERSION;
  modelVersion: typeof REVENUE_MODEL_VERSION;
  claimLevel: "scenario-only";
  automaticPriceChangesAllowed: false;
  ownerApprovalRequired: true;
  simulationId: string;
  currency: string;
  locale: SimulationLocale;
  input: RevenueSimulationInput;
  reconciliation: {
    declaredRevenueMinor: number;
    revenueFromOrdersAndAovMinor: number;
    differenceMinor: number;
    differenceBps: number;
    status: "consistent" | "review-required";
    effectiveAverageOrderValueMinor: number;
  };
  requestedTarget: {
    growthBps: number;
    targetRevenueMinor: number;
    gapMinor: number;
    additionalOrdersAtCurrentAov: number;
    requiredAovAtCurrentOrdersMinor: number;
    requiredAovIncreaseMinor: number;
  };
  scenarios: readonly RevenueScenario[];
  hypotheses: readonly GrowthHypothesis[];
  missingData: readonly string[];
  revenueOnlyWarning: string | null;
  discountPolicy: {
    proposedDiscountBps: 0;
    maxDiscountBps: number;
    status: "no-discount-proposed";
  };
  notes: readonly string[];
}

interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  targetFractionBps: number;
  shares: Readonly<Record<GrowthLever, number>>;
  uncertainty: { lowBps: number; highBps: number };
}

const DEFAULT_GUARDRAILS: SimulationGuardrails = {
  minGrossMarginBps: 5500,
  maxDiscountBps: 1000
};

const SCENARIO_DEFINITIONS: readonly ScenarioDefinition[] = [
  {
    id: "conservative",
    label: "Conservative",
    targetFractionBps: 6000,
    shares: { conversion: 5000, aov: 3000, repeat: 2000 },
    uncertainty: { lowBps: 7000, highBps: 10000 }
  },
  {
    id: "expected",
    label: "Expected",
    targetFractionBps: 10000,
    shares: { conversion: 4000, aov: 3500, repeat: 2500 },
    uncertainty: { lowBps: 8000, highBps: 12000 }
  },
  {
    id: "stretch",
    label: "Stretch",
    targetFractionBps: 12500,
    shares: { conversion: 3000, aov: 4000, repeat: 3000 },
    uncertainty: { lowBps: 7000, highBps: 13000 }
  }
];

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function diagnostic(
  list: SimulationDiagnostic[],
  code: string,
  severity: "error" | "warning",
  path: string,
  message: string
): void {
  list.push({ code, severity, path, message });
}

function validateIds(ids: readonly string[], path: string, list: SimulationDiagnostic[]): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      diagnostic(list, "SC-SIM-ID-001", "error", `${path}[${index}]`, "Mechanism ID must be a non-empty string.");
      return;
    }
    if (seen.has(id)) {
      diagnostic(list, "SC-SIM-ID-002", "error", `${path}[${index}]`, `Duplicate mechanism ID: ${id}`);
    }
    seen.add(id);
  });
}

export function validateRevenueSimulationInput(input: RevenueSimulationInput): SimulationDiagnostic[] {
  const list: SimulationDiagnostic[] = [];

  if (!isCurrencyCode(input.currency)) {
    diagnostic(list, "SC-SIM-CURRENCY-001", "error", "currency", "Currency must be a three-letter ISO code.");
  }
  if (!["tr-TR", "en-US", "ru-RU"].includes(input.locale)) {
    diagnostic(list, "SC-SIM-LOCALE-001", "error", "locale", "Unsupported simulation locale.");
  }
  if (!isPositiveInteger(input.currentMonthlyRevenueMinor)) {
    diagnostic(list, "SC-SIM-MONEY-001", "error", "currentMonthlyRevenueMinor", "Current revenue must be a positive integer in minor units.");
  }
  if (!isPositiveInteger(input.monthlyOrders)) {
    diagnostic(list, "SC-SIM-ORDERS-001", "error", "monthlyOrders", "Monthly orders must be a positive integer.");
  }
  if (!isPositiveInteger(input.averageOrderValueMinor)) {
    diagnostic(list, "SC-SIM-MONEY-002", "error", "averageOrderValueMinor", "Average order value must be a positive integer in minor units.");
  }
  if (!Number.isInteger(input.targetGrowthBps) || input.targetGrowthBps <= 0 || input.targetGrowthBps > 30000) {
    diagnostic(list, "SC-SIM-GROWTH-001", "error", "targetGrowthBps", "Target growth must be an integer from 1 to 30000 basis points.");
  }
  if (input.repeatRateBps !== undefined && (!Number.isInteger(input.repeatRateBps) || input.repeatRateBps < 0 || input.repeatRateBps > 10000)) {
    diagnostic(list, "SC-SIM-REPEAT-001", "error", "repeatRateBps", "Repeat rate must be an integer from 0 to 10000 basis points.");
  }
  if (input.averageCogsPerOrderMinor !== undefined && !isNonNegativeInteger(input.averageCogsPerOrderMinor)) {
    diagnostic(list, "SC-SIM-COGS-001", "error", "averageCogsPerOrderMinor", "COGS per order must be a non-negative integer in minor units.");
  }

  const guardrails = { ...DEFAULT_GUARDRAILS, ...input.guardrails };
  if (!Number.isInteger(guardrails.minGrossMarginBps) || guardrails.minGrossMarginBps < 0 || guardrails.minGrossMarginBps > 10000) {
    diagnostic(list, "SC-SIM-GUARDRAIL-001", "error", "guardrails.minGrossMarginBps", "Minimum gross margin must be between 0 and 10000 basis points.");
  }
  if (!Number.isInteger(guardrails.maxDiscountBps) || guardrails.maxDiscountBps < 0 || guardrails.maxDiscountBps > 10000) {
    diagnostic(list, "SC-SIM-GUARDRAIL-002", "error", "guardrails.maxDiscountBps", "Maximum discount must be between 0 and 10000 basis points.");
  }

  validateIds(input.mechanisms.comboIds, "mechanisms.comboIds", list);
  validateIds(input.mechanisms.upgradeIds, "mechanisms.upgradeIds", list);
  validateIds(input.mechanisms.bumpIds, "mechanisms.bumpIds", list);

  if (
    isPositiveInteger(input.currentMonthlyRevenueMinor) &&
    isPositiveInteger(input.monthlyOrders) &&
    isPositiveInteger(input.averageOrderValueMinor)
  ) {
    const derived = input.monthlyOrders * input.averageOrderValueMinor;
    const differenceBps = Math.round(Math.abs(derived - input.currentMonthlyRevenueMinor) / input.currentMonthlyRevenueMinor * 10000);
    if (differenceBps > 500) {
      diagnostic(
        list,
        "SC-SIM-RECONCILIATION-001",
        "warning",
        "averageOrderValueMinor",
        "Declared revenue differs from orders × AOV by more than 5%; review the source data before using the scenario."
      );
    }
  }

  return list;
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableSortValue(entry)])
    );
  }
  return value;
}

export function stableStringify(value: unknown, spacing = 0): string {
  return JSON.stringify(stableSortValue(value), null, spacing);
}

function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function factorFromShare(totalFactor: number, shareBps: number): number {
  return Math.exp(Math.log(totalFactor) * (shareBps / 10000));
}

function revenueFromLeverFactors(
  baselineMinor: number,
  factors: Readonly<Record<GrowthLever, number>>,
  realizationBps: number
): number {
  const realized = (Object.keys(factors) as GrowthLever[]).reduce((product, lever) => {
    const lift = factors[lever] - 1;
    return product * (1 + lift * realizationBps / 10000);
  }, 1);
  return Math.round(baselineMinor * realized);
}

function financialsForScenario(
  input: RevenueSimulationInput,
  projectedRevenueMinor: number,
  projectedOrders: number,
  guardrails: SimulationGuardrails
): ScenarioFinancials | undefined {
  if (input.averageCogsPerOrderMinor === undefined) return undefined;
  const baselineGrossProfitMinor = input.currentMonthlyRevenueMinor - input.monthlyOrders * input.averageCogsPerOrderMinor;
  const projectedGrossProfitMinor = projectedRevenueMinor - projectedOrders * input.averageCogsPerOrderMinor;
  const projectedGrossMarginBps = projectedRevenueMinor > 0
    ? Math.round(projectedGrossProfitMinor / projectedRevenueMinor * 10000)
    : 0;
  return {
    mode: "gross-profit",
    projectedGrossProfitMinor,
    incrementalGrossProfitMinor: projectedGrossProfitMinor - baselineGrossProfitMinor,
    projectedGrossMarginBps,
    marginGuardrail: projectedGrossMarginBps >= guardrails.minGrossMarginBps ? "pass" : "breach"
  };
}

function buildScenario(
  definition: ScenarioDefinition,
  input: RevenueSimulationInput,
  targetRevenueMinor: number,
  effectiveAovMinor: number,
  guardrails: SimulationGuardrails
): RevenueScenario {
  const planningGrowthBps = Math.round(input.targetGrowthBps * definition.targetFractionBps / 10000);
  const totalFactor = 1 + planningGrowthBps / 10000;
  const factors: Record<GrowthLever, number> = {
    conversion: factorFromShare(totalFactor, definition.shares.conversion),
    aov: factorFromShare(totalFactor, definition.shares.aov),
    repeat: factorFromShare(totalFactor, definition.shares.repeat)
  };
  const requirements: LeverRequirement[] = (Object.keys(factors) as GrowthLever[]).map((lever) => ({
    lever,
    shareBps: definition.shares[lever],
    requiredLiftBps: Math.round((factors[lever] - 1) * 10000),
    factor: Number(factors[lever].toFixed(8))
  }));
  const projectedRevenueMinor = Math.round(input.currentMonthlyRevenueMinor * totalFactor);
  const projectedOrders = Math.max(1, Math.round(input.monthlyOrders * factors.conversion * factors.repeat));
  const projectedAverageOrderValueMinor = Math.max(1, Math.round(effectiveAovMinor * factors.aov));
  const projectedRepeatRateRaw = input.repeatRateBps === undefined
    ? undefined
    : Math.round(input.repeatRateBps * factors.repeat);
  const warnings: string[] = [];
  if (projectedRepeatRateRaw !== undefined && projectedRepeatRateRaw > 10000) {
    warnings.push("Projected repeat rate exceeds 100%; the repeat lever must be reduced or redefined.");
  }
  const financials = financialsForScenario(input, projectedRevenueMinor, projectedOrders, guardrails);
  if (financials?.marginGuardrail === "breach") {
    warnings.push("Projected gross margin breaches the configured minimum; this scenario is not eligible for execution.");
  }

  return {
    id: definition.id,
    label: definition.label,
    planningGrowthBps,
    targetFractionBps: definition.targetFractionBps,
    projectedRevenueMinor,
    projectedOrders,
    projectedAverageOrderValueMinor,
    ...(projectedRepeatRateRaw === undefined ? {} : { projectedRepeatRateBps: Math.min(10000, projectedRepeatRateRaw) }),
    gapCoveredMinor: projectedRevenueMinor - input.currentMonthlyRevenueMinor,
    remainingToRequestedTargetMinor: Math.max(0, targetRevenueMinor - projectedRevenueMinor),
    uncertaintyLowMinor: revenueFromLeverFactors(input.currentMonthlyRevenueMinor, factors, definition.uncertainty.lowBps),
    uncertaintyHighMinor: revenueFromLeverFactors(input.currentMonthlyRevenueMinor, factors, definition.uncertainty.highBps),
    requirements,
    formula: `revenue × conversion(${factors.conversion.toFixed(4)}) × AOV(${factors.aov.toFixed(4)}) × repeat(${factors.repeat.toFixed(4)})`,
    ...(financials ? { financials } : {}),
    warnings
  };
}

function hypothesis(
  id: string,
  title: string,
  lever: GrowthLever,
  linkedMechanismIds: readonly string[],
  primaryMetric: string,
  futureExperimentId: string,
  evidenceRequired: readonly string[],
  guardrail: string,
  missingDataOnly = false
): GrowthHypothesis {
  return {
    id,
    title,
    lever,
    status: linkedMechanismIds.length > 0 ? "eligible" : (missingDataOnly ? "requires-data" : "unavailable"),
    linkedMechanismIds: [...linkedMechanismIds].sort(),
    primaryMetric,
    futureExperimentId,
    expectedDirection: "increase",
    discountBps: 0,
    evidenceRequired,
    guardrail
  };
}

function buildHypotheses(input: RevenueSimulationInput): GrowthHypothesis[] {
  return [
    hypothesis(
      "combo-discovery",
      "Test clearer placement of confirmed combos",
      "aov",
      input.mechanisms.comboIds,
      "average-order-value",
      "smart-choice-combo-discovery-v1",
      ["combo impressions", "combo selections", "handoff events"],
      "Same catalog price and availability in control and treatment."
    ),
    hypothesis(
      "upgrade-visibility",
      "Test one confirmed upgrade after the base choice",
      "aov",
      input.mechanisms.upgradeIds,
      "upgrade-acceptance-rate",
      "smart-choice-upgrade-visibility-v1",
      ["upgrade impressions", "upgrade acceptances", "gross margin evidence"],
      "No automatic price change; minimum gross margin must pass."
    ),
    hypothesis(
      "single-order-bump",
      "Test one relevant confirmed order bump",
      "aov",
      input.mechanisms.bumpIds,
      "bump-acceptance-rate",
      "smart-choice-single-bump-v1",
      ["bump impressions", "acceptances", "declines", "handoff events"],
      "Exactly one bump; rejection must not block the base order."
    ),
    {
      id: "recommendation-order",
      title: "Test recommendation order without changing commerce data",
      lever: "conversion",
      status: "eligible",
      linkedMechanismIds: [],
      primaryMetric: "handoff-rate",
      futureExperimentId: "smart-choice-recommendation-order-v1",
      expectedDirection: "increase",
      discountBps: 0,
      evidenceRequired: ["recommendation impressions", "selection events", "handoff events"],
      guardrail: "Control and treatment must have identical prices, availability and components."
    },
    hypothesis(
      "repeat-visit-prompt",
      "Test a non-discount repeat-visit prompt",
      "repeat",
      input.repeatRateBps === undefined ? [] : ["repeat-rate-baseline"],
      "repeat-order-rate",
      "smart-choice-repeat-prompt-v1",
      ["anonymous cohort baseline", "repeat visit window", "repeat order event"],
      "No personal contact data and no causal claim without a controlled experiment.",
      true
    ),
    {
      id: "time-window-copy",
      title: "Test time-window relevance copy without a discount",
      lever: "conversion",
      status: "eligible",
      linkedMechanismIds: [],
      primaryMetric: "handoff-rate",
      futureExperimentId: "smart-choice-time-window-copy-v1",
      expectedDirection: "increase",
      discountBps: 0,
      evidenceRequired: ["time bucket", "recommendation impression", "handoff event"],
      guardrail: "Presentation-only test; no price, stock or composition override."
    }
  ];
}

export function simulateRevenueGrowth(input: RevenueSimulationInput): RevenueSimulationResult {
  const diagnostics = validateRevenueSimulationInput(input);
  const errors = diagnostics.filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(`[SMART-CHOICE-REVENUE-SIMULATOR] ${errors.map((entry) => `${entry.path}: ${entry.message}`).join(" | ")}`);
  }

  const guardrails: SimulationGuardrails = { ...DEFAULT_GUARDRAILS, ...input.guardrails };
  const revenueFromOrdersAndAovMinor = input.monthlyOrders * input.averageOrderValueMinor;
  const differenceMinor = revenueFromOrdersAndAovMinor - input.currentMonthlyRevenueMinor;
  const differenceBps = Math.round(Math.abs(differenceMinor) / input.currentMonthlyRevenueMinor * 10000);
  const effectiveAverageOrderValueMinor = Math.max(1, Math.round(input.currentMonthlyRevenueMinor / input.monthlyOrders));
  const targetRevenueMinor = Math.round(input.currentMonthlyRevenueMinor * (1 + input.targetGrowthBps / 10000));
  const gapMinor = targetRevenueMinor - input.currentMonthlyRevenueMinor;
  const requiredAovAtCurrentOrdersMinor = Math.ceil(targetRevenueMinor / input.monthlyOrders);
  const missingData: string[] = [];
  if (input.averageCogsPerOrderMinor === undefined) missingData.push("average-cogs-per-order");
  if (input.repeatRateBps === undefined) missingData.push("baseline-repeat-rate");
  if (differenceBps > 500) missingData.push("reconciled-orders-and-aov");
  if (input.mechanisms.upgradeIds.length === 0) missingData.push("confirmed-upgrade-rules");
  if (input.mechanisms.bumpIds.length === 0) missingData.push("confirmed-bump-rules");

  const normalizedInput: RevenueSimulationInput = {
    ...input,
    guardrails,
    mechanisms: {
      comboIds: [...input.mechanisms.comboIds].sort(),
      upgradeIds: [...input.mechanisms.upgradeIds].sort(),
      bumpIds: [...input.mechanisms.bumpIds].sort()
    }
  };

  const scenarios = SCENARIO_DEFINITIONS.map((definition) =>
    buildScenario(definition, normalizedInput, targetRevenueMinor, effectiveAverageOrderValueMinor, guardrails)
  );

  const resultWithoutId: Omit<RevenueSimulationResult, "simulationId"> = {
    schemaVersion: REVENUE_SIMULATION_SCHEMA_VERSION,
    modelVersion: REVENUE_MODEL_VERSION,
    claimLevel: "scenario-only" as const,
    automaticPriceChangesAllowed: false as const,
    ownerApprovalRequired: true as const,
    currency: input.currency,
    locale: input.locale,
    input: normalizedInput,
    reconciliation: {
      declaredRevenueMinor: input.currentMonthlyRevenueMinor,
      revenueFromOrdersAndAovMinor,
      differenceMinor,
      differenceBps,
      status: differenceBps <= 500 ? "consistent" as const : "review-required" as const,
      effectiveAverageOrderValueMinor
    },
    requestedTarget: {
      growthBps: input.targetGrowthBps,
      targetRevenueMinor,
      gapMinor,
      additionalOrdersAtCurrentAov: Math.ceil(gapMinor / effectiveAverageOrderValueMinor),
      requiredAovAtCurrentOrdersMinor,
      requiredAovIncreaseMinor: Math.max(0, requiredAovAtCurrentOrdersMinor - effectiveAverageOrderValueMinor)
    },
    scenarios,
    hypotheses: buildHypotheses(normalizedInput),
    missingData: [...new Set(missingData)].sort(),
    revenueOnlyWarning: input.averageCogsPerOrderMinor === undefined
      ? "COGS is missing. Revenue scenarios are available, but gross-profit and margin conclusions are unavailable."
      : null,
    discountPolicy: {
      proposedDiscountBps: 0 as const,
      maxDiscountBps: guardrails.maxDiscountBps,
      status: "no-discount-proposed" as const
    },
    notes: [
      "The requested growth rate is a planning target, not a forecast or promise.",
      "Scenario ranges reflect explicit realization assumptions, not statistical confidence intervals.",
      "No price, discount, catalog or availability change is executed by this simulator.",
      "Each eligible hypothesis requires a future controlled experiment before an effect claim."
    ]
  };

  return {
    ...resultWithoutId,
    simulationId: `sim-${stableHash(resultWithoutId)}`
  };
}

export function formatSimulationMoney(minor: number, currency: string, locale: SimulationLocale): string {
  if (!Number.isInteger(minor)) throw new Error("Money must be an integer in minor units.");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(minor / 100);
}

export function exportRevenueSimulationJson(result: RevenueSimulationResult): string {
  return stableStringify(result, 2);
}

export function exportRevenueSimulationMarkdown(result: RevenueSimulationResult): string {
  const money = (minor: number) => formatSimulationMoney(minor, result.currency, result.locale);
  const percent = (bps: number) => `${(bps / 100).toLocaleString(result.locale, { maximumFractionDigits: 2 })}%`;
  const scenarioRows = result.scenarios.map((scenario) => {
    const requirements = scenario.requirements
      .map((entry) => `${entry.lever} ${percent(entry.requiredLiftBps)}`)
      .join("; ");
    const financialSummary = scenario.financials
      ? `${money(scenario.financials.projectedGrossProfitMinor)}; Δ ${money(scenario.financials.incrementalGrossProfitMinor)}; ${percent(scenario.financials.projectedGrossMarginBps)}; ${scenario.financials.marginGuardrail}`
      : "Unavailable — COGS missing";
    return `| ${scenario.label} | ${percent(scenario.planningGrowthBps)} | ${money(scenario.projectedRevenueMinor)} | ${money(scenario.uncertaintyLowMinor)}–${money(scenario.uncertaintyHighMinor)} | ${requirements} | ${financialSummary} |`;
  });
  const hypothesisRows = result.hypotheses.map((entry) =>
    `| ${entry.title} | ${entry.status} | ${entry.primaryMetric} | ${entry.futureExperimentId} |`
  );

  return [
    `# Smart Choice revenue simulation ${result.simulationId}`,
    "",
    `- Schema: \`${result.schemaVersion}\``,
    `- Model: \`${result.modelVersion}\``,
    `- Claim level: **${result.claimLevel}**`,
    `- Current revenue: **${money(result.input.currentMonthlyRevenueMinor)}**`,
    `- Requested target: **${money(result.requestedTarget.targetRevenueMinor)}** (${percent(result.requestedTarget.growthBps)})`,
    `- Gap: **${money(result.requestedTarget.gapMinor)}**`,
    `- Additional orders at current AOV: **${result.requestedTarget.additionalOrdersAtCurrentAov.toLocaleString(result.locale)}**`,
    `- Required AOV at current order count: **${money(result.requestedTarget.requiredAovAtCurrentOrdersMinor)}**`,
    "",
    "> This is a transparent planning scenario, not a forecast, promise, price change or causal claim.",
    "",
    "## Scenarios",
    "",
    "| Scenario | Planned growth | Projected revenue | Explicit range | Required lever lifts | Gross profit / margin |",
    "|---|---:|---:|---:|---|---|",
    ...scenarioRows,
    "",
    "## Hypotheses",
    "",
    "| Hypothesis | Status | Metric | Future experiment |",
    "|---|---|---|---|",
    ...hypothesisRows,
    "",
    "## Missing data",
    "",
    ...(result.missingData.length > 0 ? result.missingData.map((entry) => `- ${entry}`) : ["- None"]),
    "",
    "## Guardrails",
    "",
    `- Proposed discount: ${percent(result.discountPolicy.proposedDiscountBps)}`,
    `- Maximum configured discount: ${percent(result.discountPolicy.maxDiscountBps)}`,
    `- Automatic price changes allowed: ${result.automaticPriceChangesAllowed}`,
    `- Owner approval required: ${result.ownerApprovalRequired}`,
    ""
  ].join("\n");
}
