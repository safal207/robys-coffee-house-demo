import {
  SMART_CHOICE_CATALOG,
  type SmartChoiceBump,
  type SmartChoiceCatalog
} from "./catalog.js";
import {
  type CandidateDecisionTrace,
  type RecommendationInput,
  type RecommendationResult,
  type ScoreContribution,
  type SelectionRole
} from "./engine.js";
import {
  type JourneyState,
  type SmartChoiceEvent,
  validateSmartChoiceEvent
} from "./analytics-domain.js";

export const DECISION_TRACE_SCHEMA_VERSION = "robys.smart-choice-decision-trace.v1" as const;
export const CAUSAL_GRAPH_VERSION = "smart-choice-causal-graph.v0.1.0" as const;
export const DECISION_TRACE_RUNTIME_VERSION = "smart-choice-decision-trace.v0.1.0" as const;

export type TraceClaimLevel = "mechanism-only";
export type GraphNodeKind = "state" | "context" | "constraint" | "scoring" | "decision" | "intervention" | "outcome";
export type GraphEvidence = "configured-mechanism" | "observed-transition";

export interface TraceTransition {
  eventId: string;
  eventName: SmartChoiceEvent["name"];
  sequence: number;
  fromState: JourneyState;
  toState: JourneyState;
  occurredAtMs: number;
  elapsedMs: number;
}

export interface TraceCandidate {
  candidateId: string;
  priceMinor: number;
  eligible: boolean;
  budgetClass: CandidateDecisionTrace["budgetClass"] | null;
  rejectedBy: readonly { code: string; detail?: string }[];
  score: number | null;
  scoreBreakdown: readonly ScoreContribution[];
  selectionRole: SelectionRole | null;
}

export interface TraceBumpEvaluation {
  bumpId: string;
  targetItemId: string;
  eligible: boolean;
  selected: boolean;
  deltaPriceMinor: number;
  finalPriceMinor: number | null;
  excludedBy: readonly string[];
}

export interface CausalGraphNode {
  id: string;
  kind: GraphNodeKind;
  labelCode: string;
}

export interface CausalGraphEdge {
  id: string;
  from: string;
  to: string;
  mechanismCode: string;
  evidence: GraphEvidence;
  eventId?: string;
}

export interface SmartChoiceCausalGraph {
  version: typeof CAUSAL_GRAPH_VERSION;
  nodes: readonly CausalGraphNode[];
  edges: readonly CausalGraphEdge[];
}

export interface SmartChoiceDecisionTrace {
  schemaVersion: typeof DECISION_TRACE_SCHEMA_VERSION;
  traceId: string;
  runtimeVersion: typeof DECISION_TRACE_RUNTIME_VERSION;
  decisionStatus: RecommendationResult["status"];
  engineVersion: string;
  catalogVersion: string;
  configVersion: string;
  inputSnapshot: RecommendationInput | null;
  inputDiagnostics: RecommendationResult["trace"]["inputDiagnostics"];
  appliedHardConstraints: readonly string[];
  premiumStretchLimitMinor: number | null;
  candidateSet: {
    beforeFiltering: readonly string[];
    afterFiltering: readonly string[];
    rejected: readonly string[];
  };
  candidates: readonly TraceCandidate[];
  selection: {
    topCandidateId: string | null;
    economyCandidateId: string | null;
    premiumCandidateId: string | null;
  };
  bumps: readonly TraceBumpEvaluation[];
  decisionEvent: {
    eventId: string | null;
    occurredAtMs: number | null;
  };
  transitions: readonly TraceTransition[];
  graph: SmartChoiceCausalGraph;
  causalityBoundary: {
    claimLevel: TraceClaimLevel;
    randomizedOrControlledExperimentRequiredForEffectClaim: true;
    statementCode: "trace.explains-mechanism-not-effect";
  };
}

export interface TraceValidationDiagnostic {
  code: string;
  path: string;
  message: string;
}

export type DecisionTraceReadResult =
  | { ok: true; trace: SmartChoiceDecisionTrace }
  | {
      ok: false;
      code: "unsupported-version" | "invalid-trace";
      supportedVersion: typeof DECISION_TRACE_SCHEMA_VERSION;
      foundVersion: string | null;
      diagnostics: readonly TraceValidationDiagnostic[];
    };

const TRACE_ID_PATTERN = /^sct_[a-f0-9]{8}$/;
const STATE_NODES: readonly CausalGraphNode[] = [
  { id: "S0", kind: "state", labelCode: "state.viewed" },
  { id: "S1", kind: "state", labelCode: "state.intent-selected" },
  { id: "S2", kind: "state", labelCode: "state.preferences-captured" },
  { id: "S3", kind: "state", labelCode: "state.recommendations-shown" },
  { id: "S4", kind: "state", labelCode: "state.recommendation-selected" },
  { id: "S5", kind: "state", labelCode: "state.bump-decided" },
  { id: "S6", kind: "state", labelCode: "state.handoff-started" },
  { id: "S7", kind: "state", labelCode: "state.repeat-order-future" }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, canonicalize(value[key])])
  );
}

export function stableSerializeDecisionTrace(trace: SmartChoiceDecisionTrace): string {
  return JSON.stringify(canonicalize(trace));
}

function stableSerializeUnknown(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function selectionRole(result: RecommendationResult, candidateId: string): SelectionRole | null {
  if (result.top?.candidateId === candidateId) return "top";
  if (result.economy?.candidateId === candidateId) return "economy";
  if (result.premium?.candidateId === candidateId) return "premium";
  return null;
}

function traceCandidate(result: RecommendationResult, candidate: CandidateDecisionTrace): TraceCandidate {
  return {
    candidateId: candidate.candidateId,
    priceMinor: candidate.priceMinor,
    eligible: candidate.eligible,
    budgetClass: candidate.budgetClass ?? null,
    rejectedBy: [...candidate.rejectedBy]
      .map((entry) => ({ code: entry.code, ...(entry.detail ? { detail: entry.detail } : {}) }))
      .sort((left, right) => left.code.localeCompare(right.code, "en") || (left.detail ?? "").localeCompare(right.detail ?? "", "en")),
    score: candidate.score ?? null,
    scoreBreakdown: [...(candidate.scoreBreakdown ?? [])].sort((left, right) => left.dimension.localeCompare(right.dimension, "en")),
    selectionRole: selectionRole(result, candidate.candidateId)
  };
}

function bumpExclusions(
  bump: SmartChoiceBump,
  result: RecommendationResult,
  input: RecommendationInput | null,
  catalog: SmartChoiceCatalog
): string[] {
  const excluded: string[] = [];
  const topId = result.top?.candidateId;
  const top = topId ? catalog.combos.find((combo) => combo.id === topId) : undefined;
  const target = catalog.items.find((item) => item.id === bump.targetItemId);
  const activeExclusions = new Set(input?.activeExclusions ?? []);
  const includedItems = new Set(top?.components.map((component) => component.itemId) ?? []);

  if (!top) excluded.push("bump.no-top-recommendation");
  if (bump.sourceStatus !== "confirmed") excluded.push("bump.unconfirmed");
  if (bump.availability !== "available") excluded.push("bump.unavailable");
  if (topId && !bump.trigger.comboIds?.includes(topId)) excluded.push("bump.trigger-mismatch");
  if (includedItems.has(bump.targetItemId)) excluded.push("bump.target-already-included");
  if (bump.exclusions.some((rule) => activeExclusions.has(rule))) excluded.push("bump.active-exclusion");
  if (!target) excluded.push("bump.target-missing");
  else {
    if (target.sourceStatus !== "confirmed") excluded.push("bump.target-unconfirmed");
    if (target.availability !== "available") excluded.push("bump.target-unavailable");
  }
  if (top && input && top.priceMinor + bump.deltaPriceMinor > input.budget.maxMinor) excluded.push("bump.budget-exceeded");
  return [...new Set(excluded)].sort((left, right) => left.localeCompare(right, "en"));
}

function evaluateBumps(
  result: RecommendationResult,
  catalog: SmartChoiceCatalog
): TraceBumpEvaluation[] {
  const input = result.trace.normalizedInput;
  const topPrice = result.top?.priceMinor ?? null;
  return [...catalog.bumps]
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
    .map((bump) => {
      const excludedBy = bumpExclusions(bump, result, input, catalog);
      return {
        bumpId: bump.id,
        targetItemId: bump.targetItemId,
        eligible: excludedBy.length === 0,
        selected: result.bump?.bumpId === bump.id,
        deltaPriceMinor: bump.deltaPriceMinor,
        finalPriceMinor: topPrice === null ? null : topPrice + bump.deltaPriceMinor,
        excludedBy
      };
    });
}

function validEvents(events: readonly SmartChoiceEvent[]): SmartChoiceEvent[] {
  return [...events]
    .filter((event) => validateSmartChoiceEvent(event).length === 0)
    .sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId, "en"));
}

function buildTransitions(events: readonly SmartChoiceEvent[]): TraceTransition[] {
  return validEvents(events).map((event) => ({
    eventId: event.eventId,
    eventName: event.name,
    sequence: event.sequence,
    fromState: event.fromState,
    toState: event.toState,
    occurredAtMs: event.occurredAtMs,
    elapsedMs: event.elapsedMs
  }));
}

function mechanismEdges(): CausalGraphEdge[] {
  return [
    ["S0", "S1", "mechanism.start-guided-flow"],
    ["S1", "S2", "mechanism.capture-explicit-preferences"],
    ["S2", "constraint-filter", "mechanism.apply-hard-constraints"],
    ["constraint-filter", "score-candidates", "mechanism.score-eligible-candidates"],
    ["score-candidates", "recommendation-decision", "mechanism.rank-with-stable-tiebreak"],
    ["recommendation-decision", "S3", "mechanism.render-ranked-options"],
    ["S3", "S4", "mechanism.guest-selects-recommendation"],
    ["S4", "bump-intervention", "mechanism.evaluate-one-relevant-bump"],
    ["bump-intervention", "S5", "mechanism.guest-accepts-or-declines"],
    ["S4", "S6", "mechanism.handoff-without-bump"],
    ["S5", "S6", "mechanism.handoff-after-bump-decision"],
    ["S6", "S7", "mechanism.repeat-order-future"]
  ].map(([from, to, mechanismCode], index) => ({
    id: `configured-${String(index + 1).padStart(2, "0")}`,
    from,
    to,
    mechanismCode,
    evidence: "configured-mechanism" as const
  }));
}

function buildGraph(transitions: readonly TraceTransition[]): SmartChoiceCausalGraph {
  const nodes: CausalGraphNode[] = [
    ...STATE_NODES,
    { id: "explicit-context", kind: "context", labelCode: "context.explicit-input-snapshot" },
    { id: "constraint-filter", kind: "constraint", labelCode: "constraint.hard-filter" },
    { id: "score-candidates", kind: "scoring", labelCode: "scoring.weighted-contributions" },
    { id: "recommendation-decision", kind: "decision", labelCode: "decision.rank-and-select" },
    { id: "bump-intervention", kind: "intervention", labelCode: "intervention.single-order-bump" },
    { id: "handoff-outcome", kind: "outcome", labelCode: "outcome.handoff-started" }
  ];
  const observed = transitions.map((transition) => ({
    id: `observed-${transition.eventId}`,
    from: transition.fromState,
    to: transition.toState,
    mechanismCode: `event.${transition.eventName}`,
    evidence: "observed-transition" as const,
    eventId: transition.eventId
  }));
  return {
    version: CAUSAL_GRAPH_VERSION,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id, "en")),
    edges: [...mechanismEdges(), ...observed].sort((left, right) => left.id.localeCompare(right.id, "en"))
  };
}

function decisionEvent(events: readonly SmartChoiceEvent[]): SmartChoiceEvent | null {
  return validEvents(events)
    .filter((event) => event.name === "recommendations_shown")
    .at(-1) ?? null;
}

export function buildDecisionTrace(
  result: RecommendationResult,
  events: readonly SmartChoiceEvent[] = [],
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): SmartChoiceDecisionTrace {
  const candidates = [...result.trace.candidates]
    .map((candidate) => traceCandidate(result, candidate))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId, "en"));
  const transitions = buildTransitions(events);
  const linkedDecisionEvent = decisionEvent(events);
  const base = {
    schemaVersion: DECISION_TRACE_SCHEMA_VERSION,
    runtimeVersion: DECISION_TRACE_RUNTIME_VERSION,
    decisionStatus: result.status,
    engineVersion: result.trace.engineVersion,
    catalogVersion: result.trace.catalogVersion,
    configVersion: result.trace.configVersion,
    inputSnapshot: result.trace.normalizedInput,
    inputDiagnostics: [...result.trace.inputDiagnostics],
    appliedHardConstraints: [...result.trace.appliedHardConstraints].sort((left, right) => left.localeCompare(right, "en")),
    premiumStretchLimitMinor: result.trace.premiumStretchLimitMinor,
    candidateSet: {
      beforeFiltering: candidates.map((candidate) => candidate.candidateId),
      afterFiltering: candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.candidateId),
      rejected: candidates.filter((candidate) => !candidate.eligible).map((candidate) => candidate.candidateId)
    },
    candidates,
    selection: {
      topCandidateId: result.trace.selections.topCandidateId,
      economyCandidateId: result.trace.selections.economyCandidateId,
      premiumCandidateId: result.trace.selections.premiumCandidateId
    },
    bumps: evaluateBumps(result, catalog),
    decisionEvent: {
      eventId: linkedDecisionEvent?.eventId ?? null,
      occurredAtMs: linkedDecisionEvent?.occurredAtMs ?? null
    },
    transitions,
    graph: buildGraph(transitions),
    causalityBoundary: {
      claimLevel: "mechanism-only" as const,
      randomizedOrControlledExperimentRequiredForEffectClaim: true as const,
      statementCode: "trace.explains-mechanism-not-effect" as const
    }
  };
  const traceId = `sct_${fnv1a32(stableSerializeUnknown(base))}`;
  return { ...base, traceId };
}

export function validateDecisionTrace(value: unknown): TraceValidationDiagnostic[] {
  const diagnostics: TraceValidationDiagnostic[] = [];
  const add = (code: string, path: string, message: string) => diagnostics.push({ code, path, message });
  if (!isRecord(value)) {
    add("SC-TRACE-SCHEMA-001", "$", "Decision trace must be an object.");
    return diagnostics;
  }
  if (value.schemaVersion !== DECISION_TRACE_SCHEMA_VERSION) {
    add("SC-TRACE-VERSION-001", "schemaVersion", `Unsupported trace schema version; expected ${DECISION_TRACE_SCHEMA_VERSION}.`);
  }
  if (typeof value.traceId !== "string" || !TRACE_ID_PATTERN.test(value.traceId)) add("SC-TRACE-ID-001", "traceId", "Trace ID is invalid.");
  for (const field of ["runtimeVersion", "engineVersion", "catalogVersion", "configVersion"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim()) add("SC-TRACE-VERSION-002", field, `${field} must be a non-empty version string.`);
  }
  if (!isRecord(value.candidateSet) || !Array.isArray(value.candidates)) add("SC-TRACE-CANDIDATE-001", "candidates", "Candidate sets are missing.");
  if (!isRecord(value.selection)) add("SC-TRACE-SELECTION-001", "selection", "Selection is missing.");
  if (!Array.isArray(value.bumps)) add("SC-TRACE-BUMP-001", "bumps", "Bump evaluations are missing.");
  if (!Array.isArray(value.transitions)) add("SC-TRACE-TRANSITION-001", "transitions", "Transitions are missing.");
  if (!isRecord(value.causalityBoundary) || value.causalityBoundary.claimLevel !== "mechanism-only") {
    add("SC-TRACE-CAUSALITY-001", "causalityBoundary", "Trace must remain mechanism-only and cannot claim treatment effect.");
  }
  if (Array.isArray(value.candidates)) {
    const ids = value.candidates.map((candidate) => isRecord(candidate) ? candidate.candidateId : null);
    if (ids.some((id) => typeof id !== "string")) add("SC-TRACE-CANDIDATE-002", "candidates", "Every candidate needs a stable ID.");
    const stringIds = ids.filter((id): id is string => typeof id === "string");
    if (new Set(stringIds).size !== stringIds.length) add("SC-TRACE-CANDIDATE-003", "candidates", "Candidate IDs must be unique.");
  }
  return diagnostics;
}

export function assertDecisionTrace(value: unknown): asserts value is SmartChoiceDecisionTrace {
  const diagnostics = validateDecisionTrace(value);
  if (diagnostics.length > 0) throw new Error(`[SMART-CHOICE-TRACE] ${diagnostics.map((entry) => `${entry.path}:${entry.code}`).join(" ")}`);
}

export function readDecisionTrace(value: unknown): DecisionTraceReadResult {
  const foundVersion = isRecord(value) && typeof value.schemaVersion === "string" ? value.schemaVersion : null;
  if (foundVersion !== DECISION_TRACE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "unsupported-version",
      supportedVersion: DECISION_TRACE_SCHEMA_VERSION,
      foundVersion,
      diagnostics: [{
        code: "SC-TRACE-VERSION-001",
        path: "schemaVersion",
        message: `Unsupported trace schema version ${foundVersion ?? "<missing>"}; supported version is ${DECISION_TRACE_SCHEMA_VERSION}.`
      }]
    };
  }
  const diagnostics = validateDecisionTrace(value);
  if (diagnostics.length > 0) {
    return { ok: false, code: "invalid-trace", supportedVersion: DECISION_TRACE_SCHEMA_VERSION, foundVersion, diagnostics };
  }
  return { ok: true, trace: value as unknown as SmartChoiceDecisionTrace };
}

export function explainSelection(trace: SmartChoiceDecisionTrace, candidateId = trace.selection.topCandidateId): {
  candidateId: string | null;
  role: SelectionRole | null;
  summaryCode: string;
  score: number | null;
  positiveContributions: readonly ScoreContribution[];
} {
  if (!candidateId) return { candidateId: null, role: null, summaryCode: "selection.none", score: null, positiveContributions: [] };
  const candidate = trace.candidates.find((entry) => entry.candidateId === candidateId);
  if (!candidate) return { candidateId, role: null, summaryCode: "selection.candidate-not-in-trace", score: null, positiveContributions: [] };
  return {
    candidateId,
    role: candidate.selectionRole,
    summaryCode: candidate.eligible ? "selection.eligible-and-ranked" : "selection.invalid-selected-candidate",
    score: candidate.score,
    positiveContributions: candidate.scoreBreakdown
      .filter((entry) => entry.contribution > 0)
      .sort((left, right) => right.contribution - left.contribution || left.dimension.localeCompare(right.dimension, "en"))
  };
}

export function explainExclusion(trace: SmartChoiceDecisionTrace, candidateId: string): {
  candidateId: string;
  found: boolean;
  eligible: boolean | null;
  reasonCodes: readonly string[];
} {
  const candidate = trace.candidates.find((entry) => entry.candidateId === candidateId);
  if (!candidate) return { candidateId, found: false, eligible: null, reasonCodes: ["exclusion.candidate-not-in-trace"] };
  return {
    candidateId,
    found: true,
    eligible: candidate.eligible,
    reasonCodes: candidate.eligible ? ["exclusion.not-excluded"] : candidate.rejectedBy.map((entry) => entry.code)
  };
}

export function renderDecisionTraceText(trace: SmartChoiceDecisionTrace): string {
  const selected = explainSelection(trace);
  const rejected = trace.candidates.filter((candidate) => !candidate.eligible);
  const lines = [
    `Trace ${trace.traceId} (${trace.schemaVersion})`,
    `Decision: ${trace.decisionStatus}`,
    `Versions: engine=${trace.engineVersion}; catalog=${trace.catalogVersion}; config=${trace.configVersion}`,
    `Candidates: ${trace.candidateSet.beforeFiltering.length} before, ${trace.candidateSet.afterFiltering.length} eligible, ${trace.candidateSet.rejected.length} rejected`,
    `Selected: ${selected.candidateId ?? "none"}; score=${selected.score ?? "n/a"}; role=${selected.role ?? "n/a"}`,
    `Bump: ${trace.bumps.find((bump) => bump.selected)?.bumpId ?? "none"}`,
    `Observed transitions: ${trace.transitions.map((transition) => `${transition.fromState}>${transition.toState}:${transition.eventName}`).join(", ") || "none"}`,
    "Causality: mechanism trace only; an effect claim requires a randomized or correctly controlled experiment."
  ];
  for (const candidate of rejected) {
    lines.push(`Excluded ${candidate.candidateId}: ${candidate.rejectedBy.map((reason) => reason.code).join(", ") || "unknown"}`);
  }
  return lines.join("\n");
}
