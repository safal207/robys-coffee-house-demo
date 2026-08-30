# Roby's owner business-truth attestation — 2026-08-30

Status: **owner-confirmed**

Canonical source: `qa/business-profile.json`

Machine-checked ledger: `qa/causal-refactoring/business-truth-status.json`

Machine-readable owner manifest: `qa/causal-refactoring/owner-business-truth-attestation-2026-08-30.json`

Binding rule: the ledger stores the canonical JSON SHA-256 digest of the owner manifest. The verifier compares every manifest field, value and value digest with both the production ledger and canonical business profile. Any manifest or confirmed-value change requires a renewed owner review and a replacement digest.

## Authority and provenance

During the owner-attestation step of the Roby's Codex task on 2026-08-30, the repository maintainer explicitly confirmed that they were authorized to confirm the café's business-profile facts and that every owner-critical value listed below was correct.

This record intentionally does not copy private conversation content or personal data. The machine-readable manifest is authoritative for the exact attested values; this document presents the same scope for human review. Review and merge of the associated pull request provide durable repository-account accountability.

## Confirmed values

| Field | Confirmed value | Canonical SHA-256 digest |
| --- | --- | --- |
| `name` | `Roby's Coffee House` | `sha256:1c5100826c2112ef573ccd491128aab688d0028255cff4ccc77dd85b4c970956` |
| `streetAddress` | `Pazarcı, Uğur Mumcu Cd.` | `sha256:983fca9de03a30f0183f2a2f90909e8d74996b332a94639f0d21d0c7c20d9e94` |
| `locality` | `Gazipaşa` | `sha256:67849064737d6635ec44ac9882902debfc55fb20f7c51ebd790f09a3330c05bd` |
| `region` | `Antalya` | `sha256:b60a61467b63806dc0abc361cd63a435c44d535f7c252d02607769e7d2027851` |
| `country` | `TR` | `sha256:0cd931f9187b9a15994e155538dad62d946a5aadcd928ce01e4c88209972f6d0` |
| `displayHours` | `09:00 — 00:00` | `sha256:ec1684fae4ddb7e65e383cc7e9f67bfcf0a12c189bf52761e744a05e97ea86fe` |
| `opens` | `09:00` | `sha256:805883f1ab872f7bca7ce872bb5c92654c5642a2dee780ae6a1b4d38bc5299ee` |
| `closes` | `00:00` | `sha256:1f5b236d123bea231f5c28f42ecf4503fa3c0ca678b7898f7d1ddcba93f137f5` |
| `instagramUrl` | `https://www.instagram.com/robyscoffeehouse/` | `sha256:e53918281071505ebbe54c14af8b7c0a1363c539cb4490b059c0a9b61ebcf4bc` |
| `instagramHandle` | `@robyscoffeehouse` | `sha256:b8a6ec62f80ad0550ab9b91cad9a91dd1addffdd172401a11342e848bddd769a` |
| `mapUrl` | `https://www.google.com/maps/dir/?api=1&destination=Roby%27s+Coffee+House+Gazipasa&travelmode=driving` | `sha256:0c1cf3b1131b226ebceb249eb9c5bec7ace4fea3482daaebb5ee1b634ba37321` |

## Claim boundary

This attestation confirms only the exact business-profile values above. It does not confirm:

- menu items, prices, stock, pairings, holiday exceptions, or allergy wording;
- telephone, WhatsApp, image, video, logo, or other publication rights;
- ordering, payment, reservation, inventory, POS, or token-to-sale integration;
- café staff acceptance of a pilot workflow;
- visits, attributed sales, conversion, revenue, contribution, or profit effects.

## Drift and revocation rule

Any change to a confirmed value causes its digest to mismatch and blocks the gate. The machine-readable manifest is immutable historical evidence and must not be edited to represent a replacement value.

If the owner withdraws or cannot renew confirmation, the rollback must perform all four status changes together:

1. return every affected field to `unverified`;
2. clear each affected field's `value_sha256`;
3. return `publication_mode` to `demo`;
4. remove the top-level `owner_attestation` reference from `qa/causal-refactoring/business-truth-status.json`.

The existing JSON manifest and this human-readable record remain registered in the repository as historical evidence, but they no longer authorize the current status ledger. A renewed confirmation requires a replacement manifest and digest before `owner_attestation` is added back and production publication is restored.

## Owner confirmation lifecycle

The top-level `reviewed_at` records the latest technical review of the ledger. It may advance when repository-controlled fields change and does not renew owner approval. The current owner event remains pinned by `owner_attestation.confirmed_at`, which must equal the immutable manifest's `confirmed_at` and must not be later than `reviewed_at`.

A renewal or replacement is a new evidence event. Before production mode is restored, create a new immutable JSON manifest at a new repository path, register that path in `qa/causal-refactoring/registry.json` with `kind: owner-attestation`, and replace all three ledger reference fields: `owner_attestation.path`, `owner_attestation.confirmed_at`, and `owner_attestation.canonical_json_sha256`. Then update the affected field attestations and digests and rerun exact-head verification. The historical manifest is never rewritten.
