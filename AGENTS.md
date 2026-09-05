# Roby's Coffee House agent guide

## Project shape

This repository is a mobile-first multilingual static site for Roby's Coffee House.
User-facing copy and behavior must continue to work in Turkish, English, and Russian.
Preserve accessibility, reduced-motion support, responsive layouts, and the current
Content Security Policy assumptions.

## Source of truth

Work source-first. Do not hand-edit generated runtime files without updating their
source and rebuilding them.

- `src/app.ts` generates `app.js`.
- `src/menu-app.js` generates `menu-app.js`; source contracts also verify emitted-byte equality.
- `src/conversion.js` generates `conversion.js`; its Android stylesheet revision is injected during build.
- `src/featured-gallery.ts` generates `featured-gallery.js`.
- `src/social-offer.ts` generates `social-offer.js`.
- `src/discover-rotation.ts` generates `discover-rotation.js`.
- `scripts/build.mjs` also refreshes cache-busting revisions in `index.html` and
  `discover.html`.
- `integrity-manifest.json` is evidence, not decoration. Regenerate it whenever
  protected bytes change.

## Setup

```bash
npm ci --no-audit --no-fund
```

For Codex cloud, use:

```bash
bash scripts/codex-setup.sh
```

No repository secrets are required for the normal build and verification path.
Keep agent internet access disabled unless a task explicitly requires external
network access.

## Required validation

Before opening or updating a pull request, run:

```bash
npm run check
npm run verify:security
```

If verification reports a stale integrity manifest, rebuild first and then run:

```bash
npm run integrity:generate
npm run check
```

For a narrowly scoped change, run the relevant focused contract early, but still
run the complete commands above before merge.

## Change rules

- Keep changes focused and avoid unrelated formatting churn.
- Do not weaken CSP, integrity checks, security scans, or workflow permissions to
  make a check pass.
- Do not replace local reviewed assets with untrusted remote assets.
- Preserve progressive enhancement and useful no-JavaScript fallbacks.
- Treat visual changes as behavior changes: attach reproducible screenshot evidence.
- Never merge a red or still-running required check.
- After the latest commit, add separate top-level PR comments:
  `@codex review` and `@jules review`, subject to the scoped owner instruction below.
- Resolve actionable review findings or document why they are not applicable.

## PR #338: owner opted out of Codex review

On 5 September 2026 the owner instructed: "Го без ревью кодекс".
This scoped instruction is recorded in PR #338, comment 5549467834.

For PR #338 only, do not request or re-request Codex review, and do not wait for
Codex quota or approval. This exception applies to subsequent commits in the PR,
not just the head that existed when the instruction was given.

This is not a Codex approval, an independent review, or a waiver of findings.
The current provider-neutral route already treats AI reviewers as advisory and
retains the human maintainer as the binding approval authority. Keep existing
non-Codex evidence; do not invent approvals from unavailable or skipped reviewers.
Required CI, visual-change verification, security, integrity, performance budgets,
current-head maintainer authorization and post-deployment checks remain required.
Do not change repository-wide protection settings or paid-provider limits.

## Pull request evidence

A strong PR description states:

1. what changed and why;
2. what can regress;
3. which commands were run;
4. which screenshots, logs, or artifacts prove the result;
5. whether generated files and the integrity manifest changed.
