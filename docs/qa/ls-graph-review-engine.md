# LS graph review engine

## Core idea

LS is a graph-based QA review method.

It starts with the changed files, then follows the dependency chain until it reaches real user risk.

```text
Changed files
  -> affected product areas
  -> runtime dependencies
  -> regression risks
  -> required checks
  -> graph coverage
  -> verdict
```

This makes LS different from a normal checklist. A checklist asks whether common boxes were ticked. LS asks whether the graph of possible impact was covered.

## Why graph review

A bug rarely lives only in the changed file.

Example:

```text
pairing-posters.js
  -> DOM rendering
  -> MutationObserver
  -> language switching
  -> mobile layout
  -> loading performance
```

A one-file change can affect several user flows. LS must follow that chain.

## Inputs

LS takes four inputs from a PR:

1. changed files;
2. PR summary and boundary;
3. known project graph;
4. reviewer or human constraints.

## Outputs

LS returns:

1. verdict;
2. graph coverage;
3. findings;
4. missing checks;
5. human-only decisions.

## Graph node types

### File nodes

Examples:

- `menu.html`
- `menu-page.js`
- `menu-data.js`
- `menu.css`
- `sw.js`
- `integrity-manifest.json`

### Product area nodes

Examples:

- menu rendering;
- product search;
- language switch;
- price display;
- pairing cards;
- PWA install;
- offline cache.

### Risk nodes

Examples:

- loading freeze;
- render loop;
- stale cache;
- accidental price change;
- horizontal overflow;
- CSP violation;
- broken translation.

### Check nodes

Examples:

- page load check;
- console check;
- mobile viewport check;
- price diff check;
- language switch check;
- service worker cache check.

## Review algorithm

```text
1. Read changed files.
2. Map each file to affected product areas.
3. Expand affected areas into downstream dependencies.
4. Identify possible risks for every edge.
5. Attach required checks to each risk.
6. Mark checks as passed, failed, missing, or human-only.
7. Compute graph coverage.
8. Produce LS verdict.
```

## Coverage states

- `complete` — all material graph branches are checked.
- `partial` — some branches are not checked but risk is low or human accepted.
- `insufficient` — material branches are unchecked.

## Verdict rules

```text
APPROVE
  -> no blocking findings
  -> graph coverage complete or explicitly accepted

COMMENT
  -> no blocking findings
  -> advisory risk or human visual decision remains

REQUEST_CHANGES
  -> blocking finding exists
  -> graph coverage insufficient for material risk
```

## Finding rules

A finding is required when:

- a check fails;
- a material dependency is untested;
- the PR boundary is violated;
- a human decision is needed and not stated.

Finding format:

```text
LS-001 — Render loop risk in pairing poster enhancer
Severity: high
Status: reproduced
Graph path: pairing-posters.js -> MutationObserver -> DOM overlay -> page load
Evidence: page hangs during menu render
Risk: users cannot open menu page
Recommendation: add idempotent render guard and schedule observer callback
```

## Roby's graph seed

```text
menu.html
  -> asset loading
  -> CSS and JS order
  -> CSP
  -> service worker cache
```

```text
menu-page.js
  -> menu-data.js
  -> search
  -> category chips
  -> language switch
  -> rendered menu DOM
```

```text
menu-data.js
  -> product names
  -> prices
  -> descriptions
  -> translations
  -> search index
```

```text
visual CSS
  -> card layout
  -> image crop
  -> mobile overflow
  -> typography
  -> tap targets
```

```text
sw.js / manifest / integrity-manifest.json
  -> offline behavior
  -> asset freshness
  -> install reliability
  -> cache invalidation
```

## LS review template

```text
LS Verdict: APPROVE | COMMENT | REQUEST_CHANGES

Graph coverage: complete | partial | insufficient

Changed-file graph:
- <file> -> <area> -> <risk> -> <check> -> pass/fail/missing

Findings:
- LS-001 — <title> | <severity> | <status>

Human decisions:
- <visual/taste/product decision if needed>

Final decision:
- blocking findings: <count>
- advisory findings: <count>
- merge allowed: yes/no
```

## Important boundary

LS must not pretend to decide taste.

If the question is visual preference, brand feeling, or commercial positioning, LS can only say:

```text
Human decision required
```

The final taste decision belongs to Alexey.
