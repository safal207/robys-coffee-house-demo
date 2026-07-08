# LS review examples

## Docs-only PR

LS Verdict: APPROVE

Graph coverage: complete

Graph:

- protocol docs -> QA process -> clarity check -> pass
- design docs -> design governance -> owner check -> pass
- memory docs -> QA memory -> privacy boundary check -> pass

Temporal memory:

- Memory hits: 2
- Reused lessons: post-merge review rule; observer-based UI changes need loop checks
- Repeated risks: none

Decision:

- blocking findings: 0
- advisory findings: 0
- human decisions required: 1
- merge allowed: yes after human approval

## Visual runtime PR

LS Verdict: COMMENT

Graph coverage: partial

Graph:

- CSS change -> card layout -> mobile check -> pass
- JS change -> UI rendering -> page-load check -> pass
- HTML change -> asset loading -> console check -> pass
- new assets -> cache review -> missing

Temporal memory:

- Memory hits: 1
- Reused lessons: observer-based UI changes need loop checks
- Repeated risks: render_loop

Finding:

- LS-001 — Cache impact not checked | medium | human decision

Decision:

- blocking findings: 0
- advisory findings: 1
- human decisions required: 2
- merge allowed: yes with accepted follow-up
