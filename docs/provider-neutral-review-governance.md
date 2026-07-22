# Provider-neutral review governance

This repository does not require an external AI review provider for pull-request readiness.

## Authority

- The human maintainer is the sole binding reviewer and authorization owner.
- Codex, DeepSeek and GitHub security tools may contribute advisory evidence.
- Advisory automation cannot approve, block or merge a pull request by itself.
- Provider availability, subscription state, quota and rate limits are not release inputs.

## Exact-head evidence

D4 accepts a trusted human approval, an exact-head maintainer attestation, or optional automated review evidence. Every actionable current-head finding must be dispositioned before the maintainer posts the D6 Proof Seal.

## Removal boundary

The migration removes the previous provider configuration, scheduled request dispatcher, provider-bound gate, cooperation reporter, quota waiver and provider-specific route authority. Product behavior is unchanged.
