# Robis Causal Deep Audit v0.1

**Audit ID:** `ROBIS-CAUSAL-DEEP-AUDIT-2026-07-22-V0.1`  
**Main identity:** `2fcc1de1a44093da399968f9474b30e6213bd793`  
**PR 239 identity:** `5af1042be08bf2b2a492b2ce160402b4d758c59d`  
**Mode:** evidence-only, advisory-only  
**Verdict:** `HOLD` / `ESCALATE`

## Executive decision

Robis has a strong technical QA surface, but the current product and evidence chains are not yet aligned.

The current `main` contains reproducible mobile hierarchy, touch-target and localization risk candidates. PR #239 attempts the correct bounded repair: restore the Route/Instagram dock during the featured gallery, enforce 44 px targets and reflow the narrow Discover header. The implementation direction is reasonable, but the current PR is not acceptance-ready.

The load-bearing reasons are:

1. PR #239's body and acceptance narrative identify `b86e12aab696f8c609e149789fd21266cce8cd94` as the final head, but GitHub reports `5af1042be08bf2b2a492b2ce160402b4d758c59d`, and the declared `b86e12...` commit cannot be fetched.
2. Visual Regression fails at the reviewed-change validation step.
3. The Taste Journey poster workflow fails its stale-generated-files check.
4. Current non-outdated actionable review threads remain unresolved.
5. The repository can observe digital intent, but it cannot yet prove a physical visit, POS purchase, AOV/LTV change or revenue effect.

The correct transition is not merge, redesign or launch. It is to repair and replay the evidence chain on one immutable head.

## Scope and authority

### Included

- current `main` repository state;
- Home → featured products → Menu/Discover → Maps/Instagram journey represented by repository evidence;
- PR #239 mobile conversion/touch-target candidate;
- CI, review, source, documentation, analytics and product-impact evidence;
- TR/EN/RU and declared phone/tablet/desktop profiles.

### Excluded

- authenticated behavior;
- form submission and external contact;
- active security or load testing;
- owner interviews;
- production analytics backend, cafe-side visit records and POS data;
- deployment, publication, approval or merge authority.

## Finding scorecard

| ID | Finding | State | Severity | Confidence | Decision |
| --- | --- | --- | --- | ---: | --- |
| ROBIS-001 | PR #239 exact-head narrative names a non-existent SHA | Confirmed defect | High | 100% | HOLD |
| ROBIS-002 | Current PR #239 head has failed required checks and unresolved threads | Confirmed defect | High | 100% | HOLD |
| ROBIS-003 | Mobile gallery suppresses/delays high-intent visit actions on `main` | Defect candidate | High | 92% | Repair candidate exists |
| ROBIS-004 | Repeated mobile controls are below intended target-size floor | Defect candidate | High | 95% | Repair candidate exists |
| ROBIS-005 | Promotional poster copy does not fully follow selected locale | Defect candidate | Medium | 90% | Human brand adjudication |
| ROBIS-006 | Public address/hours claims lack explicit owner-approval lineage | Product signal / causal gap | High | 88% | Obtain owner source of truth |
| ROBIS-007 | Browser analytics cannot prove visit, purchase or revenue | Confirmed measurement gap | High | 98% | Measurement design required |
| ROBIS-008 | README contradicts the current build/runtime architecture | Confirmed documentation defect | Medium | 100% | Rewrite from current toolchain |
| ROBIS-009 | Open stacked/superseded PRs obscure the active source of truth | Product/operations signal | Medium | 90% | Repository triage |

## Detailed findings

### ROBIS-001 — invalid exact-head evidence identity

PR #239 declares a final SHA that is not the actual GitHub head and cannot be resolved as a repository commit.

```text
PR body / acceptance narrative
  -> b86e12aab696f8c609e149789fd21266cce8cd94

GitHub PR head
  -> 5af1042be08bf2b2a492b2ce160402b4d758c59d

commit lookup for b86e12...
  -> no commit found
```

This is a confirmed evidence-governance defect. It does **not** prove the CSS implementation is wrong. It proves that the reported acceptance state is not bound to the current code.

**Required discrimination:** regenerate the body, acceptance record and D6 seal directly from the current fetchable head. Any evidence document naming a missing commit must fail closed.

### ROBIS-002 — current PR #239 remains HOLD

On the actual current head:

- `Gallery mobile gate` is green;
- Lighthouse, iOS WebKit, adversarial browser, generated runtime and security checks are green;
- `Visual regression` is red at `Validate reviewed visual change`;
- `Taste Journey poster contract` is red at `Reject stale generated files`;
- current actionable review threads remain unresolved.

The visual exception file binds approval to a CSS blob that does not match the current file. The verifier explicitly requires `git hash-object` equality before accepting reviewed visual differences. Therefore the current reviewed exception cannot authorize the changed screenshots.

This is a healthy fail-closed result. The mistake would be treating the many green checks as an aggregate approval.

### ROBIS-003 — mobile conversion hierarchy

Issue #238 establishes that the six-card mobile favorites stack occupies several screens while the persistent Route/Instagram dock is hidden in the gallery-active state.

```text
mobile visitor enters favorites
  -> gallery becomes active
  -> persistent route action is hidden
  -> six posters extend the journey
  -> high-intent visit action becomes delayed
```

PR #239's final CSS attempts to restore the dock with a more specific late-loaded rule. This is the right implementation direction, but product acceptance remains blocked by ROBIS-001 and ROBIS-002.

No claim is made that the current state caused measured lost visits or revenue.

### ROBIS-004 — touch-target safety

The retained exact-head evidence reports repeated undersized controls across Home, Menu and Discover, including language controls, Maps/share actions and Discover pairing actions.

PR #239 raises the named selectors to 44 px and adds narrow-header reflow. The change should be accepted only when the expanded UI/UX matrix runs after the reviewed visual binding succeeds and proves:

- actual clickable bounding boxes are at least 44 × 44 CSS px;
- no horizontal overflow at 320/360/390/412;
- focus rings remain visible;
- the Route action stays clickable and keyboard focusable through gallery states.

### ROBIS-005 — locale and poster semantics

The surrounding interface changes between Turkish, English and Russian, while promotional wording remains embedded in image pixels.

This creates two separate questions:

1. Is English visual copy an intentional brand decision?
2. Does accessible and semantic content still expose the localized product name, badge and price?

Until the owner/brand decision is explicit, this remains a medium-severity defect candidate rather than an automatic error.

### ROBIS-006 — public business data authority gap

README says opening hours, exact street address, menu names, official phone/WhatsApp, original photos and publishing permissions must still be confirmed. The public page source already emits structured business claims including:

- `Pazarcı, Uğur Mumcu Cd.`;
- daily `09:00`–`00:00`;
- public Maps and Instagram destinations;
- public hero media and LocalBusiness schema.

The likely explanations are:

- the data was approved outside the repository and README is stale; or
- the public claims were promoted before a durable owner-approval record existed.

The repository cannot distinguish these explanations. Add a dated owner-approved business-data record and generate JSON-LD, visible copy, Maps destination and tests from it.

### ROBIS-007 — value remains unproven

`analytics.js` records route, Instagram, pairing, language and section-view events in an in-memory buffer and `window.dataLayer`. Repository evidence does not show a collector that joins these events to a real cafe visit or POS transaction.

```text
route_click
  -> digital intent observed
  -/-> physical arrival proven
  -/-> purchase proven
  -/-> AOV/LTV/repeat change proven
```

PR #217 reached the same bounded verdict: `PRODUCT_PATH_REVIEWED_WITH_GAPS` and `VALUE_UNPROVEN`.

A future measurement bridge should be privacy-safe, owner-approved and explicit about attribution versus incrementality. A click is not a sale.

### ROBIS-008 — documentation drift

README says:

- no build step;
- no external JavaScript dependencies;
- deploy with an empty build command.

Current `package.json` defines a Node build, TypeScript, esbuild and a large validation pipeline. `index.html` loads bootstrap, application, gallery, conversion, analytics, QA and PWA scripts.

This raises onboarding and operational risk: a maintainer following README may deploy an unbuilt or incorrectly verified tree.

Rewrite the setup and deploy documentation from a clean-clone test, and clearly separate:

- source development;
- generated public runtime;
- local preview;
- GitHub Pages deployment;
- required verification commands.

### ROBIS-009 — branch and PR entropy

The open inventory contains at least 21 PRs, including:

- active product fixes;
- stacked governance experiments;
- superseded mobile repair paths;
- compiler experiments;
- measurement concepts;
- older product/design branches based on different ancestors.

This is useful research history, but GitHub's open state currently implies that multiple incompatible paths remain actionable.

Recommended labels/states:

- `active-chain`;
- `blocked`;
- `superseded`;
- `research-archive`;
- `close-now`.

Keep one active implementation chain for each product objective.

## Causal map

```text
unconfirmed business-data authority
  -> public address/hours claims
  -> possible trust or navigation risk

mobile six-poster stack
  + gallery-active dock suppression
  -> delayed Route/Instagram access
  -> possible visit-intent friction

PR #239 CSS repair
  -> attempts to restore action reachability
  -> creates intended visual changes
  -> reviewed-change binding becomes load-bearing

stale/mismatched binding
  + failed generated-artifact gate
  + unresolved exact-head threads
  + invalid SHA narrative
  -> evidence chain invalid
  -> PR status HOLD

local browser event buffer
  -> route/menu intent observable
  -> no joined visit/POS result
  -> value remains unknown
```

## Competing explanations

The audit preserves these alternatives:

- the UX patch may be functionally correct despite evidence-maintenance failures;
- owner approval may exist outside GitHub;
- English poster copy may be intentional branding;
- an external deployment layer may inject analytics not represented in this repository;
- the large open PR set may intentionally serve as a research archive.

Each alternative has a concrete next test; none is silently converted into fact.

## Prioritized transition

### P0 — restore one exact evidence identity

1. Set PR #239 body to the actual current head.
2. Remove or supersede every acceptance record tied to a missing SHA.
3. Bind reviewed visual changes to the current CSS blob.
4. Regenerate all required generated artifacts.
5. Resolve current non-outdated review threads with evidence from the same head.
6. Run the full required matrix without moving the head.

**Completion signal:** one fetchable 40-character SHA appears consistently in PR metadata, artifacts, reviews and all required successful workflows.

### P1 — confirm the mobile repair

After P0:

- 320/360/390/412 route-action visibility and clickability;
- 44 × 44 actual hit areas;
- narrow Discover header without overflow;
- visible keyboard focus;
- returning/offline user cache revision;
- TR/EN/RU semantic and visual coverage.

### P1 — establish owner-approved business data

Create a small canonical record containing owner-approved:

- name and logo permission;
- exact address and Maps destination;
- opening hours;
- official Instagram/phone/WhatsApp;
- media permissions;
- approval date and responsible person.

Generate public claims from this record instead of duplicating literals.

### P2 — measure value honestly

Start with a bounded funnel:

```text
landing/session
-> menu or pairing view
-> route intent
-> cafe-side token or POS match
-> purchase / no purchase
-> repeat visit window
```

Report attribution first. Do not call it incrementality without a valid control or counterfactual design.

### P2 — reduce repository entropy

Triage the open PR inventory and preserve research history with labels or archived documents rather than leaving superseded branches in an apparently actionable state.

## Final boundary

This report supports a **HOLD** decision for PR #239 and identifies high-value repair and measurement work. It grants no authority to merge, deploy, contact the cafe, publish claims, change business data or report financial impact.

Machine-readable packet: [`audits/robis/causal-deep-audit-v0.1/audit-packet.json`](../../audits/robis/causal-deep-audit-v0.1/audit-packet.json)
