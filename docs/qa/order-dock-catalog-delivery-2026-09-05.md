# Order dock and catalogue delivery

## Scope

PR #341 retains one local order across Smart Choice, the full menu, home and
Discover. This increment fixes the order button covering the existing mobile
actions and removes the duplicate bundled menu catalogue. Prices, catalogue
contents, persistence-domain source, the dependency lockfile and release budgets
are unchanged. No QR, payment, POS integration or replacement intro is included.
The owner requested this work without Codex review; no such review is requested.

## Exact candidate provenance

Run 33993952010 checked out `ca32bf9f045c1f69abf1b034a7ffbae8b7bf4cd1`,
verified and applied the source patch against bound files from
`8387e10d9c60742239edf076a620ca1fd51371a7`, rebuilt generated files and the
integrity manifest, and tested the resulting working tree. It stored commit
`88a7311c69a566f74481781b6307f85e337788df`, tree
`e3439b412f0e2e89e93d4df7c17f77874f700fdb`, without moving a branch.

Artifact 9977522427 has archive SHA-256
`d9556a38ce0e8c285be1fad004109171f3ecf9d6eb0c6f3b13a2859e4e37b487`.
The downloaded archive digest and every candidate file hash were independently
checked against candidate.json. The original source patch's 11 files match the
prepared package; sw.js subsequently receives generated revision values.
Browser report source fields identify the input checkout, not the subsequently
created output commit. Use candidate.json, candidate.patch and file hashes
together rather than relabeling the checkout metadata.

This cleanup removes only the completed one-shot preparation files and adds this
note. The candidate runtime and permanent regression tests remain unchanged.
No original user work or parallel source changes are overwritten.

## Results in that candidate run

- Full npm run check: PASS, including the 20 dock tests and 8 catalogue tests.
- Security contracts: 287 checks PASS; current-tree secret scan: PASS.
- Static performance contract: PASS, not a Lighthouse network measurement.
- Shared order domain and migration: 28 checks PASS.
- Cross-route browser journeys: 20 checks PASS.
- Enlarged-text and touch layout: 12 cases PASS.
- Complete existing mobile gallery matrix: 20 tests PASS, no retries or skips
  reported in the successful run summary.
- Emitted order-store.js and menu-app.js use the same content-bound catalogue
  URL, also present in the service worker: ./menu-catalog.js?v=243b340f2a4d.
  Two import specifiers in one module are not two distinct catalogue URLs.

The gallery matrix uses three emulated iPhone WebKit profiles and Pixel 5
Chromium. Its existing harness bypasses CSP; it is not an enforcing-CSP result
or physical-device test. The suites overlap and are not additive unique cases.

## Behaviour and non-claims

The dock measures visible fixed action panels, reserves their actual height
with a 12-pixel separation, and shares one controller between lazy launcher and
full order drawer. It responds to panel visibility, resizing, enlarged text and
viewport changes; opening the navigation or lightbox hides the order entry.

Catalogue imports are externalized at one content-derived URL. Build output is
UTF-8 and the empty home/Discover launcher remains lazy. These source changes
must be measured by final-head Lighthouse; no passing transfer budget or speed
percentage is inferred from a static byte count.

## Release boundary

Final-head repository CI, Lighthouse, actual visual-diff review, enforcing-CSP
checks and service-worker upgrade checks remain required. No baselines, thresholds
or approval rules were relaxed. Do not merge while required checks are red or
pending. This candidate evidence does not certify publication or a real order
submission. Main and GitHub Pages remain unchanged by the feature-branch update.
