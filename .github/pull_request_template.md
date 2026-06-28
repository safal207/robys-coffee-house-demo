## Summary

Describe what changed and why.

## Evidence

Link screenshots, logs, artifacts, or reproducible checks.

## AI review

After the latest PR open or head update, add two separate top-level comments:

`@codex review`

`@jules review`

The AI review contract requires official Codex evidence tied to the current head:
either a matching `Reviewed commit` value or the Codex bot's thumbs-up reaction on
the fresh post-head request. AI review remains complementary to required CI and
human approval.

## Checklist

- [ ] Latest CI is green.
- [ ] Generated files are current.
- [ ] Visual changes include evidence.
- [ ] Official Codex evidence is verified for the current head.
- [ ] Jules review was requested after the latest head update.
- [ ] Actionable findings are resolved or documented.
