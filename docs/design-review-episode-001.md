# DESIGN-REVIEW-EPISODE-001 — Roby's Logo Blind Review

Issue: `#162`

## Purpose

This episode tests whether the existing Review Route Memory system can govern a visual product decision without collapsing into unsupported “looks good” opinions.

It does **not** authorize a production logo replacement.

## Phase 0 result

The initial manifest is intentionally valid but blocked:

```text
current source identity pinned
  -> exact source hash verified
  -> blind labels declared
  -> candidates and equal-context mockups missing
  -> ARTIFACTS_REQUIRED
  -> INCONCLUSIVE
```

This is the expected fail-closed result. The episode must not become review-ready until all candidate packages and sealed digests exist.

## Current source baseline

- source: `icon.svg`
- repository Git blob: `40b1c1fed7d2d153cf0e8dcebde8c3a61850d7e9`
- SHA-256: `fe3b147e8ba2668769b61acd33eed5f0bf04190d25026aa8500faa9031527462`
- bytes: `761`
- baseline ref: `main@79e8211e003275e64385a222cf06d76ab379044b`

The header wordmark composition in `index.html` remains part of the later context package but is not yet frozen as an anonymized candidate export.

## Blindness rule

The source roles are not statically assigned to visible candidate labels. After the three source artifacts are frozen, a fresh permutation maps them to:

- `candidate-amber`
- `candidate-cobalt`
- `candidate-ivory`

The mapping remains outside the reviewer-visible package. A SHA-256 digest of the sealed mapping is recorded before reviews. The mapping is revealed only after all independent findings are frozen.

The initial illustrative A/B/C assignment in issue creation is void and must not be used.

## Readiness gate

`reviewReady` may become `true` only when:

1. exactly three anonymized candidate packages exist;
2. each candidate has all twelve required contexts;
3. source and export hashes are recorded;
4. the randomized source-role mapping digest is sealed;
5. the controlled-defect key digest is sealed;
6. the controlled defect remains unrevealed;
7. the current decision remains `INCONCLUSIVE`.

## Required contexts

- master mark;
- desktop and mobile header;
- favicon at 16×16 and 32×32;
- social avatar;
- coffee cup;
- storefront signage;
- menu;
- light and dark backgrounds;
- monochrome print.

All candidates must use identical templates, crop rules, scale, and export settings.

## Review route

Because this episode adds a QA governance contract, the existing `RRM-DEPTH-001` policy should classify it at least as `L3`. The existing `RRM-ROUTE-001` selector remains the only route authority.

Expected route when providers are available:

```text
route-l3-standard
  -> system trace / mutation checks
  -> CodeRabbit risk critic
  -> Codex evidence verifier
  -> human-maintainer proof seal
```

Provider absence must produce `ESCALATE` or an audited exact-head substitution. It must never be interpreted as approval.

## Scoring evidence

A numeric score is binding only when accompanied by:

- exact candidate label and hashes;
- inspected context;
- criterion;
- concrete visual observation;
- severity and confidence;
- recommendation;
- reviewer identity;
- reviewed exact head SHA.

Generic adjectives without an observable claim are advisory only.

## Phase 1

A later commit will attach the frozen candidate packages, identical-context mockups, mapping digest, and controlled-defect digest. Only then may independent design reviews begin.
