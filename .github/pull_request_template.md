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

For an optional independent Chinese-model review after the latest head update, add:

`/deepseek review`

Use `/deepseek deep-review` only when a slower reasoning-oriented pass is useful.
DeepSeek evidence is advisory and must show the current reviewed commit SHA.

## Checklist

- [ ] Latest CI is green.
- [ ] Generated files are current.
- [ ] Visual changes include evidence.
- [ ] Official Codex evidence is verified for the current head.
- [ ] Jules review was requested after the latest head update.
- [ ] Optional DeepSeek findings are resolved or documented when requested.
- [ ] Actionable findings are resolved or documented.
