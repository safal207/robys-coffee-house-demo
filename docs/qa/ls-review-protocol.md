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

## Post-merge review rule

If a change lands in `main` without PR:

1. Open a post-merge review PR.
2. Document exact commits under review.
3. Request CodeRabbit and Qodo.
4. Run LS checklist manually.
5. Decide whether to keep, fix, or revert.
