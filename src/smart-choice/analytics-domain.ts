import {
  SMART_CHOICE_CATALOG,
  type SmartChoiceLanguage
} from "./catalog.js";
import { DEFAULT_RECOMMENDATION_CONFIG } from "./engine.js";

export const SMART_CHOICE_EVENT_SCHEMA_VERSION = "robys.smart-choice-event.v1" as const;
export const SMART_CHOICE_ANALYTICS_VERSION = "smart-choice-analytics.v0.1.0" as const;

export type JourneyState = "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
export type SmartChoiceEventName =
  | "smart_choice_viewed"
  | "smart_choice_started"
  | "question_answered"
  | "recommendations_shown"
  | "recommendation_selected"
  | "upgrade_selected"
  | "bump_shown"
  | "bump_accepted"
  | "bump_declined"
  | "order_handoff_started"
  | "flow_abandoned";

export type QuestionId = "intent" | "temperature" | "taste" | "partySize" | "budgetKey";

export interface SmartChoiceEvent {
  schemaVersion: typeof SMART_CHOICE_EVENT_SCHEMA_VERSION;
  eventId: string;
  name: SmartChoiceEventName;
  sessionId: string;
  sequence: number;
  occurredAtMs: number;
  elapsedMs: number;
  fromState: JourneyState;
  toState: JourneyState;
  locale: SmartChoiceLanguage;
  catalogVersion: string;
  configVersion: string;
  recommendationId?: string;
  ruleId?: string;
  questionId?: QuestionId;
  answerCode?: string;
  basketBeforeMinor?: number;
  basketAfterMinor?: number;
  experimentId?: string;
  experimentVariant?: string;
  reasonCode?: string;
}

export interface AnalyticsSessionSeed {
  sessionId: string;
  startedAtMs: number;
  nextSequence: number;
}

export interface SmartChoiceEventDraft {
  name: SmartChoiceEventName;
  fromState: JourneyState;
  toState: JourneyState;
  locale: SmartChoiceLanguage;
  occurredAtMs: number;
  recommendationId?: string;
  ruleId?: string;
  questionId?: QuestionId;
  answerCode?: string;
  basketBeforeMinor?: number;
  basketAfterMinor?: number;
  experimentId?: string;
  experimentVariant?: string;
  reasonCode?: string;
}

export interface EventValidationDiagnostic {
  code: string;
  path: string;
  message: string;
}

export interface JourneyDiagnostic {
  sessionId: string;
  code: string;
  sequence?: number;
  message: string;
}

export interface FunnelMetrics {
  eligibleSessions: number;
  viewedSessions: number;
  startedSessions: number;
  recommendationSessions: number;
  selectedSessions: number;
  bumpShownSessions: number;
  bumpAcceptedSessions: number;
  handoffSessions: number;
  startRate: number | null;
  completionRate: number | null;
  recommendationAcceptanceRate: number | null;
  bumpAcceptanceRate: number | null;
  handoffRate: number | null;
  medianTimeToChoiceMs: number | null;
  averageRecommendedBasketMinor: number | null;
  averageHandoffBasketMinor: number | null;
  incrementalBasketFromBumpMinor: number | null;
}

export interface AnalyticsSink {
  readonly id: string;
  publish(event: SmartChoiceEvent): void | Promise<void>;
}

const STATES: readonly JourneyState[] = ["S0", "S1", "S2", "S3", "S4", "S5", "S6"];
const LANGUAGES: readonly SmartChoiceLanguage[] = ["tr", "en", "ru"];
const EVENT_NAMES: readonly SmartChoiceEventName[] = [
  "smart_choice_viewed",
  "smart_choice_started",
  "question_answered",
  "recommendations_shown",
  "recommendation_selected",
  "upgrade_selected",
  "bump_shown",
  "bump_accepted",
  "bump_declined",
  "order_handoff_started",
  "flow_abandoned"
];
const QUESTION_IDS: readonly QuestionId[] = ["intent", "temperature", "taste", "partySize", "budgetKey"];
const ALLOWED_KEYS = new Set<keyof SmartChoiceEvent>([
  "schemaVersion",
  "eventId",
  "name",
  "sessionId",
  "sequence",
  "occurredAtMs",
  "elapsedMs",
  "fromState",
  "toState",
  "locale",
  "catalogVersion",
  "configVersion",
  "recommendationId",
  "ruleId",
  "questionId",
  "answerCode",
  "basketBeforeMinor",
  "basketAfterMinor",
  "experimentId",
  "experimentVariant",
  "reasonCode"
]);
const CODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SESSION_PATTERN = /^sc_[a-f0-9]{32}$/;
const EVENT_ID_PATTERN = /^sce_[a-f0-9]{32}_[1-9][0-9]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function addDiagnostic(
  diagnostics: EventValidationDiagnostic[],
  code: string,
  path: string,
  message: string
): void {
  diagnostics.push({ code, path, message });
}

function validateCode(
  diagnostics: EventValidationDiagnostic[],
  value: unknown,
  path: string,
  required = false
): void {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || !CODE_PATTERN.test(value)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-CODE-001", path, "Value must be a bounded internal code, not free text.");
  }
}

function validateMoney(
  diagnostics: EventValidationDiagnostic[],
  value: unknown,
  path: string
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < 0) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-MONEY-001", path, "Money must be a non-negative integer in minor units.");
  }
}

function validateTransition(
  event: Partial<SmartChoiceEvent>,
  diagnostics: EventValidationDiagnostic[]
): void {
  const from = event.fromState;
  const to = event.toState;
  if (!from || !to || !event.name) return;
  const allowed: Record<SmartChoiceEventName, readonly string[]> = {
    smart_choice_viewed: ["S0>S0"],
    smart_choice_started: ["S0>S1"],
    question_answered: ["S1>S1", "S1>S2"],
    recommendations_shown: ["S2>S3"],
    recommendation_selected: ["S3>S4"],
    upgrade_selected: ["S4>S4", "S5>S5"],
    bump_shown: ["S4>S4"],
    bump_accepted: ["S4>S5"],
    bump_declined: ["S4>S5"],
    order_handoff_started: ["S4>S6", "S5>S6"],
    flow_abandoned: STATES.map((state) => `${state}>${state}`)
  };
  if (!allowed[event.name].includes(`${from}>${to}`)) {
    addDiagnostic(
      diagnostics,
      "SC-ANALYTICS-TRANSITION-001",
      "fromState/toState",
      `Transition ${from}>${to} is invalid for ${event.name}.`
    );
  }
}

export function validateSmartChoiceEvent(value: unknown): EventValidationDiagnostic[] {
  const diagnostics: EventValidationDiagnostic[] = [];
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-SCHEMA-001", "$", "Event must be an object.");
    return diagnostics;
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key as keyof SmartChoiceEvent)) {
      addDiagnostic(diagnostics, "SC-ANALYTICS-SCHEMA-002", key, "Unknown properties are rejected to prevent accidental PII or free text.");
    }
  }

  if (value.schemaVersion !== SMART_CHOICE_EVENT_SCHEMA_VERSION) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-SCHEMA-003", "schemaVersion", "Unsupported event schema version.");
  }
  if (typeof value.eventId !== "string" || !EVENT_ID_PATTERN.test(value.eventId)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-ID-001", "eventId", "Event ID is invalid.");
  }
  if (typeof value.sessionId !== "string" || !SESSION_PATTERN.test(value.sessionId)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-ID-002", "sessionId", "Anonymous session ID is invalid.");
  }
  if (!isOneOf(value.name, EVENT_NAMES)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-NAME-001", "name", "Event name is unsupported.");
  }
  if (!Number.isInteger(value.sequence) || (value.sequence as number) <= 0) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-SEQUENCE-001", "sequence", "Sequence must be a positive integer.");
  }
  if (!Number.isInteger(value.occurredAtMs) || (value.occurredAtMs as number) <= 0) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-TIME-001", "occurredAtMs", "Occurrence time must be a positive integer.");
  }
  if (!Number.isInteger(value.elapsedMs) || (value.elapsedMs as number) < 0) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-TIME-002", "elapsedMs", "Elapsed time must be a non-negative integer.");
  }
  if (!isOneOf(value.fromState, STATES)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-STATE-001", "fromState", "Source state is invalid.");
  }
  if (!isOneOf(value.toState, STATES)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-STATE-002", "toState", "Destination state is invalid.");
  }
  if (!isOneOf(value.locale, LANGUAGES)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-LOCALE-001", "locale", "Locale is invalid.");
  }

  validateCode(diagnostics, value.catalogVersion, "catalogVersion", true);
  validateCode(diagnostics, value.configVersion, "configVersion", true);
  validateCode(diagnostics, value.recommendationId, "recommendationId");
  validateCode(diagnostics, value.ruleId, "ruleId");
  validateCode(diagnostics, value.answerCode, "answerCode");
  validateCode(diagnostics, value.experimentId, "experimentId");
  validateCode(diagnostics, value.experimentVariant, "experimentVariant");
  validateCode(diagnostics, value.reasonCode, "reasonCode");
  validateMoney(diagnostics, value.basketBeforeMinor, "basketBeforeMinor");
  validateMoney(diagnostics, value.basketAfterMinor, "basketAfterMinor");

  if (value.questionId !== undefined && !isOneOf(value.questionId, QUESTION_IDS)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-QUESTION-001", "questionId", "Question ID is unsupported.");
  }
  if (value.name === "question_answered" && (!value.questionId || !value.answerCode)) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-QUESTION-002", "questionId/answerCode", "Question events require internal question and answer codes.");
  }
  if (value.name === "recommendation_selected" && !value.recommendationId) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-RECOMMENDATION-001", "recommendationId", "Selected recommendation ID is required.");
  }
  if (["upgrade_selected", "bump_shown", "bump_accepted", "bump_declined"].includes(String(value.name)) && !value.ruleId) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-RULE-001", "ruleId", "Rule ID is required for upgrade and bump events.");
  }
  if (["upgrade_selected", "bump_accepted", "bump_declined", "order_handoff_started"].includes(String(value.name))) {
    if (value.basketBeforeMinor === undefined || value.basketAfterMinor === undefined) {
      addDiagnostic(diagnostics, "SC-ANALYTICS-BASKET-001", "basketBeforeMinor/basketAfterMinor", "Basket values are required for this event.");
    }
  }
  if (value.name === "flow_abandoned" && !value.reasonCode) {
    addDiagnostic(diagnostics, "SC-ANALYTICS-ABANDON-001", "reasonCode", "Abandonment needs a bounded reason code.");
  }

  validateTransition(value as Partial<SmartChoiceEvent>, diagnostics);
  return diagnostics;
}

export function assertSmartChoiceEvent(value: unknown): asserts value is SmartChoiceEvent {
  const diagnostics = validateSmartChoiceEvent(value);
  if (diagnostics.length === 0) return;
  throw new Error(
    `[SMART-CHOICE-ANALYTICS] Invalid event:\n${diagnostics
      .map((entry) => `${entry.code} ${entry.path}: ${entry.message}`)
      .join("\n")}`
  );
}

export function createSmartChoiceEvent(
  seed: AnalyticsSessionSeed,
  draft: SmartChoiceEventDraft
): SmartChoiceEvent {
  const event: SmartChoiceEvent = {
    schemaVersion: SMART_CHOICE_EVENT_SCHEMA_VERSION,
    eventId: `sce_${seed.sessionId.slice(3)}_${seed.nextSequence}`,
    name: draft.name,
    sessionId: seed.sessionId,
    sequence: seed.nextSequence,
    occurredAtMs: Math.trunc(draft.occurredAtMs),
    elapsedMs: Math.max(0, Math.trunc(draft.occurredAtMs - seed.startedAtMs)),
    fromState: draft.fromState,
    toState: draft.toState,
    locale: draft.locale,
    catalogVersion: SMART_CHOICE_CATALOG.version,
    configVersion: DEFAULT_RECOMMENDATION_CONFIG.version,
    ...(draft.recommendationId ? { recommendationId: draft.recommendationId } : {}),
    ...(draft.ruleId ? { ruleId: draft.ruleId } : {}),
    ...(draft.questionId ? { questionId: draft.questionId } : {}),
    ...(draft.answerCode ? { answerCode: draft.answerCode } : {}),
    ...(draft.basketBeforeMinor !== undefined ? { basketBeforeMinor: draft.basketBeforeMinor } : {}),
    ...(draft.basketAfterMinor !== undefined ? { basketAfterMinor: draft.basketAfterMinor } : {}),
    ...(draft.experimentId ? { experimentId: draft.experimentId } : {}),
    ...(draft.experimentVariant ? { experimentVariant: draft.experimentVariant } : {}),
    ...(draft.reasonCode ? { reasonCode: draft.reasonCode } : {})
  };
  assertSmartChoiceEvent(event);
  return event;
}

export function stableSerializeEvent(event: SmartChoiceEvent): string {
  assertSmartChoiceEvent(event);
  const ordered: Record<string, unknown> = {};
  for (const key of [...ALLOWED_KEYS].sort()) {
    const value = event[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

export function reconstructJourney(events: readonly SmartChoiceEvent[]): JourneyDiagnostic[] {
  const diagnostics: JourneyDiagnostic[] = [];
  const sessions = new Map<string, SmartChoiceEvent[]>();
  for (const event of events) {
    const validation = validateSmartChoiceEvent(event);
    if (validation.length > 0) {
      diagnostics.push({
        sessionId: typeof event?.sessionId === "string" ? event.sessionId : "unknown",
        code: "journey.invalid-event",
        sequence: event?.sequence,
        message: validation.map((entry) => entry.code).join(",")
      });
      continue;
    }
    const list = sessions.get(event.sessionId) ?? [];
    list.push(event);
    sessions.set(event.sessionId, list);
  }

  for (const [sessionId, sessionEvents] of sessions) {
    const ordered = [...sessionEvents].sort((left, right) => left.sequence - right.sequence);
    let expectedSequence = 1;
    let currentState: JourneyState = "S0";
    const eventIds = new Set<string>();
    for (const event of ordered) {
      if (eventIds.has(event.eventId)) {
        diagnostics.push({ sessionId, code: "journey.duplicate-event-id", sequence: event.sequence, message: event.eventId });
      }
      eventIds.add(event.eventId);
      if (event.sequence !== expectedSequence) {
        diagnostics.push({ sessionId, code: "journey.sequence-gap", sequence: event.sequence, message: `Expected ${expectedSequence}.` });
        expectedSequence = event.sequence;
      }
      if (event.name !== "smart_choice_viewed" && event.name !== "flow_abandoned" && event.fromState !== currentState) {
        diagnostics.push({
          sessionId,
          code: "journey.state-discontinuity",
          sequence: event.sequence,
          message: `Expected ${currentState}, received ${event.fromState}.`
        });
      }
      currentState = event.toState;
      expectedSequence += 1;
    }
  }
  return diagnostics;
}

function uniqueSessions(events: readonly SmartChoiceEvent[], name: SmartChoiceEventName): Set<string> {
  return new Set(events.filter((event) => event.name === name).map((event) => event.sessionId));
}

function safeRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

export function calculateFunnelMetrics(events: readonly SmartChoiceEvent[]): FunnelMetrics {
  const validEvents = events.filter((event) => validateSmartChoiceEvent(event).length === 0);
  const viewed = uniqueSessions(validEvents, "smart_choice_viewed");
  const started = uniqueSessions(validEvents, "smart_choice_started");
  const recommendations = uniqueSessions(validEvents, "recommendations_shown");
  const selected = uniqueSessions(validEvents, "recommendation_selected");
  const bumpShown = uniqueSessions(validEvents, "bump_shown");
  const bumpAccepted = uniqueSessions(validEvents, "bump_accepted");
  const handoff = uniqueSessions(validEvents, "order_handoff_started");

  const selectedValues = validEvents
    .filter((event) => event.name === "recommendation_selected" && event.basketAfterMinor !== undefined)
    .map((event) => event.basketAfterMinor!);
  const handoffValues = validEvents
    .filter((event) => event.name === "order_handoff_started" && event.basketAfterMinor !== undefined)
    .map((event) => event.basketAfterMinor!);
  const bumpIncrements = validEvents
    .filter((event) => event.name === "bump_accepted" && event.basketBeforeMinor !== undefined && event.basketAfterMinor !== undefined)
    .map((event) => event.basketAfterMinor! - event.basketBeforeMinor!);
  const choiceTimes = validEvents
    .filter((event) => event.name === "recommendation_selected")
    .map((event) => event.elapsedMs);

  return {
    eligibleSessions: viewed.size,
    viewedSessions: viewed.size,
    startedSessions: started.size,
    recommendationSessions: recommendations.size,
    selectedSessions: selected.size,
    bumpShownSessions: bumpShown.size,
    bumpAcceptedSessions: bumpAccepted.size,
    handoffSessions: handoff.size,
    startRate: safeRate(started.size, viewed.size),
    completionRate: safeRate(recommendations.size, started.size),
    recommendationAcceptanceRate: safeRate(selected.size, recommendations.size),
    bumpAcceptanceRate: safeRate(bumpAccepted.size, bumpShown.size),
    handoffRate: safeRate(handoff.size, recommendations.size),
    medianTimeToChoiceMs: median(choiceTimes),
    averageRecommendedBasketMinor: average(selectedValues),
    averageHandoffBasketMinor: average(handoffValues),
    incrementalBasketFromBumpMinor: average(bumpIncrements)
  };
}

export class MemoryAnalyticsSink implements AnalyticsSink {
  readonly id = "memory";
  readonly events: SmartChoiceEvent[] = [];

  publish(event: SmartChoiceEvent): void {
    assertSmartChoiceEvent(event);
    this.events.push(JSON.parse(stableSerializeEvent(event)) as SmartChoiceEvent);
  }
}

export class ConsoleAnalyticsSink implements AnalyticsSink {
  readonly id = "console";

  publish(event: SmartChoiceEvent): void {
    assertSmartChoiceEvent(event);
    console.debug("[SMART-CHOICE-ANALYTICS]", JSON.parse(stableSerializeEvent(event)));
  }
}

export class CallbackAnalyticsAdapter implements AnalyticsSink {
  constructor(
    readonly id: string,
    private readonly callback: (event: SmartChoiceEvent) => void | Promise<void>
  ) {
    if (!CODE_PATTERN.test(id)) throw new Error("Analytics adapter ID must be a bounded internal code.");
  }

  publish(event: SmartChoiceEvent): void | Promise<void> {
    assertSmartChoiceEvent(event);
    return this.callback(JSON.parse(stableSerializeEvent(event)) as SmartChoiceEvent);
  }
}
