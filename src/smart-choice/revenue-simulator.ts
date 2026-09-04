import { SMART_CHOICE_CATALOG } from "./catalog.js";
import {
  exportRevenueSimulationJson,
  exportRevenueSimulationMarkdown,
  formatSimulationMoney,
  deriveAvailableMechanisms,
  simulateRevenueGrowth,
  validateRevenueSimulationInput,
  type RevenueSimulationInput,
  type RevenueSimulationResult,
  type SimulationLocale
} from "./revenue-simulator-domain.js";

function requireElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`[SMART-CHOICE-REVENUE-SIMULATOR] Missing element: ${selector}`);
  return node;
}

const form = requireElement<HTMLFormElement>("#revenue-simulator-form");
const resultsRoot = requireElement<HTMLElement>("#revenue-simulator-results");
const statusRoot = requireElement<HTMLElement>("#revenue-simulator-status");
const exportJsonButton = requireElement<HTMLButtonElement>("#export-simulation-json");
const exportMarkdownButton = requireElement<HTMLButtonElement>("#export-simulation-markdown");

let currentResult: RevenueSimulationResult | null = null;

function availableMechanisms() {
  return deriveAvailableMechanisms(SMART_CHOICE_CATALOG);
}

function parseDecimal(value: FormDataEntryValue | null, field: string, optional = false): number | undefined {
  const text = String(value ?? "").trim().replace(/[\s ]/g, "").replace(",", ".");
  if (optional && text.length === 0) return undefined;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`${field}: введите число.`);
  return number;
}

function toMinor(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor)) throw new Error(`${field}: значение слишком велико.`);
  return minor;
}

function toBps(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const bps = Math.round(value * 100);
  if (!Number.isSafeInteger(bps)) throw new Error(`${field}: значение слишком велико.`);
  return bps;
}

function inputFromForm(): RevenueSimulationInput {
  const data = new FormData(form);
  const locale = String(data.get("locale") ?? "ru-RU") as SimulationLocale;
  const currency = String(data.get("currency") ?? "TRY").toUpperCase();
  const currentRevenue = parseDecimal(data.get("currentRevenue"), "Текущая выручка");
  const monthlyOrders = parseDecimal(data.get("monthlyOrders"), "Количество заказов");
  const averageOrderValue = parseDecimal(data.get("averageOrderValue"), "Средний чек");
  const targetGrowth = parseDecimal(data.get("targetGrowth"), "Целевой рост");
  const repeatRate = parseDecimal(data.get("repeatRate"), "Repeat rate", true);
  const averageCogs = parseDecimal(data.get("averageCogs"), "Себестоимость заказа", true);

  return {
    currency,
    locale,
    currentMonthlyRevenueMinor: toMinor(currentRevenue, "Текущая выручка") ?? 0,
    monthlyOrders: Math.round(monthlyOrders ?? 0),
    averageOrderValueMinor: toMinor(averageOrderValue, "Средний чек") ?? 0,
    targetGrowthBps: toBps(targetGrowth, "Целевой рост") ?? 0,
    ...(repeatRate === undefined ? {} : { repeatRateBps: toBps(repeatRate, "Repeat rate") }),
    ...(averageCogs === undefined ? {} : { averageCogsPerOrderMinor: toMinor(averageCogs, "Себестоимость заказа") }),
    mechanisms: availableMechanisms(),
    guardrails: {
      minGrossMarginBps: 5500,
      maxDiscountBps: 1000
    }
  };
}

function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function money(result: RevenueSimulationResult, minor: number): string {
  return formatSimulationMoney(minor, result.currency, result.locale);
}

function percent(bps: number, locale: SimulationLocale): string {
  return `${(bps / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
}

function metricCard(label: string, value: string, note?: string): HTMLElement {
  const card = element("article", "sim-metric-card");
  card.append(element("p", "sim-metric-label", label));
  card.append(element("strong", "sim-metric-value", value));
  if (note) card.append(element("p", "sim-metric-note", note));
  return card;
}

function renderResult(result: RevenueSimulationResult, focusHeading = true): void {
  clear(resultsRoot);
  currentResult = result;
  exportJsonButton.disabled = false;
  exportMarkdownButton.disabled = false;

  const heading = element("h2", "sim-results-title", "Сценарий роста");
  heading.id = "results-placeholder-title";
  heading.tabIndex = -1;
  resultsRoot.append(heading);
  resultsRoot.append(
    element(
      "p",
      "sim-disclaimer",
      "Это прозрачный план и набор проверяемых гипотез — не прогноз, не обещание роста и не автоматическое изменение цен."
    )
  );

  const metrics = element("div", "sim-metrics");
  metrics.append(
    metricCard("Текущая выручка", money(result, result.input.currentMonthlyRevenueMinor)),
    metricCard("Целевая выручка", money(result, result.requestedTarget.targetRevenueMinor), percent(result.requestedTarget.growthBps, result.locale)),
    metricCard("Денежный разрыв", money(result, result.requestedTarget.gapMinor)),
    metricCard("Дополнительные заказы", result.requestedTarget.additionalOrdersAtCurrentAov.toLocaleString(result.locale), "при текущем среднем чеке"),
    metricCard("Нужный средний чек", money(result, result.requestedTarget.requiredAovAtCurrentOrdersMinor), "при текущем количестве заказов")
  );
  resultsRoot.append(metrics);

  if (result.reconciliation.status === "review-required") {
    resultsRoot.append(
      element(
        "p",
        "sim-warning",
        `Нужно сверить исходные данные: выручка отличается от заказов × среднего чека на ${percent(result.reconciliation.differenceBps, result.locale)}.`
      )
    );
  }
  if (result.revenueOnlyWarning) {
    resultsRoot.append(
      element(
        "p",
        "sim-warning",
        "Себестоимость не указана: доступны только сценарии выручки. Выводы о валовой прибыли и марже заблокированы."
      )
    );
  }

  const scenariosHeading = element("h3", "sim-section-title", "Conservative / expected / stretch");
  resultsRoot.append(scenariosHeading);
  const scenarioGrid = element("div", "sim-scenario-grid");
  for (const scenario of result.scenarios) {
    const card = element("article", `sim-scenario sim-scenario--${scenario.id}`);
    card.append(element("p", "sim-scenario-label", scenario.label));
    card.append(element("strong", "sim-scenario-revenue", money(result, scenario.projectedRevenueMinor)));
    card.append(
      element(
        "p",
        "sim-scenario-range",
        `Диапазон: ${money(result, scenario.uncertaintyLowMinor)} — ${money(result, scenario.uncertaintyHighMinor)}`
      )
    );
    const list = element("ul", "sim-requirements");
    for (const requirement of scenario.requirements) {
      const names: Record<string, string> = {
        conversion: "Conversion / поток заказов",
        aov: "Средний чек",
        repeat: "Повторные заказы"
      };
      list.append(element("li", "", `${names[requirement.lever]}: +${percent(requirement.requiredLiftBps, result.locale)}`));
    }
    card.append(list);
    card.append(element("code", "sim-formula", scenario.formula));
    if (scenario.financials) {
      const financials = element("div", "sim-financials");
      financials.append(
        element("p", "", `Валовая прибыль: ${money(result, scenario.financials.projectedGrossProfitMinor)}`),
        element("p", "", `Прирост валовой прибыли: ${money(result, scenario.financials.incrementalGrossProfitMinor)}`),
        element("p", "", `Валовая маржа: ${percent(scenario.financials.projectedGrossMarginBps, result.locale)}`),
        element("p", `sim-margin-status sim-margin-status--${scenario.financials.marginGuardrail}`, `Margin guardrail: ${scenario.financials.marginGuardrail}`)
      );
      card.append(financials);
    }
    if (scenario.remainingToRequestedTargetMinor > 0) {
      card.append(element("p", "sim-scenario-note", `Остаток до заявленной цели: ${money(result, scenario.remainingToRequestedTargetMinor)}`));
    }
    for (const warning of scenario.warnings) card.append(element("p", "sim-warning", warning));
    scenarioGrid.append(card);
  }
  resultsRoot.append(scenarioGrid);

  resultsRoot.append(element("h3", "sim-section-title", "Гипотезы для будущих экспериментов"));
  const hypothesisList = element("div", "sim-hypotheses");
  for (const hypothesis of result.hypotheses) {
    const card = element("article", "sim-hypothesis");
    card.append(element("h4", "", hypothesis.title));
    card.append(element("p", "sim-hypothesis-status", `Статус: ${hypothesis.status}`));
    card.append(element("p", "", `Метрика: ${hypothesis.primaryMetric}`));
    card.append(element("p", "", `Будущий эксперимент: ${hypothesis.futureExperimentId}`));
    card.append(element("p", "sim-guardrail", hypothesis.guardrail));
    hypothesisList.append(card);
  }
  resultsRoot.append(hypothesisList);

  resultsRoot.append(element("h3", "sim-section-title", "Недостающие данные"));
  const missing = element("ul", "sim-missing-data");
  if (result.missingData.length === 0) missing.append(element("li", "", "Критичных пропусков не найдено."));
  else result.missingData.forEach((entry) => missing.append(element("li", "", entry)));
  resultsRoot.append(missing);

  const seal = element("p", "sim-seal", `Simulation ID: ${result.simulationId} · schema ${result.schemaVersion}`);
  resultsRoot.append(seal);
  statusRoot.textContent = "Сценарий рассчитан. Проверьте исходные данные и guardrails перед любым пилотом.";
  if (focusHeading) heading.focus();
}

function renderError(message: string, focusHeading = true): void {
  clear(resultsRoot);
  currentResult = null;
  exportJsonButton.disabled = true;
  exportMarkdownButton.disabled = true;
  const heading = element("h2", "sim-results-title", "Расчёт остановлен");
  heading.id = "results-placeholder-title";
  heading.tabIndex = -1;
  resultsRoot.append(heading);
  resultsRoot.append(element("p", "sim-error", message));
  resultsRoot.append(element("p", "sim-disclaimer", "Цены, каталог и клиентский Smart Choice не изменены."));
  statusRoot.textContent = `Ошибка проверки данных: ${message}`;
  if (focusHeading) heading.focus();
}

function runSimulation(focusHeading = true): void {
  try {
    const input = inputFromForm();
    const diagnostics = validateRevenueSimulationInput(input);
    const errors = diagnostics.filter((entry) => entry.severity === "error");
    if (errors.length > 0) {
      renderError(errors.map((entry) => `${entry.path}: ${entry.message}`).join(" "), focusHeading);
      return;
    }
    renderResult(simulateRevenueGrowth(input), focusHeading);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Неизвестная ошибка расчёта.", focusHeading);
  }
}

function download(name: string, type: string, content: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSimulation(true);
});

exportJsonButton.addEventListener("click", () => {
  if (!currentResult) return;
  download(`${currentResult.simulationId}.json`, "application/json", exportRevenueSimulationJson(currentResult));
});

exportMarkdownButton.addEventListener("click", () => {
  if (!currentResult) return;
  download(`${currentResult.simulationId}.md`, "text/markdown", exportRevenueSimulationMarkdown(currentResult));
});

declare global {
  interface Window {
    RobysRevenueSimulator?: {
      run: (input: RevenueSimulationInput) => RevenueSimulationResult;
      exportJson: (result: RevenueSimulationResult) => string;
      exportMarkdown: (result: RevenueSimulationResult) => string;
      mechanisms: ReturnType<typeof availableMechanisms>;
    };
  }
}

window.RobysRevenueSimulator = {
  run: simulateRevenueGrowth,
  exportJson: exportRevenueSimulationJson,
  exportMarkdown: exportRevenueSimulationMarkdown,
  mechanisms: availableMechanisms()
};

runSimulation(false);
