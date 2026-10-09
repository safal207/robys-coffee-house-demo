# Roby's Coffee House: scanner scope

## Project and boundaries

Roby's is a mobile-first static cafe website with Turkish, English and Russian
content, a menu, product pairings, discovery journeys and Smart Choice drafts.
The canonical public site is https://safal207.github.io/robys-coffee-house-demo/.
This submission requests analysis of the repository and an isolated local copy.
Do not probe the live site, GitHub, Google Maps, Instagram, WhatsApp or other
third-party services. External destinations are intentionally unavailable during
the offline audit. There is no ordering backend, authentication service,
server-side database or payment processor in this repository.

Roby's is a cafe project and QA demonstration. We do not claim critical
infrastructure status, wide adoption or any number of dependent projects.
Eligibility is for Anthropic to decide.

## Assets and attacker inputs

Protect visitor trust, safe navigation, menu and business-data integrity,
offline-cache integrity, local preferences and customer draft contents.
Treat URL search/fragment state, search text, storage entries, incoming messages
and data loaded at runtime as untrusted at their consuming boundaries.
Repository-controlled translations and catalogs must still use safe rendering.

Inspect browser source in `src/`, emitted runtime JavaScript, `experience/`,
`smart-choice/`, `sw.js`, `sw-core-v64.js`, `pwa.js`, `menu-pwa.js`, analytics
destination code, HTML CSPs and local build/release workflows. Include paths
that are not listed in a current security-contract file allowlist.

Relevant issues include DOM XSS and unsafe navigation; unsafe dynamic-script or
Trusted Types policy creation; service-worker scope, cache and message-boundary
errors; unwanted data transmission; unsafe CI trust boundaries; and source /
generated-runtime divergence. A dangerous-looking sink alone is insufficient:
show the reachable attacker-controlled input and actual effect.

## Severity and false-positive guidance

Assess impact against the shipped static-site architecture. Locally editing
one's own browser storage or changing a client-side draft price is not a
server-side authorization bypass or payment theft. Public DEV/debug traces are
not privileged admin interfaces unless a privileged capability is demonstrated.
No real order or payment effect may be inferred from a local draft or simulator.

Do not report SQL injection, SSRF, account takeover or backend authorization
without identifying an actual implementation and reachable boundary. Host-level
header limitations of GitHub Pages must be described as hosting limitations,
not as application-side fixes that a meta CSP cannot deliver. Catalog facts and
brand/media permissions are owned business data; do not invent or change them.

## Environment and reproduction

The Dockerfile installs Node.js 22, locked npm packages, Python, ffmpeg/ffprobe
and the Chromium browser matched to the pinned Playwright dependency.
The checkout and all dependencies are available at `/src`; browser binaries are
at `/opt/robys-playwright`. Serve local fixtures with
`python3 -m http.server 8080 --bind 127.0.0.1` from `/src`.

The offline verification commands are:

```sh
npm run check
npm run verify:security
node scripts/verify-analytics-destination-boundaries.mjs
```

`npm audit`, live checks and optional Docker Compose browser labs need external
services or a container daemon and are not offline checks. No real credentials
are required. Analyze workflows as source; do not dispatch them or try to access
secrets. Use only local fabricated test data for reproducers.

## Reports and fixes

Include the inspected commit SHA, source file/line, attacker capability, input,
reproduction command, observed effect, expected boundary and severity rationale.
Distinguish confirmed runtime effects from hypotheses and duplicate findings.
Group reports by root cause and include source-to-generated paths where relevant.

Propose the smallest source-first patch and a regression case, then rebuild
generated files and update the integrity manifest only if protected bytes change.
Preserve TR/EN/RU, accessibility, reduced motion, CSP, integrity and review gates.
Do not weaken checks, modify licensing, change secrets, merge or deploy.
Unvalidated findings should be disclosed privately to the maintainer, consistent
with `SECURITY.md` and the OSS Scanner terms.
