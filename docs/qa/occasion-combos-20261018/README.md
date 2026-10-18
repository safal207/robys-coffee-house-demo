# Occasion selections and quiet choice help — browser evidence

The local built-runtime runs passed **46 of 46 scenarios in Chromium and 46 of
46 in WebKit**, with zero uncaught application errors. `report.json` and
`webkit-report.json` record browser versions, timestamps, individual observations
and SHA-256 hashes before and after each run. Both engines tested the same 41
hashed files; those files remained unchanged during execution.

This is evidence for the recorded working-tree bytes on base revision
`c16d7620a66d00c09abe2146612b308dc99283e0`. It is not a claim that these local runs
tested a later commit, a deployed site, physical phones or another browser engine.
The CI workflow runs the same script for each configured browser engine.

Run from the repository root after building:

```sh
node scripts/test-menu-combos-browser.mjs
# Optional additional installed browser engines:
ROBYS_COMBO_BROWSERS=chromium,firefox,webkit node scripts/test-menu-combos-browser.mjs
```

The script serves emitted HTML, JavaScript, CSS and images unchanged over local
HTTPS with the production Content Security Policy. It verifies source/generated
byte equality for the new combo UI, lazy entry driver and choice helper before
opening the browser.
The hashes include both the home and menu runtimes and their sources; their
entry drivers are bundled into the existing applications, while the other views
load the standalone entry driver. These runs cover the current bundled bytes and
the compact mobile menu hero; the emitted menu CSS is included in the hashes.
Cart mutations use the real UI handlers; persistence is checked through an
independent read-only IndexedDB reader. No production quote or cart-mutation
helper is used to manufacture the expected results.

The covered flows are:

- All 12 card prices against the current catalog, exact recipe quantities and
  decoded photography, in Turkish, English and Russian.
- Quantity editing, removal, adding another catalog product, invalid quantities
  and recovery using the plus control, an empty selection, independently
  editable cart components, and cancellation.
- Two lattes with exactly one shared dessert; the family selection with two of
  each intended component. Adding opens the editable cart before QR checkout.
- Concurrent additions from two tabs, a repeated busy activation, a cold tab
  reopening the combined order, and delayed module loading after a newer cart,
  category, search or hash navigation.
- Layout and dialog keyboard containment at 320×700, 390×844, 768×1024,
  1440×1000 and 844×390, in all three languages. The takeaway route shows four
  cards; the remaining filters retain their intended counts.
- On the initial menu at 320 and 390 pixels, all three hero shortcuts retain touch
  targets of at least 44×44 pixels, and the first menu category starts above 600 pixels.
  The compact shortcut row fixes the extra vertical space introduced by three
  independently spaced links. Full card titles and contents retain their wording.
- Native entry links from the home, discovery, Smart Choice, story and Russian
  local landing views; all routes reach the intended menu selection.
- A helper that waits 35 seconds and eight idle seconds, never steals focus,
  pauses during editing or dialogs, suppresses automatic offers for an existing
  order, remembers dismissal across views and retains explicit manual help.
  Virtual time is frozen before page load to avoid machine-speed timing drift.
- Projection, order-change and focus notifications load no authoritative order
  storage during the first 34 seconds. After a real peer-tab order commit, an
  eligible helper reads the canonical basket and suppresses its offer even when
  disposable local/session projections have been removed. The UI and store stay
  lazy before the offer threshold; the catalog does not pay that loading cost.
- Closed combo and family dialogs do not block later assistance; the same hash
  reopens hidden selections; Smart Choice omits a link back to itself; a short
  viewport receives no automatic popup while explicit help remains usable.

The WebKit focus/idle test was isolated from native scrolling. A control trace
showed footer-button focus at 40.243 seconds followed by a native scroll at 47.243;
the latter correctly restarted the application's eight-second idle window.
The focus-only scenario now uses `focus({preventScroll:true})`, allowing it to
measure editing and idle behavior without a later scroll resetting the clock.
No production behavior was changed for that harness correction.

Service workers are blocked in this suite. The separate `offline-report.json`
records **four passing checks** from:

```sh
node scripts/test-combo-offline.mjs
```

That check uses the actual Chromium service worker, audits exact CacheStorage
revision identities and all twelve photo bytes before first reveal, and then
closes server connections during the offline phase. All twelve photos decode on
the first offline reveal in each of the three languages. Missing-photo, stale
revision-rule and cache-namespace drift controls demonstrate that the checks
detect the corresponding failures. Its start/end hashes also remain unchanged.

The coordinating agent also completed `npm run check` and
`npm run verify:security` with exit code zero for these production bytes. The
security run passed 44 catalog-revision tests, 353 security contract checks and
the secret scan. The existing thin-family browser case also passed in Chromium,
confirming that the new helper preserves its established lazy-storage boundary.
An earlier bundling measurement from the coordinating agent's local desktop
headless-shell Lighthouse run returned a performance score of 1.0 on both checked
pages. Median JavaScript transfer was 22,969.5 bytes, a 3.7513% increase within the
existing 5% limit. That measurement predates the compact hero change and is not
performance evidence for the current byte hashes. Final-head CI must verify the
unchanged performance budgets across its configured profiles. Local checks do
not substitute for final-head CI or post-publication verification.

The four attached PNGs were visually inspected: the compact 320 pixel menu hero,
a narrow editable dialog, a takeaway card with the existing branded cup and logo,
and the quiet helper.
