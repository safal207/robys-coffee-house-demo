# Codex cloud environment

This repository is designed to run in a minimal Codex cloud environment without
application secrets.

## Environment settings

Use the repository `safal207/robys-coffee-house-demo` and keep the default universal
container image.

Setup script:

```bash
bash scripts/codex-setup.sh
```

Maintenance script:

```bash
npm ci --no-audit --no-fund
```

Keep agent internet access disabled by default. Setup-time internet access is enough
to install the pinned npm dependencies. Enable agent internet access only for a task
that explicitly needs an external source, and prefer an allowlist over unrestricted
access.

No environment variables or secrets are required for the normal build, test, visual,
or security contracts.

## Verification

After creating or updating the environment:

1. reset the environment cache;
2. open a pull request with a harmless documentation change;
3. post a top-level `@codex review` comment;
4. confirm that Codex reviews the current head commit instead of asking for an
   environment to be created;
5. run `npm run check` and `npm run verify:security` in the environment.

## Repository contract

Codex reads the root `AGENTS.md` before working. Follow it for source/generated-file
boundaries, mandatory validation, integrity updates, visual evidence, and the
Codex/Jules review protocol.
