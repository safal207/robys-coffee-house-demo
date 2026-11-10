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
  Image dimensions are checked and only recognized binary formats accepted.
  SVG, HTML, remote URLs and unrestricted base64 are not accepted.
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

## Deliberately missing: publishing pipeline

**Drafts are not ready for guest publication.** Before enabling publish:

1. Normalize newly uploaded photos via an isolated image-processing
   pipeline (strip EXIF/GPS/metadata, validate decoded pixels, resize,
   optimize, check brand relevance, verify rights).
2. Obtain owner approval, provenance and permission for each image,
   and confirm names and prices.
3. Generate one signed, versioned snapshot for customer pages **and**
   Counter quotes so prices cannot diverge; preserve in-flight orders.
4. Run TR/EN/RU screenshot and device QA, Lighthouse, WebKit,
   Counter Order Reliability, image and security gates.
5. Implement atomic publish with audit, backup and rollback to the
   previously verified public snapshot, preserving product IDs.

The staging system is not a complete commercial CMS.
Production upload handling needs storage quotas, unreferenced file
cleanup and a tested backup/restore policy.

## Focused QA

    npm run test:counter
    npm run verify:security
    npm run check

Test concurrency, rollback, image rejection, owner authentication,
cross-role access, CSRF, invalid input, private previews, and unchanged
canonical prices. All exact-head CI and independent review remain required.
