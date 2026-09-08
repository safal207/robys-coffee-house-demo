# Early homepage stylesheet application experiment

This isolated candidate starts from passive-observer source
`6592c51a1bd5812e3ae85ed6c83c53effafc7050`. It is outside PR 346 and is not a
verified handoff repair. Its static declarations also change stylesheet timing
on ordinary browser visits to the homepage, not only native Android entry.

## Question and controlled change

The observed source discovers three pending stylesheets after DOMContentLoaded.
The experiment tests whether making those same stylesheets parser-discovered
reduces late stylesheet application and repeated rendering work. Earlier work
is not necessarily less work; compare total launch-to-product time as well as
the interval after native WEB_COMMITTED.

`index.html` adds three actual stylesheet links in the head after the existing
thirteen. The final cascade order remains:

1. The thirteen existing stylesheets, ending with `order-shell.css`.
2. `android-app.css`, using its content-derived query revision.
3. `hero-balance.css`, retaining `data-hero-balance="true"`.
4. `mobile-install.css`.

All three links retain the same URLs, media applicability and CSS bytes used by
their existing owners. They are parsed before deferred scripts execute. The
build now synchronizes the homepage Android CSS query with the same revision
already used by the conversion runtime. No CSS asset, native Java, readiness
criterion, passive recorder, deadline or renderer is changed.

## Ownership and scope

The homepage contains `#visit` and does not statically contain `#android-app`.
The conversion initializer still creates the Android section before `#visit`;
its existing stylesheet check reuses the parser-created link. The QA initializer
reuses the marked hero stylesheet. The PWA initializer reuses the mobile install
stylesheet. Their source code and insertion conditions are unchanged.

The existing thirteen-link cascade is preserved. Moving the hero stylesheet
ahead of the base styles instead would change the hero overlay and section
backgrounds, so this candidate does not do that. Menu and discover documents
remain unchanged.

The HTML hero marker no longer provides incidental evidence that `qa.js` ran:
if that script fails, the stylesheet can still exist. Literal product readiness
checks are unchanged, but this failure-path distinction must be assessed before
promoting the experiment into a production change.

## Local evidence

- `npm run build`: pass.
- `npm run integrity:generate`: pass, 244 public files.
- `node --test scripts/test-early-styles-probe.mjs
  scripts/test-hero-video-init.mjs scripts/test-android-product-frame.mjs`:
  64 tests pass.
- `git diff --check`: pass.
- `npm run check`: pass, including all 60 existing combined native readiness
  and hero-video tests. The four new ownership tests also pass separately.
- `npm run verify:security`: pass, 287 contracts and secret scan.
- Native subtree remains `f2f8179479394f164f82c8d5e5bdb0ad438bdb92`.

The four experiment tests verify static link order and owner revisions, absence
of these declarations in menu/discover, and execute the real emitted conversion,
QA and PWA loaders in one bounded DOM fixture. With all static links present,
the owners preserve link identity and create no duplicate stylesheet. With the
three declarations removed, the same owners restore the same final URLs and
order. Android section creation and QA/PWA initialization are checked in both
cases. This fixture does not perform resource loading, layout, or browser
scheduling and is not a native performance measurement.

## Native comparison still required

Bind native and delivered web bytes separately for the observed baseline and
this candidate. Keep the same passive recorder, native timeouts, assertions,
renderer and capture window. Compare stylesheet discovery/settlement, DCL,
WEB_COMMITTED, readiness continuation, total launch duration, the actual first
uncovered product frame and the full ten-second post-completion rendering
window. Report any changed commit-time budget placement separately from reduced
work. A green readiness marker alone does not establish a smooth handoff.
