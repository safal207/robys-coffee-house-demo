# LS review protocol

## Purpose

LS is the deterministic QA reviewer for Roby's Coffee House changes. It does not replace CodeRabbit, Qodo, or human taste review. It checks whether a change is safe enough to ship.

## Required PR flow

Every non-emergency change must follow this path:

```text
branch -> PR -> CodeRabbit -> Qodo -> LS -> Human approval -> merge
```

Direct commits to `main` are not allowed except for documented emergency recovery. Any emergency direct commit must be followed by a post-merge review PR.

## LS verdicts

- `APPROVE` — no blocking QA risk found.
- `REQUEST_CHANGES` — at least one blocking finding exists.
- `COMMENT` — no blocker, but there are advisory risks or human visual decisions.

## Finding format

```text
LS-001 — <title>
Severity: low | medium | high | critical
Status: reproduced | not reproduced | requires human decision
Evidence: <file, test, screenshot, or manual step>
Risk: <what can break>
Recommendation: <smallest safe fix>
```

## Dependency graph rule

LS must review every PR as a dependency graph, not as a flat file checklist.

For every changed file, LS identifies:

1. direct artifact changed;
2. runtime or product area affected;
3. downstream dependencies;
4. regression risks;
5. required checks;
6. LS finding IDs if risk is non-zero.

Graph template:

```text
Changed files -> Affected areas -> Downstream dependencies -> Risks -> Required checks -> Verdict
```

Example:

```text
pairing-posters.js
  -> menu rendering
  -> MutationObserver / language switch / DOM overlay
  -> risk: render loop or stale translated overlay
  -> checks: page load, language switch, console, DOM churn
  -> LS-001 if reproduced
```

```text
menu.html
  -> asset loading
  -> CSS/JS load order, CSP, service worker cache
  -> risk: missing asset, blocked script, stale cache
  -> checks: page load, network, console, cache impact
  -> LS-002 if reproduced
```

```text
menu-data.js
  -> menu content
  -> prices, translations, category navigation, search
  -> risk: accidental price/product/copy change
  -> checks: price diff, search, language switch
  -> LS-003 if reproduced
```

## Roby's core graph

```text
menu.html
  -> menu-bootstrap.js
  -> menu-page.js
  -> menu-data.js
  -> menu.css
  -> menu-stability.css
  -> menu-security.css
  -> menu-actions.js
  -> service worker / PWA cache
```

```text
menu-page.js
  -> menu-data.js
  -> category chips
  -> search
  -> language switch
  -> rendered menu DOM
```

```text
visual CSS files
  -> layout
  -> mobile viewport
  -> card crop
  -> readability
  -> scroll behavior
```

```text
service worker / manifest / integrity files
  -> offline behavior
  -> asset freshness
  -> install experience
  -> cache invalidation
```

## Graph coverage report

Each LS review should include a short graph coverage section:

```text
LS Graph Coverage:
- menu.html -> asset loading -> checked
- pairing-posters.js -> render loop risk -> checked
- pairing-posters.css -> mobile layout risk -> checked
- menu-data.js -> not changed

Coverage verdict: complete | partial | insufficient
```

If graph coverage is `partial` or `insufficient`, LS cannot approve unless the missing area is explicitly accepted by the human reviewer.

## Mandatory checks

### Runtime safety

- Page must load without hanging.
- No infinite render loop, observer loop, or repeated DOM churn.
- No console errors that block user flow.
- No CSP or Trusted Types violations.

### Menu integrity

- No unintended changes to `menu-data.js`.
- No unintended price changes.
- No unintended category, translation, or product copy changes.
- Any price or product copy change must be called out explicitly in the PR body.

### Mobile UX

- `menu.html#pairing-offers` must remain usable on narrow screens.
- Sticky header and menu controls must not cover content unexpectedly.
- Cards must not overflow horizontally.
- Search and language switch must remain usable.

### PWA / offline safety

- New runtime assets should be considered for service worker cache if they are critical to the experience.
- Cache version changes must be intentional.
- Integrity manifest changes must be generated, not hand-edited.

### Scope control

- PR must stay inside its stated boundary.
- Visual changes should not silently include analytics, pricing, checkout, navigation, or menu data changes.
- Large visual changes need manual QA steps.

## Standard LS checklist for visual PRs

```text
[ ] Page loads without freeze
[ ] No CSP / Trusted Types violation
[ ] No unintended menu-data changes
[ ] Prices unchanged unless explicitly approved
[ ] Mobile layout checked
[ ] Language switch checked
[ ] Search checked
[ ] Offline/PWA impact considered
[ ] Rollback path described
[ ] Human visual decision requested when taste is subjective
```

## LS comment template

```text
LS Verdict: APPROVE | COMMENT | REQUEST_CHANGES

LS Graph Coverage:
- <changed file> -> <affected area> -> <required check> -> pass/fail

Findings:
- LS-001 — <title> | severity | status

Decision:
- blocking findings: <count>
- advisory findings: <count>
- human decisions required: <count>
```

## Post-merge review rule

If a change lands in `main` without PR:

1. Open a post-merge review PR.
2. Document exact commits under review.
3. Request CodeRabbit and Qodo.
4. Run LS checklist manually.
5. Decide whether to keep, fix, or revert.
