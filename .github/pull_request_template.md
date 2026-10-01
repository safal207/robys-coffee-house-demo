## Summary

Describe the owner-requested change, its scope and regression risks.

## Evidence

Link exact-head screenshots, logs, artifacts and reproducible checks. State what
was actually run and what remains unverified. Keep generated output and the
integrity manifest synchronized with their sources.

## Review findings

Record actionable findings and their resolution or evidence-backed disposition.
Human and automated reviews are advisory; unavailable or quota-exhausted reviews
are not completed reviews. Never describe assistant inspection as independent
human approval.

Optional automated review requests can be posted separately:

```text
@codex review
@jules review
/deepseek review
```

## Release policy

The owner removed the extra manual confirmation requirement on 1 October 2026.
No `/merge-ready` comment, duplicate owner attestation or manual D6 seal is
required for an owner-requested merge. This is not permission for unattended
publication or for skipping a technical acceptance check. See
`docs/solo-maintainer-attestation.md`.

## Checklist

- [ ] The change and release are within the owner's requested scope.
- [ ] All required technical checks are green on the exact current head.
- [ ] Generated files and the integrity manifest match their sources.
- [ ] Visual changes include current evidence.
- [ ] Every actionable finding is resolved or documented with evidence.
- [ ] Optional reviews and unavailable reviewers are reported accurately.
- [ ] No security, integrity or performance threshold was weakened.
- [ ] Merge will use the expected current head; publication will be verified.
