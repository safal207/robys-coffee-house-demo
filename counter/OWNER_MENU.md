# Roby's owner menu drafts — private staging only

**Status: implementation in Draft PR; not published, not deployed.**
Depends on parent PRs #484, #485, #486. No change to guest menu,
checkout prices, order calculations, current product photographs, or
publicly hosted files.

## Available after Counter deployment and private owner provisioning

- Open /owner on the private Counter host, sign in using the separate
  owner credential, and select **Edit menu and photos**.
- Review each product from the canonical catalog. Editors use the same
  stable category/slug product IDs as existing Feed/List and orders.
- Edit Turkish, English and Russian names plus the draft price in
  whole Turkish lira (TRY), 1 to 9999. The original menu stays unchanged.
- Stage a replacement image: JPEG, PNG or WebP, no larger than 4 MiB.
  Server-side Sharp decodes and re-encodes the upload to WebP (max 1600 px,
  max 2 MiB output). EXIF/GPS, XMP, IPTC and embedded profiles are removed.
  Animated and corrupt files, oversize images, SVG, HTML, remote URLs and
  unrestricted base64 are rejected. The original untrusted byte stream
  is never written to disk.
- The file stays in a private persistent folder beside Counter SQLite and
  is previewed only through an authenticated, no-store owner route.
  It is **not** published to static assets.
- Every accepted edit creates a monotonically increasing revision
  and a separate audit entry with actor, timestamp and previous/next
  draft content. Restore creates another revision, preserves history,
  and stale forms receive HTTP 409.

## Security boundaries

- Cashier/barista cookies cannot open the owner catalogue.
- Edits and photo uploads require owner authentication,
  exact same-Origin request and owner CSRF token.
- Multipart bodies are capped, duplicate parts rejected; upload
  filename and client MIME are not trusted. Saved filenames are
  cryptographically random with known extensions.
- Gallery previews, edit routes and drafts are private to Counter,
  not served from GitHub Pages. Customer prices remain stable.
- Existing private Counter rate limits and security headers apply.
- No external image hosting, data export or CDN upload is used.

## Private release proposal and owner approval

After login on the protected Counter host, open /owner/releases from the
editor. The screen lists changes and image counts, and displays a SHA-256
snapshot fingerprint. The owner can:

1. Create an immutable release proposal against the exact current draft.
2. Review a candidate and explicitly attest photo rights, translations
   and approved prices using a mandatory checkbox.
3. Approve or cancel the proposal. A stale proposal is rejected with 409
   if any menu edit or photo reference has changed.

These are **owner approvals for an OFFLINE release candidate only**.
The website and Counter quotations DO NOT change. A candidate never
executes a deployment or charges a card. The candidate id and audit
record remain in private Counter SQLite.

### Signed operator handoff (not a deployment)

An authorized operator separately provides a pre-existing Ed25519
signing key, stored with file permissions 0600, and a trusted public
key distributed independently. Never commit either private key or
customer data to the repository.

    node scripts/owner-release-cli.mjs export /private/counter.sqlite r_<candidate-id> /private/signing-key.pem /private/release-candidate
    node scripts/owner-release-cli.mjs verify /private/release-candidate /private/trusted-public-key.pem

The first command creates a non-overwriting PRIVATE folder containing
a signed complete catalog snapshot, sanitized staged WebP images and
SHA-256 file hashes. The second command must be run with the PINNED
public key, not a key contained in the candidate package. Both commands
report published=false. Tampered files and unapproved candidates fail.

## Deliberately missing: production deployment

**DO NOT expose the signed candidate as a live menu.** The following
remain hard blockers:

1. Independent security review of the upload decoder, owner session,
   consent and signature chain; image provenance and permission from Reyhan.
2. A single coordinated revisioned release contract that ensures both
   the GitHub Pages customer menu and Counter quote authority switch to
   identical catalog and price hashes. The current order-ticket module
   still quotes the old static menu; candidate packages DO NOT override it.
3. Preserve the previously signed release for rollback, protect in-flight
   orders and refuse stale/offline clients; validate service-worker caches.
4. Independent TR/EN/RU device screenshots, Lighthouse, WebKit, Counter
   Order Reliability and integrity proofs for the deployment candidate.
5. Backup/restore for owner releases and media, upload quotas, orphan
   cleanup, reproducible public WebP paths and explicit publish audit.

The approved immutable package can serve as input to that future
dual-system release coordinator. **An approval is not a publication**.

## Focused QA

    npm run test:counter
    npm run verify:security
    npm run check

Test concurrency, rollback, image rejection, owner authentication,
cross-role access, CSRF, invalid input, private previews, and unchanged
canonical prices. All exact-head CI and independent review remain required.
