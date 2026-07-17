# LS temporal JSONL memory

## Core idea

LS becomes stronger when the graph has a time axis.

```text
Graph review + JSONL memory = temporal change intelligence
```

The graph explains what a PR can affect. JSONL memory explains what happened before, what was learned, and which risks repeat.

## Why JSONL

JSONL is useful because every event is append-only and machine-readable.

Each line is one fact:

- PR opened;
- file changed;
- graph edge discovered;
- finding created;
- finding fixed;
- reviewer decision made;
- human decision recorded;
- lesson learned.

This makes LS memory easy to diff, search, replay, and audit.

## Event stream shape

Example:

```jsonl
{"ts":"2026-07-08T05:20:00Z","type":"finding","id":"LS-001","pr":181,"path":"pairing-posters.js -> MutationObserver -> DOM overlay -> page load","risk":"render_loop","severity":"high","status":"fixed"}
{"ts":"2026-07-08T05:25:00Z","type":"decision","pr":182,"decision":"Add LS dependency graph rule","owner":"Alexey"}
{"ts":"2026-07-08T05:30:00Z","type":"lesson","pattern":"MutationObserver changes require render-loop check","applies_to":["pairing-posters.js","menu rendering"]}
```

## Event types

### `pr_opened`

```jsonl
{"ts":"2026-07-08T05:00:00Z","type":"pr_opened","pr":182,"title":"docs: add review board protocol","branch":"docs/review-board-protocol"}
```

### `changed_file`

```jsonl
{"ts":"2026-07-08T05:01:00Z","type":"changed_file","pr":182,"file":"docs/qa/ls-review-protocol.md","change_type":"update"}
```

### `graph_edge`

```jsonl
{"ts":"2026-07-08T05:02:00Z","type":"graph_edge","pr":182,"from":"ls-review-protocol.md","to":"LS review flow","risk":"process ambiguity"}
```

### `finding`

```jsonl
{"ts":"2026-07-08T05:03:00Z","type":"finding","id":"LS-001","pr":181,"severity":"high","status":"reproduced","risk":"render_loop"}
```

### `check_result`

```jsonl
{"ts":"2026-07-08T05:04:00Z","type":"check_result","pr":181,"check":"page_load","target":"menu.html#pairing-offers","status":"pass"}
```

### `decision`

```jsonl
{"ts":"2026-07-08T05:05:00Z","type":"decision","pr":181,"decision":"keep_with_followup_review","owner":"Alexey"}
```

### `lesson`

```jsonl
{"ts":"2026-07-08T05:06:00Z","type":"lesson","pattern":"New menu runtime script requires CSP and cache review","confidence":"high"}
```

## How LS uses memory

When reviewing a new PR, LS should:

1. read changed files;
2. build the dependency graph;
3. search JSONL memory for similar files, risks, and graph paths;
4. promote repeated risks to mandatory checks;
5. report reused lessons in the LS review.

Example:

```text
Memory hit:
- Past risk: render_loop
- Past path: pairing-posters.js -> MutationObserver -> DOM overlay -> page load
- Required check added: page load + DOM churn check
```

## Temporal metrics

JSONL memory enables project-level metrics:

- repeated risk count;
- most fragile files;
- most common LS findings;
- reviewer precision;
- time to fix;
- graph coverage trend;
- risk coverage trend;
- post-merge review count.

## Risk replay

Risk replay means LS can replay old incidents against a new diff.

Example:

```text
Old incident:
MutationObserver change caused page loading freeze.

New PR:
MutationObserver code changed again.

LS action:
Require render-loop check even if the diff looks small.
```

## Suggested repository layout

```text
docs/qa/ls-graph-review-engine.md
docs/qa/ls-temporal-jsonl-memory.md
ls-memory/events.jsonl
ls-memory/lessons.jsonl
ls-memory/risk-patterns.jsonl
```

## Minimal event schema

Required fields:

```text
ts      ISO timestamp
type    event type
pr      PR number when available
```

Recommended fields:

```text
id          finding or decision id
file        changed file
path        graph path
risk        risk key
severity    low | medium | high | critical
status      pass | fail | fixed | reproduced | not_reproduced | human_decision
owner       human or reviewer owner
confidence  low | medium | high
```

## LS temporal review template

```text
LS Temporal Memory:
- Memory hits: <count>
- Reused lessons: <list>
- Repeated risks: <list>
- New lessons recorded: <list>

Temporal risk verdict:
- stable | watch | elevated | repeated incident
```

## Boundary

JSONL memory should record review facts and decisions. It should not store secrets, tokens, private customer data, or sensitive personal information.
