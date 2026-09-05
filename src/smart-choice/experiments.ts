import {
  SMART_CHOICE_EXPERIMENT_PLATFORM_VERSION,
  SMART_CHOICE_EXPERIMENTS,
  analyzeExperiment,
  assignExperiment,
  assignmentMatchesDefinition,
  validateExperimentDefinition,
  type ExperimentAnalysisInput,
  type ExperimentAssignment,
  type ExperimentDefinition,
  type ExperimentReport,
  type ExperimentTreatmentPayload
} from "./experiment-domain.js";
import type { SmartChoiceLanguage } from "./catalog.js";

interface KillSwitchState {
  version: 1;
  active: boolean;
  reasonCode: string;
}

interface PublicExperimentApi {
  version: string;
  getAssignment(): ExperimentAssignment | null;
  getDefinition(): ExperimentDefinition | null;
  getVariantPayload(): ExperimentTreatmentPayload | null;
  analyze(input: ExperimentAnalysisInput): ExperimentReport;
  killSwitch(reasonCode?: string): void;
  clearLocalKillSwitch(): void;
}

declare global {
  interface Window {
    RobysSmartChoiceExperiments?: PublicExperimentApi;
  }
}

const GLOBAL_KILL_SWITCH = false;
const SEED_KEY = "robys-smart-choice-experiment-seed.v1";
const ASSIGNMENT_KEY = "robys-smart-choice-experiment-assignment.v1";
const ANALYTICS_ASSIGNMENT_KEY = "robys-smart-choice-experiment.v1";
const KILL_SWITCH_KEY = "robys-smart-choice-experiment-kill-switch.v1";
const CODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

const benefitCopy: Record<"verified-fit" | "fast-clear-choice", Record<SmartChoiceLanguage, string>> = {
  "verified-fit": {
    tr: "Beş kısa seçim yapın. Size bütçenize ve isteğinize uyan doğrulanmış bir Roby's seçimi gösterelim.",
    en: "Make five quick choices and get a verified Roby's menu choice that fits your preferences and budget.",
    ru: "Сделайте пять коротких выборов — и получите подтверждённую позицию или сочетание Roby's под ваши предпочтения и бюджет."
  },
  "fast-clear-choice": {
    tr: "Yaklaşık 30–45 saniyede net bir seçim görün; içerik ve fiyat her adımda açık kalsın.",
    en: "Get a clear choice in about 30–45 seconds, with contents and price visible at every step.",
    ru: "Получите понятный вариант примерно за 30–45 секунд — состав и цена останутся видимыми на каждом шаге."
  }
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
    // Experiment assignment is optional; product behavior must remain available.
  }
}

function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

function randomSeed(): string {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return `scexp_${[...values].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function sessionSeed(): string {
  try {
    const stored = sessionStorage.getItem(SEED_KEY);
    if (stored && CODE_PATTERN.test(stored)) return stored;
    const created = randomSeed();
    sessionStorage.setItem(SEED_KEY, created);
    return created;
  } catch {
    return randomSeed();
  }
}

function localKillSwitchActive(): boolean {
  const state = readJson<KillSwitchState>(localStorage, KILL_SWITCH_KEY);
  return state?.version === 1 && state.active === true && CODE_PATTERN.test(state.reasonCode);
}

function activeDefinition(): ExperimentDefinition | null {
  if (GLOBAL_KILL_SWITCH || localKillSwitchActive()) return null;
  return SMART_CHOICE_EXPERIMENTS.find((definition) =>
    definition.enabled && !definition.killSwitch && validateExperimentDefinition(definition).length === 0
  ) ?? null;
}

function loadAssignment(definition: ExperimentDefinition): ExperimentAssignment | null {
  const stored = readJson<ExperimentAssignment>(sessionStorage, ASSIGNMENT_KEY);
  if (stored && assignmentMatchesDefinition(stored, definition)) return stored;
  return null;
}

function persistAssignment(assignment: ExperimentAssignment): void {
  writeJson(sessionStorage, ASSIGNMENT_KEY, assignment);
  writeJson(sessionStorage, ANALYTICS_ASSIGNMENT_KEY, {
    id: assignment.experimentId,
    variant: assignment.variantId
  });
}

function clearAssignment(): void {
  removeKey(sessionStorage, ASSIGNMENT_KEY);
  removeKey(sessionStorage, ANALYTICS_ASSIGNMENT_KEY);
}

function assign(): { definition: ExperimentDefinition | null; assignment: ExperimentAssignment | null } {
  const definition = activeDefinition();
  if (!definition) {
    clearAssignment();
    return { definition: null, assignment: null };
  }
  const existing = loadAssignment(definition);
  if (existing) {
    persistAssignment(existing);
    return { definition, assignment: existing };
  }
  const assignment = assignExperiment(definition, sessionSeed(), { globalKillSwitch: GLOBAL_KILL_SWITCH });
  if (!assignment) {
    clearAssignment();
    return { definition, assignment: null };
  }
  persistAssignment(assignment);
  return { definition, assignment };
}

let current = assign();

function currentPayload(): ExperimentTreatmentPayload | null {
  if (!current.definition || !current.assignment) return null;
  return current.definition.variants.find((variant) => variant.id === current.assignment?.variantId)?.payload ?? null;
}

function currentLanguage(): SmartChoiceLanguage {
  const language = document.documentElement.lang;
  return language === "en" || language === "ru" ? language : "tr";
}

function applyTreatment(): void {
  const lead = document.querySelector<HTMLElement>("#smart-choice-app .smart-card .smart-lead");
  if (!lead) return;
  const code = currentPayload()?.benefitCopyCode ?? "verified-fit";
  const nextCopy = benefitCopy[code][currentLanguage()];
  if (lead.textContent !== nextCopy) lead.textContent = nextCopy;
  document.documentElement.dataset.smartChoiceExperiment = current.assignment?.experimentId ?? "disabled";
  document.documentElement.dataset.smartChoiceVariant = current.assignment?.variantId ?? "control-no-experiment";
}

function refreshAssignment(): void {
  current = assign();
  applyTreatment();
}

function exposeApi(): void {
  window.RobysSmartChoiceExperiments = {
    version: SMART_CHOICE_EXPERIMENT_PLATFORM_VERSION,
    getAssignment: () => current.assignment,
    getDefinition: () => current.definition,
    getVariantPayload: () => currentPayload(),
    analyze: (input) => analyzeExperiment(input),
    killSwitch(reasonCode = "operator") {
      if (!CODE_PATTERN.test(reasonCode)) throw new Error("Kill-switch reason must be a bounded internal code.");
      writeJson(localStorage, KILL_SWITCH_KEY, { version: 1, active: true, reasonCode } satisfies KillSwitchState);
      refreshAssignment();
    },
    clearLocalKillSwitch() {
      removeKey(localStorage, KILL_SWITCH_KEY);
      refreshAssignment();
    }
  };
}

function start(): void {
  exposeApi();
  applyTreatment();
  const app = document.querySelector("#smart-choice-app");
  if (app) new MutationObserver(applyTreatment).observe(app, { childList: true, subtree: true });
  const languageObserver = new MutationObserver(applyTreatment);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", start, { once: true })
  : start();
