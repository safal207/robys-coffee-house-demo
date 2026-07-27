from pathlib import Path

path = Path("scripts/patch-revenue-review-ui.py")
text = path.read_text()
old = '''ui = replace_once(ui, '  heading.tabIndex = -1;\\n  resultsRoot.append(heading);', '  heading.id = "results-placeholder-title";\\n  heading.tabIndex = -1;\\n  resultsRoot.append(heading);', "result heading")'''
new = '''ui = replace_once(ui, '  const heading = element("h2", "sim-results-title", "Сценарий роста");\\n  heading.tabIndex = -1;\\n  resultsRoot.append(heading);', '  const heading = element("h2", "sim-results-title", "Сценарий роста");\\n  heading.id = "results-placeholder-title";\\n  heading.tabIndex = -1;\\n  resultsRoot.append(heading);', "result heading")'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one broad heading matcher, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
