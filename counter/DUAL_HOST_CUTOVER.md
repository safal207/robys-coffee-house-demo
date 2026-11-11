# Robys dual-host activation guard — offline contract only

**Status: Draft / NO-GO for live use.** This work follows #484, #485,
#486, #487, #489 and #490. It does not modify `main`, change guest
prices, restart Counter, change GitHub Pages or execute a rollback.

## Why another step is necessary

The guest website is published via GitHub Pages, whereas Counter is a
separate private HTTPS service. A signed owner release and two identical
stage files **cannot make a two-host deployment atomic**. The current
guest and cashier order-ticket implementations continue reading the
old static menu. There is still no published candidate, no host
attestation deployment and no version-aware checkout enforcement.

The `dual-host-cutover-guard.mjs` module is a fail-closed **decision
contract**, not a deployment coordinator. It accepts trusted evidence
and returns an actionable assessment:

- `NO_GO`: invalid, stale or untrusted stage/observations. No action.
- `READY_FOR_CONTROLLED_CANARY`: both hosts *claim* they have prepared
  the same catalog while remaining on the prior release; not activation.
- `READY_FOR_INDEPENDENT_LIVE_PROBE`: both distinct hosts *claim* their
  new catalog is active. This is **not proof that real customer browsers
  or cashier quotes are served at this version**.
- `ROLLBACK_REQUIRED`: partial activation, version/price drift, or one
  host claiming active while its counterpart proof is missing. This is
  an operator escalation only; **no rollback has run**.

Every result declares `published:false`,
`rollbackExecuted:false` and `liveProbePassed:false`.
No automated process may interpret these decisions as an active
production release.

## Independent host attestation contract

Host-side attesters must be separately deployed and provisioned with
distinct Ed25519 private keys **outside the repository**. This PR does
not create or deploy those attesters. The owner release-signing key is
also a different trust root. Pin each host public key out of band.

For each assessment, create a new 32-byte random challenge:
`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"`

Each host signs its own canonical JSON `statement` containing
`schemaVersion`, `role` (`guest` or `counter`), its exact HTTPS
`origin`, `phase` (`prepared` or `active`), `releaseVersion`,
`catalogSha256`, `priceAuthoritySha256`, `ticketCatalogRevision`,
`checkoutCatalogVersion`, `previousReleaseVersion`, `challenge`
and `observedAt` (Unix milliseconds). In the `prepared` phase the
`checkoutCatalogVersion` must equal the previously active release
version; in the `active` phase it must equal the newly approved
`releaseVersion`. The `priceAuthoritySha256` and `catalogSha256`
identify the **staged target**, not necessarily the currently served
prices before activation. The detached Ed25519
`signature` covers `JSON.stringify(statement)` as UTF-8 bytes
and is base64url encoded. These receipts need separate host keys, an
exact matching challenge and origin, and a 5-minute freshness window.

**Do not sign planned state as actual state.** The attester must measure
the bytes actually served and the checkout authority used by its host.
Otherwise a valid signature authenticates only a misleading claim.

## Operator-only assessment

Only after an independently signed owner candidate and offline stage
have passed `verify-stage`, create a PRIVATE JSON config file (not
checked into GitHub) with these six exact fields:

```json
{
  "guestOrigin": "https://menu.example.com",
  "counterOrigin": "https://counter.example.com",
  "previousReleaseVersion": "<64-lowercase-hex>",
  "challenge": "<fresh-32-byte-base64url>",
  "guestPublicKeyPath": "/private/keys/guest-pinned.pem",
  "counterPublicKeyPath": "/private/keys/counter-pinned.pem"
}
```

Generate two JSON receipt files securely, one per actual host attester,
then assess them using an **operator-controlled shell**:

```sh
node scripts/dual-host-cutover-cli.mjs assess \
  /private/signed-candidate /private/keys/owner-pinned.pem \
  /private/dual-catalog-stage /private/assessment.json \
  /private/guest-receipt.json /private/counter-receipt.json
```

The command re-verifies the signed candidate and stage first, then
both host signatures and versions. It never sends network requests or
takes a deployment action. An invalid result exits nonzero.

## Required for a production switch

1. Independent security review of keys, attester identity, HTTPS,
   Counter authorization, owner rights and backup restoration.
2. Host-specific prepared/active observation endpoints, backed by
   actual served menu bytes and the genuine Counter quote authority.
3. A bounded canary and coordinator that blocks checkout until each
   host has independently verified the same release and price hash.
4. Explicit client ticket release binding: stale QR/PWA clients must
   receive a safe re-quote instead of silently changing the price.
   `checkVersionBoundQuote()` is currently **not wired into checkout**.
5. An actual, tested rollback executor restoring both previously
   verified versions, followed by cross-browser, offline and cashier
   end-to-end proof. `ROLLBACK_REQUIRED` alone does not restore them.
6. Human approval and evidence from current release gates. Never mark
   production PASS when trusted human approval was skipped.

The existing public website and Counter remain on their original
static catalog until these requirements are implemented and verified.
