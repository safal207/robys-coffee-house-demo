# PDG-001 Proof Depth Graph

A green check is not proof. Proof exists only when a complete exact-head path reaches a sealed decision.

PDG-001 applies the ClewAI ideas of ProofPath, CML, LTP and Verified Episode to pull-request readiness.

## Depth

| Depth | Stage |
|---:|---|
| D0 | Claim |
| D1 | Repository artifact |
| D2 | Executable verification |
| D3 | Mutation challenge |
| D4 | Independent exact-head review |
| D5 | Finding disposition |
| D6 | Maintainer Proof Seal |

## Required review graph

```mermaid
flowchart LR
  C["D0 claim"] --> A["D1 artifact"]
  A --> V["D2 executable check"]
  V --> M["D3 mutation test"]
  M --> X["D4 Codex"]
  M --> R["D4 CodeRabbit"]
  M --> D["D4 DeepSeek"]
  X --> L["D5 disposition ledger"]
  R --> L
  D --> L
  L --> S["D6 Proof Seal"]
```

The binding reviewers are **Codex, CodeRabbit and DeepSeek**. Jules is not part of the PDG-001 readiness path.

The executable graph is `qa/proof-depth-graph.json`.

```bash
npm run verify:proof-depth
npm run test:proof-depth
```

## Proof Seal

```text
Proof-Depth-Seal: PDG-001
Head: <exact 40-character commit SHA>
Depth: D6
```

A seal is valid only when:

1. it names the current PR head;
2. Codex, CodeRabbit and DeepSeek have current-head evidence;
3. all current-head findings have explicit dispositions;
4. required CI and mutation tests pass;
5. the seal was posted after the latest evidence.

A new commit or later finding invalidates the seal. Inferred graph edges remain advisory and cannot grant readiness authority.
