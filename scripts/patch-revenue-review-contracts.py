from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


domain_path = Path("src/smart-choice/revenue-simulator-domain.ts")
domain = domain_path.read_text()
domain = replace_once(
    domain,
    '''    const requirements = scenario.requirements
      .map((entry) => `${entry.lever} ${percent(entry.requiredLiftBps)}`)
      .join("; ");
    return `| ${scenario.label} | ${percent(scenario.planningGrowthBps)} | ${money(scenario.projectedRevenueMinor)} | ${money(scenario.uncertaintyLowMinor)}–${money(scenario.uncertaintyHighMinor)} | ${requirements} |`;
''',
    '''    const requirements = scenario.requirements
      .map((entry) => `${entry.lever} ${percent(entry.requiredLiftBps)}`)
      .join("; ");
    const financialSummary = scenario.financials
      ? `${money(scenario.financials.projectedGrossProfitMinor)}; Δ ${money(scenario.financials.incrementalGrossProfitMinor)}; ${percent(scenario.financials.projectedGrossMarginBps)}; ${scenario.financials.marginGuardrail}`
      : "Unavailable — COGS missing";
    return `| ${scenario.label} | ${percent(scenario.planningGrowthBps)} | ${money(scenario.projectedRevenueMinor)} | ${money(scenario.uncertaintyLowMinor)}–${money(scenario.uncertaintyHighMinor)} | ${requirements} | ${financialSummary} |`;
''',
    "markdown financials",
)
domain = replace_once(
    domain,
    '''    "| Scenario | Planned growth | Projected revenue | Explicit range | Required lever lifts |",
    "|---|---:|---:|---:|---|",
''',
    '''    "| Scenario | Planned growth | Projected revenue | Explicit range | Required lever lifts | Gross profit / margin |",
    "|---|---:|---:|---:|---|---|",
''',
    "markdown header",
)
domain_path.write_text(domain)

test_path = Path("scripts/test-smart-choice-revenue-simulator.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    '''  assert.ok(withCogs.scenarios.every((scenario) => Number.isInteger(scenario.financials.projectedGrossProfitMinor)));

  const mismatchInput''',
    '''  assert.ok(withCogs.scenarios.every((scenario) => Number.isInteger(scenario.financials.projectedGrossProfitMinor)));
  const cogsMarkdown = exportRevenueSimulationMarkdown(withCogs);
  assert.match(cogsMarkdown, /Gross profit \/ margin/);
  assert.match(cogsMarkdown, /pass|breach/);
  assert.doesNotMatch(cogsMarkdown, /Unavailable — COGS missing/);

  const mismatchInput''',
    "financial markdown tests",
)
test_path.write_text(test)

verify_path = Path("scripts/verify-smart-choice-revenue-simulator.mjs")
verify = verify_path.read_text()
verify = replace_once(
    verify,
    'assert.match(html, /Owner approval required/, "owner-approval boundary is missing");\n',
    'assert.match(html, /Owner approval required/, "owner-approval boundary is missing");\nassert.match(html, /name="locale" value="ru-RU"/, "owner UI must use its declared Russian locale");\nassert.ok(!html.includes(\'option value="tr-TR"\') && !html.includes(\'option value="en-US"\'), "untranslated locale options must not be exposed");\nassert.match(html, /<noscript>[\\s\\S]*целевая выручка = текущая выручка/, "manual no-JavaScript formula fallback is required");\n',
    "HTML contracts",
)
verify = replace_once(
    verify,
    'assert.ok(!source.includes("Math.random"), "simulator must remain deterministic");\n',
    'assert.ok(!source.includes("Math.random"), "simulator must remain deterministic");\nassert.ok(source.includes(\'heading.id = "results-placeholder-title"\'), "results region label must remain valid after rendering");\nassert.ok(source.includes("runSimulation(false)"), "initial calculation must not steal focus");\nassert.ok(source.includes("scenario.financials"), "computed gross-profit and margin fields must be rendered");\n',
    "source contracts",
)
verify = replace_once(
    verify,
    'assert.ok(domain.includes("revenue × conversion"), "explicit revenue formula is missing");\n',
    'assert.ok(domain.includes("revenue × conversion"), "explicit revenue formula is missing");\nassert.ok(domain.includes("Gross profit / margin"), "human-readable financial export is missing");\n',
    "domain contract",
)
verify_path.write_text(verify)

docs_path = Path("docs/smart-choice/revenue-simulator-contract.md")
docs = docs_path.read_text()
docs = replace_once(
    docs,
    "The public Smart Choice flow does not link to this page. The owner tool is `noindex`, stores no personal data and sends no network requests. Direct navigation grants access only to the local planning interface; it does not authorize catalog, price or experiment changes.\n",
    "The public Smart Choice flow does not link to this page. The owner tool is `noindex`, stores no personal data and sends no network requests. Direct navigation grants access only to the local planning interface; it does not authorize catalog, price or experiment changes. The browser owner UI is deliberately Russian-only in v0.1; the versioned domain/export API may still format supported locales when called programmatically.\n",
    "documentation locale boundary",
)
docs_path.write_text(docs)
