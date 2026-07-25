import {
  type PartySize,
  type SmartChoiceIntent,
  type SmartChoiceLanguage
} from "./catalog.js";
import {
  recommendSmartChoice,
  type RecommendationInput,
  type RequestedTaste,
  type RequestedTemperature
} from "./engine.js";
import { type QuestionId, type SmartChoiceEvent } from "./analytics-domain.js";
import {
  DECISION_TRACE_RUNTIME_VERSION,
  buildDecisionTrace,
  explainExclusion,
  explainSelection,
  readDecisionTrace,
  renderDecisionTraceText,
  stableSerializeDecisionTrace,
  type SmartChoiceDecisionTrace
} from "./decision-trace-domain.js";

interface FlowSnapshot {
  version: 1;
  screen: "welcome" | "question" | "results" | "selected";
  questionIndex: number;
  answers: Partial<Record<QuestionId, string>>;
  locale: SmartChoiceLanguage;
  selectedCandidateId?: string;
}

interface PublicDecisionTraceApi {
  version: string;
  getTrace(): SmartChoiceDecisionTrace;
  exportJson(): string;
  renderText(): string;
  explainSelection(candidateId?: string): ReturnType<typeof explainSelection>;
  explainExclusion(candidateId: string): ReturnType<typeof explainExclusion>;
  read(value: unknown): ReturnType<typeof readDecisionTrace>;
}

declare global {
  interface Window {
    RobysSmartChoiceDecisionTrace?: PublicDecisionTraceApi;
  }
}

const FLOW_STORAGE_KEY = "robys-smart-choice-session.v1";
const EVENTS_STORAGE_KEY = "robys-smart-choice-analytics-events.v1";
const TRACE_STORAGE_KEY = "robys-smart-choice-decision-trace.v1";
const DEBUG_FLAG_KEY = "robys-smart-choice-trace-debug";
const budgets: Readonly<Record<string, { minMinor?: number; maxMinor: number }>> = {
  "250": { maxMinor: 25_000 },
  "400": { minMinor: 25_001, maxMinor: 40_000 },
  "600": { minMinor: 40_001, maxMinor: 60_000 },
  open: { maxMinor: 60_000 }
};

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
    // Decision tracing is diagnostic and must never block the product flow.
  }
}

function safeFlow(): FlowSnapshot {
  const stored = readJson<FlowSnapshot>(sessionStorage, FLOW_STORAGE_KEY);
  if (stored?.version === 1) return stored;
  return { version: 1, screen: "welcome", questionIndex: 0, answers: {}, locale: "tr" };
}

function recommendationInput(flow: FlowSnapshot): RecommendationInput | null {
  const { intent, temperature, taste, partySize, budgetKey } = flow.answers;
  const budget = budgetKey ? budgets[budgetKey] : undefined;
  if (!intent || !temperature || !taste || !partySize || !budget) return null;
  return {
    intent: intent as SmartChoiceIntent,
    temperature: temperature as RequestedTemperature,
    taste: taste as RequestedTaste,
    partySize: partySize as PartySize,
    budget,
    locale: flow.locale
  };
}

function safeEvents(): SmartChoiceEvent[] {
  const events = readJson<SmartChoiceEvent[]>(sessionStorage, EVENTS_STORAGE_KEY);
  return Array.isArray(events) ? events : [];
}

function currentTrace(): SmartChoiceDecisionTrace {
  const flow = safeFlow();
  const input = recommendationInput(flow);
  const result = recommendSmartChoice(input ?? null);
  const trace = buildDecisionTrace(result, safeEvents());
  writeJson(sessionStorage, TRACE_STORAGE_KEY, JSON.parse(stableSerializeDecisionTrace(trace)));
  return trace;
}

function debugEnabled(): boolean {
  try {
    const query = new URLSearchParams(location.search);
    return query.get("traceDebug") === "1" ||
      query.get("adminDebug") === "1" ||
      localStorage.getItem(DEBUG_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function mountDebugPanel(): void {
  if (!debugEnabled()) return;
  const main = document.querySelector("#smart-choice-main");
  if (!main) return;
  let panel = document.querySelector<HTMLElement>("#smart-choice-trace-debug");
  if (!panel) {
    panel = create("section", "trace-debug-panel");
    panel.id = "smart-choice-trace-debug";
    panel.setAttribute("aria-labelledby", "smart-choice-trace-title");
    const title = create("h2", "trace-debug-title", "Decision Trace · DEV/ADMIN");
    title.id = "smart-choice-trace-title";
    const note = create(
      "p",
      "trace-debug-note",
      "Механизм и наблюдаемые переходы. Это не доказательство причинного роста выручки."
    );
    const output = create("pre", "trace-debug-output");
    output.setAttribute("tabindex", "0");
    panel.append(title, note, output);
    main.append(panel);
  }
  const output = panel.querySelector<HTMLElement>(".trace-debug-output");
  if (output) output.textContent = renderDecisionTraceText(currentTrace());
}

function exposeApi(): void {
  window.RobysSmartChoiceDecisionTrace = {
    version: DECISION_TRACE_RUNTIME_VERSION,
    getTrace: currentTrace,
    exportJson() {
      return stableSerializeDecisionTrace(currentTrace());
    },
    renderText() {
      return renderDecisionTraceText(currentTrace());
    },
    explainSelection(candidateId) {
      return explainSelection(currentTrace(), candidateId);
    },
    explainExclusion(candidateId) {
      return explainExclusion(currentTrace(), candidateId);
    },
    read: readDecisionTrace
  };
}

function start(): void {
  exposeApi();
  if (!debugEnabled()) return;
  const app = document.querySelector("#smart-choice-app");
  if (app) new MutationObserver(mountDebugPanel).observe(app, { childList: true, subtree: true });
  document.addEventListener("click", () => queueMicrotask(mountDebugPanel), { capture: true });
  mountDebugPanel();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", start, { once: true })
  : start();
