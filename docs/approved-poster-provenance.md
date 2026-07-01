# Approved Iced Latte × San Sebastian poster provenance

## Canonical asset

- Path: `src/pairings-data/approved/iced-san-sebastian-hq.png`
- Dimensions: `1254x1254`
- Byte length: `2,198,571`
- SHA-256: `6569d568bfa58df33b82f0e116ea0a16bcc8f5b4a559ec52e9fec9f590f58329`
- Introduced by: PR #143

The asset bytes, byte length and digest are protected by `integrity-manifest.json` and the Taste Journey poster CI contract.

## Provenance investigation

During PR #143 review, a transient description or discussion entry referred to the approved upload as `1536x1536`. That value does not match the committed PNG.

Repository searches were performed for these variants:

- `1536`
- `1536x1536`
- `1536×1536`

No mutable repository source, documentation, template, changelog, fixture or code comment containing the stale dimension was found. The incorrect number appears to have existed only in historical PR metadata or discussion, which should not be rewritten.

Because no authoritative source for `1536x1536` was found, the committed file is the source of truth. Its IHDR dimensions are exactly `1254x1254`.

## Maintenance rule

Do not re-encode or replace this approved poster as part of provenance cleanup. Any intentional asset replacement must update the exact-dimension assertion, integrity manifest, offline cache and visual evidence in a dedicated change.
