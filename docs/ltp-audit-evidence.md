# LTP audit evidence boundary

The repository contains a canonical **fixture** trace at `qa/ltp/traces/project-audit.clean.jsonl`. Its purpose is to prove that the inspector, hash-chain checks, action-boundary rules, negative tests and deterministic replay work under controlled input.

It is not a production runtime trace and must not be presented as proof that production storage, authorization, model calls, tool calls, protected effects, backup, recovery, retention, encryption or tenant isolation are working.

The `LTP exact-head evidence audit` workflow:

- checks out the full immutable pull-request head;
- records initial and final 40-character SHAs;
- rejects a moved head;
- captures a SHA-256 manifest of the audit-critical control plane;
- runs all 20 negative inspector scenarios;
- inspects one canonical JSONL trace;
- replays it twice and requires byte-identical output;
- publishes raw trace, reports, exit evidence and artifact SHA-256 sums;
- performs no model, tool or protected-effect calls during replay.

A real production claim requires a separately captured runtime trace with authenticated run identity and production storage evidence. The workflow manifest therefore always records `productionEvidence: false` for repository-hosted traces.
