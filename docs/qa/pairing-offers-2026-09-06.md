# Pairing offers repair — 6 September 2026

## Scope

The owner's requested `menu.html#pairing-offers` repair is isolated on
`fix/pairing-offers-framing-20260906`, based on
`0893c361f035e7c6bf6d9456ee82d8dfb14ab601`.

Complete square photographs replace the forced zoom/crop and large duplicate
photo labels. Catalogue name, description and price remain outside the photo.
The localized set-details button reuses the existing product dialog. Catalogue
and agreed prices (290 and 370 TRY), order-store source and CSP are unchanged.
The unsupported hard-coded strike-through price is not reproduced.

## Executed candidate evidence

Run `34009430330` checked out `4ee87dff1d072ffbc56b16ad6e24f5671d510c9a`,
then applied source-first build/cache changes recorded in `source.patch`.
Full `npm run check`, integrity and 287 security checks plus the secret scan passed.
The Chromium matrix passed 24/24 configurations and detected the original
crop/hidden-copy negative control. Widths 320/390/768/1440 x TR/EN/RU x
root text 16/32px; reduced motion is paired with 32px, not independently crossed.

Each configuration checked direct category selection, complete image framing,
visible catalogue price/copy, ordinary touch/click activation, focus return,
adding two first sets and one second set (950 TRY), and same-session reload.
CSP was enforced; service workers were blocked for deterministic CSS.
This is not physical-device, cache-upgrade or deployed-site verification.

Artifact `9982010943`: archive SHA-256
`e0763b387d22a95f5ca18dba8133477252df289effb9a6108742a55a149cfb48`.
The build/test steps passed, but the workflow as a whole failed when the Actions
integration returned HTTP 403 for its attempted detached Git-tree export.
No detached candidate was created by that run. Preserve this distinction;
results describe the working tree, not a clean checkout of the input commit.

The first run `34009362208` stopped before browser tests because pairing assets
were missing from the offline cache list. The second run added content-bound
CSS/JS references and passed that check. Neither failure is hidden.

## Release boundary

No Codex review requested. No threshold or visual-baseline waiver, merge,
publication or real order/payment. Final-head CI and visual review remain
separate from these candidate results. No repository permissions were changed
in response to the Actions export error.
