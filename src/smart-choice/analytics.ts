import {
  SMART_CHOICE_CATALOG,
  type PartySize,
  type SmartChoiceIntent,
  type SmartChoiceLanguage
} from "./catalog.js";
import {
  DEFAULT_RECOMMENDATION_CONFIG,
  recommendSmartChoice,
  type RecommendationInput,
  type RecommendationResult,
  type RequestedTaste,
  type RequestedTemperature
} from "./engine.js";
import {
  calculateCart,
  deriveCartRules,
  type CartState
} from "./cart-domain.js";
import {
  CallbackAnalyticsAdapter,
  ConsoleAnalyticsSink,
  SMART_CHOICE_ANALYTICS_VERSION,
  assertSmartChoiceEvent,
  calculateFunnelMetrics,
  createSmartChoiceEvent,
  stableSerializeEvent,
  type AnalyticsSink,
  type JourneyState,
  type QuestionId,
  type SmartChoiceEvent,
  type SmartChoiceEventDraft
} from "./analytics-domain.js";

interface FlowSnapshot {
  version: 1;
  screen: "welcome" | "question" | "results" | "selected";
  questionIndex: number;
  answers: Partial<Record<QuestionId, string>>;
  locale: SmartChoiceLanguage;
  selectedCandidateId?: string;
}

interface ExperimentAssignment {
  id: string;
  variant: string;
}

interface AnalyticsRuntimeState {
  version: 1;
  analyticsVersion: string;
  sessionId: string;
  startedAtMs: number;
  nextSequence: number;
  currentState: JourneyState;
  emittedKeys: string[];
  started: boolean;
  handoffStarted: boolean;
}

interface PublicAnalyticsApi {
  version: string;
  registerAdapter(id: string, callback: (event: SmartChoiceEvent) => void | Promise<void>): void;
  getDebugEvents(): readonly SmartChoiceEvent[];
  getFunnelMetrics(): ReturnType<typeof calculateFunnelMetrics>;
}

declare global {
  interface Window {
    RobysSmartChoiceAnalytics?: PublicAnalyticsApi;
  }
}

const FLOW_STORAGE_KEY = "robys-smart-choice-session.v1";
const CART_STORAGE_KEY = "robys-smart-choice-cart.v1";
const ANALYTICS_STATE_KEY = "robys-smart-choice-analytics-state.v1";
const DEBUG_EVENTS_KEY = "robys-smart-choice-analytics-events.v1";
const DEBUG_FLAG_KEY = "robys-smart-choice-analytics-debug";
const EXPERIMENT_KEY = "robys-smart-choice-experiment.v1";
const QUESTION_IDS: readonly QuestionId[] = ["intent", "temperature", "taste", "partySize", "budgetKey"];
const QUESTION_ANSWERS: Readonly<Record<QuestionId, readonly string[]>> = {
  intent: ["coffee", "breakfast", "snack", "dessert", "refresh"],
  temperature: ["hot", "cold", "any"],
  taste: ["sweet", "neutral", "any"],
  partySize: ["one", "two", "family"],
  budgetKey: ["250", "400", "600", "open"]
};
const budgets: Readonly<Record<string, { minMinor?: number; maxMinor: number }>> = {
  "250": { maxMinor: 25_000 },
  "400": { minMinor: 25_001, maxMinor: 40_000 },
  "600": { minMinor: 40_001, maxMinor: 60_000 },
  open: { maxMinor: 60_000 }
};
const CODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const rules = deriveCartRules();
const sinks: AnalyticsSink[] = [];

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Analytics must never block the product flow.
  }
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function initialRuntimeState(): AnalyticsRuntimeState {
  return {
    version: 1,
    analyticsVersion: SMART_CHOICE_ANALYTICS_VERSION,
    sessionId: `sc_${randomHex(16)}`,
    startedAtMs: Date.now(),
    nextSequence: 1,
    currentState: "S0",
    emittedKeys: [],
    started: false,
    handoffStarted: false
  };
}

function loadRuntimeState(): AnalyticsRuntimeState {
  const stored = readJson<Partial<AnalyticsRuntimeState>>(sessionStorage, ANALYTICS_STATE_KEY);
  if (
    stored?.version === 1 &&
    stored.analyticsVersion === SMART_CHOICE_ANALYTICS_VERSION &&
    typeof stored.sessionId === "string" &&
    /^sc_[a-f0-9]{32}$/.test(stored.sessionId) &&
    Number.isInteger(stored.startedAtMs) &&
    Number.isInteger(stored.nextSequence) &&
    typeof stored.currentState === "string" &&
    Array.isArray(stored.emittedKeys)
  ) {
    return {
      version: 1,
      analyticsVersion: SMART_CHOICE_ANALYTICS_VERSION,
      sessionId: stored.sessionId,
      startedAtMs: stored.startedAtMs!,
      nextSequence: stored.nextSequence!,
      currentState: stored.currentState as JourneyState,
      emittedKeys: stored.emittedKeys.filter((entry): entry is string => typeof entry === "string").slice(-200),
      started: stored.started === true,
      handoffStarted: stored.handoffStarted === true
    };
  }
  return initialRuntimeState();
}

let runtime = loadRuntimeState();

function persistRuntime(): void {
  writeJson(sessionStorage, ANALYTICS_STATE_KEY, runtime);
}

class SessionDebugSink implements AnalyticsSink {
  readonly id = "session-debug";

  publish(event: SmartChoiceEvent): void {
    assertSmartChoiceEvent(event);
    const events = readJson<SmartChoiceEvent[]>(sessionStorage, DEBUG_EVENTS_KEY) ?? [];
    const next = [...events, JSON.parse(stableSerializeEvent(event)) as SmartChoiceEvent].slice(-200);
    writeJson(sessionStorage, DEBUG_EVENTS_KEY, next);
  }
}

sinks.push(new SessionDebugSink());

function consoleDebugEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).get("analyticsDebug") === "1" ||
      localStorage.getItem(DEBUG_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

if (consoleDebugEnabled()) sinks.push(new ConsoleAnalyticsSink());

function safeFlow(): FlowSnapshot {
  const fallback: FlowSnapshot = {
    version: 1,
    screen: "welcome",
    questionIndex: 0,
    answers: {},
    locale: "tr"
  };
  const flow = readJson<FlowSnapshot>(sessionStorage, FLOW_STORAGE_KEY);
  return flow?.version === 1 ? flow : fallback;
}

function safeCart(): CartState | null {
  const cart = readJson<CartState>(sessionStorage, CART_STORAGE_KEY);
  return cart?.version === 1 ? cart : null;
}

function safeExperiment(): ExperimentAssignment | null {
  const value = readJson<ExperimentAssignment>(sessionStorage, EXPERIMENT_KEY);
  return value && CODE_PATTERN.test(value.id) && CODE_PATTERN.test(value.variant) ? value : null;
}

function recommendationResult(flow: FlowSnapshot): RecommendationResult | null {
  const answers = flow.answers;
  if (!answers.intent || !answers.temperature || !answers.taste || !answers.partySize || !answers.budgetKey) return null;
  const budget = budgets[answers.budgetKey];
  if (!budget) return null;
  const input: RecommendationInput = {
    intent: answers.intent as SmartChoiceIntent,
    temperature: answers.temperature as RequestedTemperature,
    taste: answers.taste as RequestedTaste,
    partySize: answers.partySize as PartySize,
    budget,
    locale: flow.locale
  };
  return recommendSmartChoice(input);
}

function uniqueRecommendationIds(result: RecommendationResult): string[] {
  const seen = new Set<string>();
  return [result.top, result.economy, result.premium]
    .filter((entry) => {
      if (!entry || seen.has(entry.candidateId)) return false;
      seen.add(entry.candidateId);
      return true;
    })
    .map((entry) => entry!.candidateId);
}

function selectedRecommendationPrice(flow: FlowSnapshot): number | null {
  const result = recommendationResult(flow);
  const selected = [result?.top, result?.economy, result?.premium]
    .find((entry) => entry?.candidateId === flow.selectedCandidateId);
  return selected?.priceMinor ?? null;
}

function currentCartTotal(flow: FlowSnapshot, cart: CartState | null = safeCart()): number | null {
  if (!cart || !flow.answers.partySize) return selectedRecommendationPrice(flow);
  return calculateCart(cart, flow.answers.partySize as PartySize).totalMinor;
}

function emit(
  draft: Omit<SmartChoiceEventDraft, "occurredAtMs" | "locale">,
  options: { dedupeKey?: string; flow?: FlowSnapshot } = {}
): SmartChoiceEvent | null {
  if (options.dedupeKey && runtime.emittedKeys.includes(options.dedupeKey)) return null;
  const flow = options.flow ?? safeFlow();
  const experiment = safeExperiment();
  const occurredAtMs = Date.now();
  const event = createSmartChoiceEvent(
    {
      sessionId: runtime.sessionId,
      startedAtMs: runtime.startedAtMs,
      nextSequence: runtime.nextSequence
    },
    {
      ...draft,
      occurredAtMs,
      locale: flow.locale,
      ...(experiment ? { experimentId: experiment.id, experimentVariant: experiment.variant } : {})
    }
  );

  runtime = {
    ...runtime,
    nextSequence: runtime.nextSequence + 1,
    currentState: event.toState,
    emittedKeys: options.dedupeKey
      ? [...runtime.emittedKeys, options.dedupeKey].slice(-200)
      : runtime.emittedKeys,
    started: runtime.started || event.name === "smart_choice_started",
    handoffStarted: runtime.handoffStarted || event.name === "order_handoff_started"
  };
  persistRuntime();
  for (const sink of sinks) {
    try {
      void sink.publish(event);
    } catch (error) {
      if (consoleDebugEnabled()) console.warn("[SMART-CHOICE-ANALYTICS] Sink failed", sink.id, error);
    }
  }
  return event;
}

function emitViewed(): void {
  emit(
    { name: "smart_choice_viewed", fromState: "S0", toState: "S0" },
    { dedupeKey: "viewed:v1" }
  );
}

function handleStart(flow: FlowSnapshot): void {
  if (runtime.currentState !== "S0") return;
  emit({ name: "smart_choice_started", fromState: "S0", toState: "S1" }, { flow });
}

function handleQuestionAnswer(button: HTMLButtonElement, before: FlowSnapshot): void {
  const questionId = QUESTION_IDS[before.questionIndex];
  if (!questionId) return;
  const buttons = [...button.closest(".option-grid")?.querySelectorAll<HTMLButtonElement>(".option-button") ?? []];
  const optionIndex = buttons.indexOf(button);
  const answerCode = QUESTION_ANSWERS[questionId][optionIndex];
  if (!answerCode) return;
  queueMicrotask(() => {
    const flow = safeFlow();
    const lastQuestion = before.questionIndex === QUESTION_IDS.length - 1;
    emit({
      name: "question_answered",
      fromState: "S1",
      toState: lastQuestion ? "S2" : "S1",
      questionId,
      answerCode
    }, { flow });
  });
}

function handleRecommendationSelection(button: HTMLElement, flow: FlowSnapshot): void {
  if (runtime.currentState !== "S3") return;
  const result = recommendationResult(flow);
  if (!result) return;
  const cards = [...document.querySelectorAll<HTMLElement>(".result-card")];
  const card = button.closest<HTMLElement>(".result-card");
  const cardIndex = card ? cards.indexOf(card) : -1;
  const candidateId = uniqueRecommendationIds(result)[cardIndex];
  if (!candidateId) return;
  const candidate = [result.top, result.economy, result.premium].find((entry) => entry?.candidateId === candidateId);
  emit({
    name: "recommendation_selected",
    fromState: "S3",
    toState: "S4",
    recommendationId: candidateId,
    basketBeforeMinor: 0,
    basketAfterMinor: candidate?.priceMinor ?? 0
  }, { flow });
}

function handleCartChoice(beforeFlow: FlowSnapshot, beforeCart: CartState | null): void {
  const beforeTotal = currentCartTotal(beforeFlow, beforeCart);
  queueMicrotask(() => {
    const flow = safeFlow();
    const afterCart = safeCart();
    if (!beforeCart || !afterCart || beforeTotal === null) return;
    const afterTotal = currentCartTotal(flow, afterCart);
    if (afterTotal === null) return;
    const addedUpgrade = afterCart.upgradeIds.find((id) => !beforeCart.upgradeIds.includes(id));
    if (addedUpgrade) {
      emit({
        name: "upgrade_selected",
        fromState: runtime.currentState === "S5" ? "S5" : "S4",
        toState: runtime.currentState === "S5" ? "S5" : "S4",
        ruleId: addedUpgrade,
        basketBeforeMinor: beforeTotal,
        basketAfterMinor: afterTotal
      }, { flow });
    }
  });
}

function handleBumpDecision(beforeFlow: FlowSnapshot, beforeCart: CartState | null, accepted: boolean): void {
  const beforeTotal = currentCartTotal(beforeFlow, beforeCart);
  queueMicrotask(() => {
    const flow = safeFlow();
    const afterCart = safeCart();
    const afterTotal = currentCartTotal(flow, afterCart);
    const ruleId = afterCart?.bumpId ?? beforeCart?.bumpId;
    if (!ruleId || beforeTotal === null || afterTotal === null) return;
    emit({
      name: accepted ? "bump_accepted" : "bump_declined",
      fromState: "S4",
      toState: "S5",
      ruleId,
      basketBeforeMinor: beforeTotal,
      basketAfterMinor: afterTotal
    }, { flow });
  });
}

function handleHandoff(flow: FlowSnapshot): void {
  const total = currentCartTotal(flow);
  if (!flow.selectedCandidateId || total === null || runtime.handoffStarted) return;
  emit({
    name: "order_handoff_started",
    fromState: runtime.currentState === "S5" ? "S5" : "S4",
    toState: "S6",
    recommendationId: flow.selectedCandidateId,
    basketBeforeMinor: total,
    basketAfterMinor: total,
    ...(runtime.currentState === "S4" ? { reasonCode: "bump-skipped-by-handoff" } : {})
  }, { flow });
}

function inspectRenderedState(): void {
  const flow = safeFlow();
  if (flow.screen === "results" && runtime.currentState === "S2") {
    const result = recommendationResult(flow);
    emit({
      name: "recommendations_shown",
      fromState: "S2",
      toState: "S3",
      ...(result?.top ? { recommendationId: result.top.candidateId } : { reasonCode: "no-match" })
    }, {
      flow,
      dedupeKey: `recommendations:${JSON.stringify(flow.answers)}:${flow.locale}`
    });
  }

  const bumpCard = document.querySelector<HTMLElement>(".cart-bump");
  const cart = safeCart();
  if (bumpCard && cart?.bumpDecision === "pending" && cart.bumpId && runtime.currentState === "S4") {
    const total = currentCartTotal(flow, cart);
    emit({
      name: "bump_shown",
      fromState: "S4",
      toState: "S4",
      ruleId: cart.bumpId,
      ...(total !== null ? { basketBeforeMinor: total, basketAfterMinor: total } : {})
    }, { flow, dedupeKey: `bump-shown:${flow.selectedCandidateId ?? "none"}:${cart.bumpId}` });
  }
}

function handleClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const flow = safeFlow();

  const optionButton = target.closest<HTMLButtonElement>(".option-button");
  if (optionButton && flow.screen === "question") {
    handleQuestionAnswer(optionButton, flow);
    return;
  }

  const resultButton = target.closest<HTMLElement>(".result-card .primary-button");
  if (resultButton && flow.screen === "results") {
    handleRecommendationSelection(resultButton, flow);
    return;
  }

  const welcomeStart = target.closest<HTMLElement>(".smart-card .primary-button");
  if (welcomeStart && flow.screen === "welcome") {
    handleStart(flow);
    return;
  }

  const bumpCard = target.closest<HTMLElement>(".cart-bump");
  if (bumpCard) {
    const beforeCart = safeCart();
    if (target.closest(".primary-button")) {
      handleBumpDecision(flow, beforeCart, true);
      return;
    }
    if (target.closest(".secondary-button")) {
      handleBumpDecision(flow, beforeCart, false);
      return;
    }
  }

  const cartChoice = target.closest<HTMLElement>(".cart-choice");
  if (cartChoice) {
    handleCartChoice(flow, safeCart());
    return;
  }

  const handoff = target.closest<HTMLAnchorElement>(".cart-handoff[href]");
  if (handoff) handleHandoff(flow);
}

function abandon(reasonCode: "pagehide" | "visibility-hidden"): void {
  if (!runtime.started || runtime.handoffStarted || runtime.currentState === "S0" || runtime.currentState === "S6") return;
  emit({
    name: "flow_abandoned",
    fromState: runtime.currentState,
    toState: runtime.currentState,
    reasonCode
  }, { dedupeKey: "abandoned:v1" });
}

function exposePublicApi(): void {
  window.RobysSmartChoiceAnalytics = {
    version: SMART_CHOICE_ANALYTICS_VERSION,
    registerAdapter(id, callback) {
      if (!CODE_PATTERN.test(id)) throw new Error("Adapter ID must be a bounded internal code.");
      if (sinks.some((sink) => sink.id === id)) throw new Error(`Analytics adapter already registered: ${id}`);
      sinks.push(new CallbackAnalyticsAdapter(id, callback));
    },
    getDebugEvents() {
      return readJson<SmartChoiceEvent[]>(sessionStorage, DEBUG_EVENTS_KEY) ?? [];
    },
    getFunnelMetrics() {
      return calculateFunnelMetrics(this.getDebugEvents());
    }
  };
}

function start(): void {
  emitViewed();
  exposePublicApi();
  document.addEventListener("click", handleClick, { capture: true });
  const app = document.querySelector("#smart-choice-app");
  if (app) new MutationObserver(inspectRenderedState).observe(app, { childList: true, subtree: true });
  inspectRenderedState();
  window.addEventListener("pagehide", () => abandon("pagehide"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") abandon("visibility-hidden");
  });

  // Useful for local QA without transmitting anything.
  if (consoleDebugEnabled()) {
    console.debug("[SMART-CHOICE-ANALYTICS] ready", {
      version: SMART_CHOICE_ANALYTICS_VERSION,
      catalogVersion: SMART_CHOICE_CATALOG.version,
      configVersion: DEFAULT_RECOMMENDATION_CONFIG.version
    });
  }
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", start, { once: true })
  : start();
