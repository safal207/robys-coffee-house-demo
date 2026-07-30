# Roby's Docker browser lab

This lab serves the repository through a pinned nginx image and exposes pinned Chromium and Firefox desktop containers for manual browser QA.

## Safety boundary

All five published ports bind to `127.0.0.1` by default and are therefore reachable only from the machine running Docker unless an operator explicitly changes `ROBY_QA_BIND_ADDRESS`. Do not expose the browser GUI directly to the Internet.

The default credentials are test-only. Set `ROBY_QA_USER` and `ROBY_QA_PASSWORD` explicitly before any intentional non-loopback use.

## Reproducible image policy

The default nginx, Chromium and Firefox images are pinned by immutable SHA-256 digest. Chromium and Firefox also default to `linux/amd64`, matching the GitHub hosted QA runner. This means that the same repository commit resolves the same browser-lab bytes instead of silently following a moving `latest` tag.

On an ARM host Docker may use emulation for the default browser platform. An operator may override the platform and images explicitly:

```bash
ROBY_QA_BROWSER_PLATFORM=linux/arm64 \
ROBY_QA_CHROMIUM_IMAGE='lscr.io/linuxserver/chromium@sha256:<reviewed-arm64-digest>' \
ROBY_QA_FIREFOX_IMAGE='lscr.io/linuxserver/firefox@sha256:<reviewed-arm64-digest>' \
npm run qa:browsers:up
```

A run using an override is reproducible evidence only when every override is also digest-pinned and the resolved image references are retained with the test artifact. Mutable tags such as `latest` belong only in the separate advisory image canary and must not be used for release acceptance.

## Exact-head evidence chain

The blocking technical evidence workflow uses three execution boundaries:

1. **Measurement runners** collect one explicit cold-start warm-up plus six steady-state Lighthouse observations for both mobile and desktop.
2. **Producer runner** binds current-run security, performance, Compose and Lighthouse evidence to the exact commit and GitHub run, produces the LiminalQA decision and seals a SHA-256 manifest. It cannot emit the final `verification.json`.
3. **Fresh verifier runner** downloads the sealed candidate into a new workspace, verifies every manifest member, rejects symlinks/path escapes/duplicate raw hashes, recomputes Lighthouse statistics from all raw results, verifies that only the first chronological run is treated as warm-up, rechecks exact-head/run/engine bindings and only then publishes the 90-day final evidence artifact.

The warm-up result remains in the final bundle. It is not silently deleted or selected after seeing the measurements. The measured set is deterministically the six chronological runs following the first cold-start observation.

This is an independent **technical execution boundary**, not an independent human approval. Human review policy remains a separate repository control.

## Start

From the repository root:

```bash
npm run qa:browsers:config
npm run qa:browsers:up
```

First startup pulls the pinned browser images and can be large.

Open:

| Target | URL |
|---|---|
| Roby's site on the host | `http://localhost:8080` |
| Chromium desktop | `https://localhost:3011` |
| Firefox desktop | `https://localhost:3021` |

The browser desktops use self-signed HTTPS certificates, so a local browser warning is expected.

## Stop

```bash
npm run qa:browsers:down
```

The named Chromium and Firefox profile volumes remain until explicitly removed. To remove them together with the lab:

```bash
docker compose -f docker-compose.browser-lab.yml down -v
```
