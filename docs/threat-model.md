# Roby's Coffee House — Threat Model

## System summary

Roby's is a static multilingual café website deployed through GitHub Pages. It has no application backend, authentication, payment flow or server-side database.

## Assets to protect

- visitor trust and safe navigation;
- menu prices, business identity, address and opening hours;
- public HTML, CSS, JavaScript and media integrity;
- GitHub repository, workflows and deployment permissions;
- maintainer credentials and repository secrets;
- visitor language and menu-view preferences stored locally.

## Trust boundaries

1. **Repository → GitHub Actions** — source code becomes a verified release.
2. **GitHub Actions → GitHub Pages** — verified files become public files.
3. **Page → browser DOM** — static strings and URL state become rendered content.
4. **Page → external services** — Google Maps and Instagram links leave the origin.
5. **Maintainer → dependency ecosystem** — npm and GitHub Actions supply build tooling.

## Primary threats

### DOM XSS

An attacker attempts to turn translations, search text, URL fragments or stored values into executable markup. Controls: no dangerous DOM HTML sinks, allowlisted rich-text construction, Trusted Types enforcement and CSP.

### Malicious navigation

An attacker changes directions or social links, introduces `javascript:` URLs or abuses `target=_blank`. Controls: destination contracts, protocol checks and `noopener noreferrer`.

### Supply-chain compromise

A dependency or CI action is compromised or gains an unexpected high-severity advisory. Controls: locked installs, npm audit, Dependabot, CodeQL, minimal workflow permissions and CODEOWNERS.

### Secret leakage

A maintainer accidentally commits a token, API key or private key. Controls: current-tree and changed-history scanning, GitHub secret scanning where available, and rapid credential rotation procedures.

### Deployment tampering or staleness

The public site differs from the reviewed commit or serves an obsolete build. Controls: build markers, live browser smoke, sitemap/asset verification and planned cryptographic manifest verification.

### Privacy expansion

A future feature begins collecting visitor data without explicit review. Controls: a storage-key allowlist, no current server transmission, external-origin review and a dedicated privacy contract.

#### Remembered menu view

The owner-requested list/feed switch may store one display preference under
`robys-menu-view` in same-origin `localStorage`. Its only supported values are
`list` and `feed`; unrecognized stored values do not select the feed. This key
contains no visitor identifier, search history, product history or order data.
It stays in this browser and is not sent to a server or shared across devices.
Choosing another view replaces it; clearing site data removes it. If storage is
unavailable, explicit list/feed links still work without remembering the choice.

`PRIVACY-001` permits direct literal access to this exact key only in
`menu-app.js` and its authored source `src/menu-app.js`.

The optional menu sound uses `robys-menu-sound` (`on` / `off`) only in the two
menu entry runtimes and lazy feedback runtime. It defaults to off, contains no
identity or activity history, stays on this device and is never transmitted.
Clearing site data removes the preference; blocked storage leaves sound usable
for the current page. Audio is created only after a trusted user activation.

`robys-language` allowance is unchanged; other keys and other files receive no
new permission. The standalone view-mode source and generated runtime
(`src/menu-view-mode.js` and `menu-view-mode.js`) are also included in the common
runtime security scan; their preference reader/writer accepts the same enum.
The scanner's literal-key detection remains intact. This preference does not
change CSP, network-origin permissions or the handling of order data.

## Assumptions

- GitHub and GitHub Pages are trusted infrastructure providers.
- Public Google Maps and Instagram destinations are intentionally external.
- Translation dictionaries are repository-controlled, but are still rendered as untrusted text by default.
- No secret is required in the browser runtime.

## Out of scope today

- SQL injection, server-side request forgery and backend authorization flaws;
- payment-card security;
- account takeover within a Roby's customer account system;
- server-side cookie and session configuration.

These become in scope immediately if a backend, CMS, ordering, account or payment feature is introduced.

## Security design rule

Every new trust assumption must become either:

- an explicit allowlist;
- a blocking CI contract;
- a monitored post-deploy check;
- or a documented accepted risk with an owner and expiry date.
