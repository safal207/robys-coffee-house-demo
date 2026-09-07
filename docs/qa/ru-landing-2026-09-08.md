# Russian landing: bounded UI repair and regression coverage

## Scope and source

The owner requested visual QA and then continuation into repairs for
`ru/coffee-gazipasa.html`. This isolated change is based on PR #346 at
`7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`, not a rewrite of that branch.
The reconstructed source tree equals upstream tree
`2512415b267f502917b76d6bb16c6d2f52360fd7`.

Source artifact 10032377120 was downloaded and independently checked:
SHA-256 `7641c689307168c704aaf7020453e9422c12cc40036db000f22d1d716f86e795`.
The protected inventory contains 243 original files. Exactly 242 retain their
size and SHA-256; only the Russian HTML changes, and one scoped stylesheet is
added. Main, menu, Smart Choice, order, catalogue, native Android and shared CSS
bytes are unchanged. PRs #346/#347 and issue #345 remain separate.

## Implemented repair

- Keep the three navigation links visible and usable without JavaScript at
  every breakpoint. A flow-layout header replaces this page's inherited
  fullscreen mobile drawer contract; no toggle/controller is added.
- Reuse the existing approved responsive SVG logo stylesheet and assets.
- Give small section labels and body links a separate text accent. Measured
  contrast against the existing cream background is 6.098:1; the brand red
  itself is not changed. Body links are always underlined.
- Keep visible keyboard focus, including the skip link, and add deliberate
  spacing around the address, FAQ and footer. Header and links wrap at enlarged
  root text sizes. Reduced motion retains ordinary navigation without smooth
  scrolling.

The build now binds the new stylesheet URL to its SHA-256 prefix. The official
integrity generator updates the protected manifest; no digest is hand-edited.
The original FAQ structured data and all destination URLs are retained.

## Local evidence

Full `npm run check`, `npm run verify:security` (287 contracts and secret scan),
`node scripts/ru-landing-source-contract.mjs` and `git diff --check` pass.

The browser environment rejects HTTP navigation, including localhost, with
`ERR_BLOCKED_BY_ADMINISTRATOR`. The attempted 23-case HTTP report is retained as
infrastructure failure, not a product verdict. No production browser pass is
claimed.

A separate offline renderer loads the exact HTML/CSS from disk, inlines CSS in
its original order, embeds unchanged local image bytes and removes the favicon.
It does not run source scripts. These transformations are explicitly recorded;
this is not a substitute for original-page CSP/network verification.

- All eight scoped checks pass at 10 viewport pairs spanning 320 to 1440 px,
  with JavaScript disabled.
- The same checks pass at 320, 390 and 1440 px with a 32 px root text size.
- No horizontal document/text overflow is measured. Visible navigation, SVG
  identity, section-label contrast and differentiated links are checked.
- Replaying the unchanged source with the same checker rejects all 10 cases.
  Mobile navigation fails through 980 px; logo, contrast and link cues fail at
  every width. These are negative controls, not new historical regressions.
- Final mobile/desktop screenshots were visually inspected. They are review
  evidence, not automatically approved golden baselines.

One early offline assertion searched an SVG filename after URLs had deliberately
been transformed to data URIs. It was corrected to compare the encoded original
SVG bytes. A no-JavaScript settle helper also needed host-side waiting rather
than disabled page animation callbacks. Neither adjustment changes product
bytes or weakens an assertion about visible navigation.

## Permanent original-page browser gate

`Russian landing regression` is a read-only, exact-head PR workflow using the
lockfile's Playwright version. It runs the original files over HTTP without
inlining, CSP bypass or response substitution. Its 23 cases comprise ten
viewports with JavaScript both enabled and disabled, plus three no-JavaScript
32 px root-text cases. It verifies loaded images, actual Tab focus, real FAQ and
address clicks, viewport width, overflow, link contrast and console/network
errors. Reports and screenshots are retained on failure as well as success.

A successful local offline render does not predict the result of this new CI
workflow. Read its exact-head result separately.

## Screenshot-diff and release boundary

The existing screenshot matrix now includes twelve Russian comparisons:
full page, hero and FAQ, each across four viewport configurations. Existing
captures, global thresholds, masks and reviewed-change allowances are unchanged.
The Russian page previously had no approved screenshot baseline. Its intentional
before/after changes must receive explicit visual review; adding coverage is not
permission to accept differences or rebind unrelated historical allowances.

No complete existing visual workflow, new Lighthouse run, physical Android,
production deployment, menu order completion or external Maps delivery is
certified by this repair. Keep the PR draft until current-head checks and visual
review are resolved. No merge, deployment or maintainer approval is inferred.
