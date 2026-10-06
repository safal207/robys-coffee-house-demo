# Pairing release follow-up — 6 October 2026

The follow-up to PR #427 keeps the reviewed mobile layout and fixes the actionable
Codex MediaQueryList finding. Modern listeners are preferred; legacy `addListener`
keeps responsive placement working, and absence of both listener APIs no longer
aborts menu enhancement.

The real-browser test covers both pairings in three API modes, widths
390 → 1440 → 390, focus preservation, selected-pair association, button geometry,
taste-note separation and close/ARIA state. It is also called by the adversarial
browser CI job. The local six-case run passed.

Only `source-map-js` changes in the dependency lock: 1.2.1 → 1.2.2. Playwright,
Chromium, pixelmatch and pngjs pins remain unchanged. Local npm audit reports zero
vulnerabilities; the 26 toolchain negative controls pass. A changed lock still
requires two complete passing visual capture sets under the unchanged verifier.

The historical contextual-entry CI failure (run 37444924408, job 112207334141)
reported 7/23 progressing frames against the minimum of 15. Its artifact omitted
the failed raw probe, so attribution remains unestablished. Three local runs
passed without changing the animation or its thresholds. The final local run
reported day 22/23 and night 21/23, with median frame spacing of 16.7 ms. The
contextual test now saves raw timestamps/transforms before its assertions, so
future failures retain diagnostic evidence.

`npm run check`, `npm run verify:security` (353 contracts plus secret scan), npm
audit, and syntax checks passed on the modified local bytes. The accompanying
JSON binds the local results to file content. Local evidence does not replace
fresh CI on the published commit or constitute independent human approval.

The full adversarial browser suite passed 44/44, including all six new API cases.
The old JavaScript reproduced the exact legacy-API exception and zero enhanced
cards. Both visual capture sets passed 43/43 and the lock-migration gate passed
without exceptions. Attempt 1 had no pixel differences. Attempt 2 stayed within
the unchanged budget but omitted four tea thumbnails in its desktop capture;
those assets loaded in attempt 1 and the protected bytes did not change.

The site is not published by this record. Release still requires all applicable
technical checks, review disposition and verification of the deployed bytes.

## Subsequent breakpoint and catalog follow-up

The JavaScript now uses the same `(max-width: 900px)` query as CSS, eliminating
the fractional 900–901 px gap. A real Chromium iframe at 900.5 CSS px with
`zoom:2` confirms the native media-query gap without mocking it. Both pairings
retain their row, details placement and focus through 900 → 900.5 → 901 →
900.5 → 900. The previous JavaScript reproduces the broken row. The standalone
runner passed 8/8 and adversarial suite 46/46 on this breakpoint change.

Menu/reveal and both active Discover modules now request the catalog's content
revision. Source, compiled imports, lazy reveal, HTML and service-worker precache
are bound by strict contracts. Six cache/mutation controls execute before the
unchanged 353 security contracts and secret scan; the full security command is
still required exactly. Catalog data, performance budgets and screenshot
thresholds are unchanged. Browser/offline CI is required on the combined tree.

The earlier two-set visual result above describes the preceding bytes. Fresh
captures against the updated main are required for this follow-up. Its local
main migration attempts 2 and 3 omitted one baseline Discover thumbnail; neither
is reported as a passing migration. Fresh CI and its preserved evidence determine
release acceptance. All previous captures remain historical evidence.
