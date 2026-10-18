# Occasion selections and quiet choice help — browser evidence

The local built-runtime run passed **45 of 45 scenarios**, with zero uncaught
application errors. `report.json` records the browser version, timestamps,
individual observations and SHA-256 hashes before and after the run. All 36
hashed files remained unchanged during execution.

This is evidence for the recorded working-tree bytes on base revision
`2ac573a2709bcb67a5e7998b96aa5e97b6571cc2`. It is not a claim that this local run
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
byte equality for the new combo UI and choice helper before opening the browser.
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
- Native entry links from the home, discovery, Smart Choice, story and Russian
  local landing views; all routes reach the intended menu selection.
- A helper that waits 35 seconds and eight idle seconds, never steals focus,
  pauses during editing or dialogs, suppresses automatic offers for an existing
  order, remembers dismissal across views and retains explicit manual help.
  Virtual time is frozen before page load to avoid machine-speed timing drift.
- Closed combo and family dialogs do not block later assistance; the same hash
  reopens hidden selections; Smart Choice omits a link back to itself; a short
  viewport receives no automatic popup while explicit help remains usable.

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
security run passed 44 catalog-revision tests, 356 security contract checks and
the secret scan. These local checks do not substitute for final-head CI or
post-publication verification.

The three attached PNGs were visually inspected: a narrow editable dialog, a
takeaway card with the existing branded cup and logo, and the quiet helper.
