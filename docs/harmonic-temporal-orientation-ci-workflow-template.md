# Harmonic Orientation CI Workflow Template

> Safe template for adding the Harmonic orientation contract as a GitHub Actions workflow.

## Purpose

The validator currently runs through:

```bash
npm run verify:harmonic-orientation
```

This template shows how to expose it as a dedicated CI check.

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
      - "package.json"
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
          node-version: "20"

      - name: Validate bundled orientation examples
        run: npm run verify:harmonic-orientation

      - name: Validate script syntax
        run: node --check scripts/validate-harmonic-orientation.mjs
```

## Expected output

The validator prints JSON results.

A valid record should return:

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

Do not make this workflow a required branch-protection check until the validator is stable and has at least one allow, hold, and reject fixture.
