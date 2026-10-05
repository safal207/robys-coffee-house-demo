# PR 426 build repair — 5 October 2026

## Scope

Repair the Smart Choice build budget without increasing the 300,000-byte limit,
removing features or changing catalogue prices/translations. Keep PR 426 draft;
no merge or deployment is part of this repair.

## Implemented

- Emit six Smart Choice ES modules as UTF-8 rather than ASCII-escaped Unicode.
- Add exact source/generated output parity and decoded-literal regression checks.
  A deliberately changed TRY/USD literal is rejected by the negative control.
- Supply URLSearchParams and window.location.search in the existing discovery
  rotation VM harness, including known/unknown pairing deep-link cases.
- Include both pairing JS and CSS revisions in the PWA cache namespace.
- Rebuild generated JS, HTML revisions and the integrity manifest.

## Measured result

The same locked build produces 300,654 bytes using ASCII escaping and 253,615
bytes using UTF-8: 47,039 bytes saved, with 46,385 bytes below the unchanged limit.
The six output modules preserve their decoded literal values. Existing business
logic tests remain necessary and were run; literal comparison alone is not a
claim of full behavioural equivalence.

## Executed verification

GitHub Actions run:
https://github.com/safal207/robys-coffee-house-demo/actions/runs/37309854650

The repair job applied hash-guarded source patches, restored the original refresh
workflow and removed the temporary patch file **before** executing:

```text
npm run build                 PASS
npm run integrity:generate    PASS
npm run check                 PASS
npm run verify:security       PASS
```

Only then did it commit the allowed source/generated paths to the PR branch as
1618982203105276fd50ab33e0bd11381abe8848. No main branch push or deployment ran.
Local reproduction from the locked CI source/dependency artifact also passed
npm run check and verify:security (353 contracts plus the secret scan).

## Evidence boundaries

- Security contracts are not a substitute for CodeQL, ZAP or browser testing.
- This record does not certify the visual pairing-card repairs or claim that
  all required workflows passed at the final PR head. Check current-head runs.
- The local browser was blocked from localhost by its environment policy;
  no local browser pass is claimed. Use CI browser artifacts for visual review.
- AI review is advisory. No independent approval is manufactured by this record.

## Temporary tooling cleanup

The original refresh workflow was restored during synchronization. The final
cleanup restores the original TypeScript verification workflow as well, leaving
no temporary source-export or branch-writer workflow in the proposed tree.
