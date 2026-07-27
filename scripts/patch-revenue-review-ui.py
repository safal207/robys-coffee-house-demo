from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


html_path = Path("smart-choice/simulator.html")
html = html_path.read_text()
locale_pattern = re.compile(
    r'\s*<label class="sim-field">\s*<span>Формат чисел</span>\s*'
    r'<select name="locale">.*?</select>\s*</label>',
    re.DOTALL,
)
locale_block = '''
          <div class="sim-field">
            <span>Язык интерфейса и чисел</span>
            <strong class="sim-readonly-value">Русский (ru-RU)</strong>
            <input type="hidden" name="locale" value="ru-RU" />
            <small>Этот owner-интерфейс локализован только на русском. Другие форматы доступны через versioned API.</small>
          </div>'''
html, count = locale_pattern.subn(locale_block, html, count=1)
if count != 1:
    raise SystemExit(f"locale selector: expected one match, found {count}")

noscript = '''    <noscript>
      <section class="sim-results sim-noscript" aria-labelledby="simulator-noscript-title">
        <h2 id="simulator-noscript-title">Ручной расчёт без JavaScript</h2>
        <p>Автоматический симулятор требует JavaScript. Базовый сценарий можно проверить вручную:</p>
        <ol>
          <li><code>целевая выручка = текущая выручка × (1 + рост / 100)</code></li>
          <li><code>денежный разрыв = целевая выручка − текущая выручка</code></li>
          <li><code>дополнительные заказы = округление вверх(разрыв / средний чек)</code></li>
          <li><code>нужный средний чек = округление вверх(целевая выручка / текущие заказы)</code></li>
        </ol>
        <p>Не меняйте цены и не публикуйте стратегию без проверки себестоимости, маржи и подтверждения владельца.</p>
      </section>
    </noscript>
'''
html = replace_once(html, "  </main>\n\n  <div id=\"revenue-simulator-status\"", noscript + "  </main>\n\n  <div id=\"revenue-simulator-status\"", "noscript fallback")
html_path.write_text(html)

ui_path = Path("src/smart-choice/revenue-simulator.ts")
ui = ui_path.read_text()
ui = replace_once(ui, "function renderResult(result: RevenueSimulationResult): void {", "function renderResult(result: RevenueSimulationResult, focusHeading = true): void {", "result signature")
ui = replace_once(ui, '  heading.tabIndex = -1;\n  resultsRoot.append(heading);', '  heading.id = "results-placeholder-title";\n  heading.tabIndex = -1;\n  resultsRoot.append(heading);', "result heading")
financials = '''    if (scenario.financials) {
      const financials = element("div", "sim-financials");
      financials.append(
        element("p", "", `Валовая прибыль: ${money(result, scenario.financials.projectedGrossProfitMinor)}`),
        element("p", "", `Прирост валовой прибыли: ${money(result, scenario.financials.incrementalGrossProfitMinor)}`),
        element("p", "", `Валовая маржа: ${percent(scenario.financials.projectedGrossMarginBps, result.locale)}`),
        element("p", `sim-margin-status sim-margin-status--${scenario.financials.marginGuardrail}`, `Margin guardrail: ${scenario.financials.marginGuardrail}`)
      );
      card.append(financials);
    }
'''
ui = replace_once(ui, '    card.append(element("code", "sim-formula", scenario.formula));\n', '    card.append(element("code", "sim-formula", scenario.formula));\n' + financials, "financial renderer")
ui = replace_once(ui, '  heading.focus();\n}\n\nfunction renderError(message: string): void {', '  if (focusHeading) heading.focus();\n}\n\nfunction renderError(message: string, focusHeading = true): void {', "result focus")
error_heading = '  const heading = element("h2", "sim-results-title", "Расчёт остановлен");\n  heading.tabIndex = -1;'
ui = replace_once(ui, error_heading, '  const heading = element("h2", "sim-results-title", "Расчёт остановлен");\n  heading.id = "results-placeholder-title";\n  heading.tabIndex = -1;', "error heading")
ui = replace_once(ui, '  heading.focus();\n}\n\nfunction runSimulation(): void {', '  if (focusHeading) heading.focus();\n}\n\nfunction runSimulation(focusHeading = true): void {', "error focus")
ui = replace_once(ui, '      renderError(errors.map((entry) => `${entry.path}: ${entry.message}`).join(" "));', '      renderError(errors.map((entry) => `${entry.path}: ${entry.message}`).join(" "), focusHeading);', "validation error")
ui = replace_once(ui, '    renderResult(simulateRevenueGrowth(input));', '    renderResult(simulateRevenueGrowth(input), focusHeading);', "result call")
ui = replace_once(ui, '    renderError(error instanceof Error ? error.message : "Неизвестная ошибка расчёта.");', '    renderError(error instanceof Error ? error.message : "Неизвестная ошибка расчёта.", focusHeading);', "catch error")
ui = replace_once(ui, '  runSimulation();\n});', '  runSimulation(true);\n});', "submit call")
if not ui.endswith("runSimulation();\n"):
    raise SystemExit("initial runSimulation call not found")
ui = ui[:-len("runSimulation();\n")] + "runSimulation(false);\n"
ui_path.write_text(ui)

css_path = Path("smart-choice/simulator.css")
css = css_path.read_text()
css += '''

.sim-readonly-value {
  display: flex;
  min-height: 46px;
  align-items: center;
  padding: 10px 12px;
  background: var(--sim-cream);
  border: 1px solid var(--sim-line);
  border-radius: 12px;
  font-size: 0.82rem;
}

.sim-financials {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  padding: 12px;
  background: var(--sim-cream);
  border-radius: 12px;
  font-size: 0.7rem;
}

.sim-financials p { margin: 0; }
.sim-margin-status--breach { color: #7d1117; font-weight: 900; }
.sim-margin-status--pass { color: #245c35; font-weight: 900; }
.sim-noscript { margin-top: 20px; }
.sim-noscript code { overflow-wrap: anywhere; }
'''
css_path.write_text(css)
