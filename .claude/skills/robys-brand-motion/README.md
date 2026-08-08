# Roby's Brand Motion Skill

Project-level motion skill for Roby's Coffee House.

It is stored under `.claude/skills/robys-brand-motion/` so Claude Code can discover it from repository context.

## Files

- `SKILL.md` — activation, principles, implementation rules, QA, and review rubric.
- `references/tokens.md` — deterministic brand, asset, timing, easing, and reduced-motion tokens.
- `references/localization.md` — Turkish, English, and Russian customer-copy contract.
- `references/motion-states.md` — entry, WebView handoff, payment, failure, and recovery state graphs.

## Source of truth

Current approved repository brand assets and runtime values remain authoritative. The references in this skill capture them for repeatable agent work and must be updated when the approved source changes.

## Scope

The skill guides design and implementation. It does not itself change application runtime behavior, payment behavior, menu truth, or deployment.
