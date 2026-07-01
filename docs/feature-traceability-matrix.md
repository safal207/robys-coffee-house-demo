# Roby's feature, state and temporal traceability

`TRACE-001` is the living contract that connects product intent to UI/UX states, browser or external APIs, backend responsibility, implementation evidence, tests and change history.

## Source files

- `qa/feature-traceability-matrix.json` — contract, allowed states, milestones and feature-file registry.
- `qa/traceability/ui-ux.json` — customer-facing journeys and interaction states.
- `qa/traceability/api-platform.json` — external API, browser platform and offline states.
- `qa/traceability/quality.json` — QA execution and traceability-governance states.
- `qa/traceability/backend.json` — explicit backend gaps and future contracts.
- `scripts/verify-feature-traceability.mjs` — fail-closed validation.

Run:

```bash
npm run verify:traceability
```

## Architecture truth today

Roby's is currently a static, client-first web product. The menu, offers and journeys are bundled in the repository. State is held in the browser where needed. Weather, Instagram, Google Maps and browser share capabilities are external dependencies.

There is **no first-party application backend today**. The matrix deliberately records backend responsibilities as `not-built` or `planned` instead of pretending that an external link or `window.dataLayer` is a confirmed backend workflow.

## Current feature map

| Feature | Lifecycle / operation | UI/UX | API | Backend | Next gate |
|---|---|---|---|---|---|
| `FEAT-UI-001` Landing and language | released / available | released | client-only | not-built | Preserve mobile cold-load coverage |
| `FEAT-UI-002` Reveal and sticky CTA | implemented / **degraded** | implemented | client-only | n/a | Add first-scroll temporal test and remove the flash |
| `FEAT-UI-003` Menu catalog/search | released / available | released | client-only | not-built | Define content versioning before live data |
| `FEAT-UI-004` Share/reservation handoff | released / fallback | released | external | not-built | Keep Instagram as explicit manual confirmation |
| `FEAT-UI-005` Taste Journey | released / available | released | client-only | not-built | Version local state before expansion or sync |
| `FEAT-UI-006` Daily offer | released / available | released | client-only | not-built | Add a CMS only when update workflow requires it |
| `FEAT-API-001` Weather context | released / fallback | released | external | not-built | Proxy only if weather becomes business-critical |
| `FEAT-PLATFORM-001` PWA/offline | released / fallback | implemented | client-only | not-built | Verify cache revisions against HTML references |
| `FEAT-PLATFORM-002` Analytics queue | implemented / **degraded** | n/a | client-only | not-built | Define collector acknowledgement or call it best-effort |
| `FEAT-QA-001` UI/UX matrix | released / available | released | n/a | n/a | Add a cold-load temporal scenario for the first-scroll flash |
| `FEAT-QA-002` Traceability governance | implemented / available | verified | verified | verified | Keep the check in regression and bundle gates |
| `FEAT-BE-001` Backend boundary | planned / unavailable | n/a | planned | planned | Create an ADR only for an approved workflow |
| `FEAT-BE-002` Menu/offer API or CMS | planned / unavailable | released static UI | planned | planned | Require parity and static fallback contracts |
| `FEAT-BE-003` Reservation lifecycle | planned / unavailable | released external handoff | planned | planned | Define ownership, capacity and privacy first |

## How to read the matrix

### Lifecycle

Lifecycle answers **how far the feature has progressed**:

`idea → planned → in-progress → implemented → verified → released`

Exceptional end states are `blocked`, `deprecated` and `retired`.

### Operational state

Operational state answers **what the user or system experiences now**:

- `available` — intended behavior is available.
- `fallback` — the feature is useful but depends on a documented fallback.
- `degraded` — the feature exists, but a known defect or missing guarantee remains.
- `unavailable` — the capability is planned or absent.
- `not-applicable` — no runtime state exists for that feature.

Lifecycle and operation are intentionally separate. For example, the reveal feature is implemented, but currently degraded because the first Android scroll can flash once.

### Layer status

Every feature declares all three layers:

- `uiUx` — customer-visible surfaces, accessibility and interaction behavior.
- `api` — browser APIs, external APIs or future first-party contracts.
- `backend` — owned server-side business state, persistence and operations.

Use explicit `not-applicable` or `not-built`; never leave a layer ambiguous.

### State transitions

Transitions use this form:

```text
from-state --event-or-condition--> to-state
```

A state model must have a declared initial state, at least two states and transitions that reference only declared states.

### Time and evidence

Each feature contains ordered history entries:

```json
["2026-07-01", "implemented", "pr:#148"]
```

History records repository/product milestones, not production telemetry. Evidence may point to a file and selector/symbol, a commit, a PR, a build marker, an external dependency or a known defect.

## Known temporal defect: first-scroll flash

`FEAT-UI-002` records the current Roby's issue:

1. `setupReveal()` adds the initial hidden state.
2. `IntersectionObserver` makes the menu content visible only on first intersection.
3. The mobile fixed CTA may create a blurred compositing layer at the same time.
4. The observer then unobserves the content, so repeated scrolling no longer reproduces the defect.

This is why ordinary final-state screenshots are insufficient. The required regression is a **cold-load temporal scenario**: reload, scroll into `.menu-section` for the first time, capture frames around the intersection and assert that the dark section never flashes.

## Pull-request update protocol

For every product change:

1. Name the impacted `FEAT-*` IDs in the PR description.
2. Update requirements when product truth or acceptance criteria change.
3. Update the state model when a new loading, empty, error, fallback, permission, retry or terminal state appears.
4. Update all three layer statuses. An external service is not a Roby's backend.
5. Add a dated history row with the PR, commit, build or defect reference.
6. Link implementation evidence and executable or explicitly planned tests.
7. Record new risks and a concrete next gate.
8. Run `npm run verify:traceability`.

A new first-party API must additionally define method/path, versioning, request and response schemas, error envelope, authentication/authorization, idempotency for writes, rate limits, timeout/retry policy and UI fallback.

A new backend workflow must additionally define ownership, persistence, migrations, audit, observability, degraded/unavailable states, rollback and data-retention/privacy rules.

## Definition of done by layer

### UI/UX

The complete state model is represented visually and semantically; keyboard, touch, localization, reduced motion, loading, empty, error and fallback states are covered where relevant. Temporal defects require temporal tests, not only settled screenshots.

### API

Success, invalid payload, timeout, cancellation, dependency failure and fallback behavior are specified and tested. Client-side queueing is not counted as confirmed delivery without acknowledgement.

### Backend

Business state is owned by a first-party service with explicit contracts, idempotency, auditability, observability, security, privacy and operational recovery. Until then the matrix must say `not-built` or `planned`.

## Immediate priorities

1. Fix and automate `FEAT-UI-002` first-scroll behavior.
2. Require `TRACE-001` updates for product PRs that change feature states or layer ownership.
3. Keep exact-head validation evidence after every matrix change.
4. Keep the backend planned, not prematurely built, until content administration or reservation ownership becomes a real business requirement.
