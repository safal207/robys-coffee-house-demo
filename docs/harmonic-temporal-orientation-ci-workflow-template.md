# Harmonic Orientation CI Workflow Template

> Safe template for adding the Harmonic orientation contract as a GitHub Actions workflow.

## Purpose

HTO validation is intentionally isolated from the repository-wide `npm run check` command in the first iteration.

Run it directly with Node:

```bash
node scripts/validate-harmonic-orientation.mjs \
  docs/examples/harmonic-orientation-record.pr188-minify-reject.json \
  docs/examples/harmonic-orientation-record.pr188-baseline-allow.json \
  docs/examples/harmonic-orientation-record.pr186-d6-hold.json \
  docs/examples/harmonic-orientation-record.conflict-escalate.json
node scripts/test-harmonic-orientation.mjs
```

This template shows how to expose those commands as a dedicated CI check.

The workflow should be added manually as:

```text
.github/workflows/harmonic-orientation.yml
```

## Workflow

```yaml
name: Harmonic orientation contract

on:
  pull_request:
    paths:
      - "docs/harmonic-temporal-orientation-*.md"
      - "docs/harmonic-temporal-orientation-*.yaml"
      - "docs/examples/harmonic-orientation-record.*.json"
      - "scripts/validate-harmonic-orientation.mjs"
      - "scripts/test-harmonic-orientation.mjs"
      - ".github/workflows/harmonic-orientation.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate-orientation-records:
    name: Validate orientation records
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Validate bundled orientation examples
        run: >-
          node scripts/validate-harmonic-orientation.mjs
          docs/examples/harmonic-orientation-record.pr188-minify-reject.json
          docs/examples/harmonic-orientation-record.pr188-baseline-allow.json
          docs/examples/harmonic-orientation-record.pr186-d6-hold.json
          docs/examples/harmonic-orientation-record.conflict-escalate.json

      - name: Run validator fixture tests
        run: node scripts/test-harmonic-orientation.mjs

      - name: Validate script syntax
        run: |
          node --check scripts/validate-harmonic-orientation.mjs
          node --check scripts/test-harmonic-orientation.mjs
```

No dependency install or lockfile is required because the validator and its tests use only Node.js built-ins.

## Expected output

The validator prints JSON results. A valid record should return an entry such as:

```json
{
  "results": [
    {
      "ok": true,
      "decision": "reject",
      "score": 6,
      "hard_blockers": ["transition_hides_evidence_debt"]
    }
  ]
}
```

## Safety rule

Do not make this workflow a required branch-protection check until the validator is stable and its allow, hold, reject, escalate, and invalid fixtures are consistently green.
