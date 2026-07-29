# Roby's Docker browser lab

This lab starts the current repository as a local website and opens two isolated,
interactive desktop browsers:

- Chromium (Blink engine)
- Firefox (Gecko engine)

The browser desktops are streamed to the host through a local HTTPS web UI, so a
tester can click through the product, open DevTools, resize the viewport, inspect
Console/Network, and capture evidence without installing extra browsers.

## Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2
- At least 4 GB of free RAM for both browsers
- Ports `8080`, `3010`, `3011`, `3020`, and `3021` available

All published ports bind to `127.0.0.1` by default. The site and browser desktops
are therefore reachable only from the machine running Docker unless an operator
explicitly changes `ROBY_QA_BIND_ADDRESS`. Do not expose the browser GUI directly
to the Internet.

## Start

From the repository root:

```bash
npm run qa:browsers:config
npm run qa:browsers:up
```

First startup pulls the browser images and can be large.

Open:

| Target | URL |
|---|---|
| Roby's site on the host | `http://localhost:8080` |
| Chromium desktop | `https://localhost:3011` |
| Firefox desktop | `https://localhost:3021` |

The GUI certificate is self-signed. Accept the local certificate warning.

Default local GUI credentials:

- user: `qa`
- password: `replace_me_before_lan_use`

The default password is an explicit development placeholder. It is acceptable
only while the lab remains bound to loopback. Override it before binding the
browser ports to a LAN interface or sharing access with another tester.

Inside Chromium and Firefox, Roby's opens at `http://site/`. Do not replace it
with `localhost`: inside a browser container, `localhost` means that browser
container, not the site container.

## Share on a trusted LAN

LAN access must be enabled explicitly. Use a strong unique password, limit access
with the host firewall, and run this only on a trusted network:

```bash
ROBY_QA_BIND_ADDRESS=0.0.0.0 \
ROBY_QA_USER=alex \
ROBY_QA_PASSWORD='replace-with-a-strong-unique-password' \
npm run qa:browsers:up
```

`0.0.0.0` publishes the five ports on every host interface. To expose the lab
only through one LAN interface, set `ROBY_QA_BIND_ADDRESS` to that interface's
specific IP address instead.

Return to local-only mode by stopping the lab and starting it again without the
`ROBY_QA_BIND_ADDRESS` override:

```bash
npm run qa:browsers:down
npm run qa:browsers:up
```

## Stop and inspect

```bash
npm run qa:browsers:status
npm run qa:browsers:logs
npm run qa:browsers:down
```

To remove persisted browser profiles too:

```bash
docker compose -f docker-compose.browser-lab.yml down --volumes --remove-orphans
```

## Manual test matrix

Run the critical path in both engines.

| Surface | Desktop | Mobile viewport |
|---|---:|---:|
| Chromium | `1440 × 900` | `390 × 844`, `412 × 915` |
| Firefox | `1440 × 900` | `390 × 844`, `412 × 915` |

Use DevTools responsive mode for the mobile viewports. This validates responsive
layout and browser-engine compatibility; it is not a substitute for a physical
Android device or iPhone/Safari.

## Critical manual scenarios

1. **Load and integrity**
   - Home page and key subpages return the expected content.
   - No broken images, missing fonts, accidental HTML responses for assets, or
     uncaught Console errors.
   - Hard refresh does not expose stale branding or stale JavaScript.

2. **Brand and responsive layout**
   - Primary, compact, mobile, and mark logo variants render sharply.
   - Header, cards, menu sections, prices, and CTA buttons do not overlap.
   - No horizontal scroll at the mobile viewports.
   - Long Russian and Turkish labels do not clip.

3. **Language switching**
   - Turkish, English, and Russian copy changes consistently.
   - The selected language survives navigation and refresh where intended.
   - Links, accessible names, and visible labels stay in the same language.

4. **Menu and Smart Choice**
   - Products, prices, modifiers, pairings, combos, and recommendations match
     the source catalogue.
   - Add/remove/update quantity works.
   - Empty, minimum, maximum, repeated-click, and back-navigation paths are safe.
   - Decision explanations do not contradict the actual cart result.

5. **External actions**
   - Google Maps, Instagram, share, download, WhatsApp/contact, and other
     outbound actions use the correct target and do not break the current page.
   - New-tab behavior is consistent and keyboard-accessible.

6. **Accessibility and interaction**
   - Entire critical path works with keyboard only.
   - Focus is visible and follows a logical order.
   - Buttons are buttons, links are links, and disabled states are understandable.
   - Reduced-motion preference does not hide content or block actions.

7. **PWA/cache**
   - Test installability, service-worker updates, offline behavior, and cache
     invalidation against the deployed HTTPS URL. `http://site` is intended for
     local functional checks and is not a trusted secure origin for complete PWA
     validation.

## Evidence protocol

For every defect, capture:

```text
ID:
Commit / build:
Browser + version:
Viewport:
URL:
Preconditions:
Steps:
Expected:
Actual:
Console / Network evidence:
Screenshot or recording:
Reproducibility:
Severity:
Suspected layer: source | build | cache | render | external dependency
```

A finding is not considered confirmed until it reproduces in a named browser and
viewport with the tested commit recorded. Cross-browser differences should be
reported separately rather than merged into one vague issue.

## Resource and compatibility notes

- Browser images intentionally track their current `latest` release for manual
  compatibility checks. Override `ROBY_QA_CHROMIUM_IMAGE` or
  `ROBY_QA_FIREFOX_IMAGE` with a pinned tag or digest when reproducing a historical
  defect.
- Both images support x86-64 and ARM64.
- If an older Linux host blocks GUI syscalls, LinuxServer documents
  `security_opt: seccomp=unconfined` as a compatibility fallback. Do not enable it
  by default; it weakens container isolation.
- Microsoft Edge and Safari are not included. Chromium covers the Blink engine,
  but release-critical Edge and Safari checks still require Edge on Windows and
  Safari/WebKit on Apple hardware or a dedicated cloud device service.
