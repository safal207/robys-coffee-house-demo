# PR #342: raster repair and bounded Android comparison

Starting head: `c355c40d6840bfec2109e0a5b410c94908fc82cf`.
Base: `5b01276b99db719cae2fc72f29d38eb00c9953f4`.
The original reported head `7e9e67f2` is historical. This change affects QA only.

## Visual cause and repair

CI run [34040984018](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34040984018)
failed 9/43 in both attempts. Artifact 9991725734 has archive SHA-256
`5fe122cc55fcd0edfdb4eee7e13bdd50f21f5f1e107d33c651fa89beadafa15a`.
All six share-card comparisons have identical sizes, relative text/control
geometry, fonts and colors. Their document origins differ after pairing layout
changes. Five cross the unchanged 0.003 image-diff limit; differences concentrate
on rasterized text contours. The 390px case already passed.

An intervention on the actual base/head pages, aligning only the share-card
origin to the nearest CSS pixel, produced exactly zero differing pixels in all
six viewports. The permanent helper applies this symmetrically, bounded to half
a pixel per axis. It rejects unsupported positioning, checks every descendant's
relative geometry/presentation and restores the exact original inline style,
including on screenshot failure. Raw crops, original geometry and unmodified
full-page captures remain available. Viewport actions are tested separately.

Independent fixture: 13/13 checks, including eight raster origins, four genuine
changes (text, color, button position and width), and error-path restoration.
Four original false positives reproduced; all genuine changes still exceed the
existing threshold. The full local 43-capture comparison has only four menu page
height failures. Local font rasterization is not treated as CI baseline evidence.

## Technical inspection of four intentional menu changes

This is assistant visual inspection, not human maintainer approval or release
authorization. The existing reviewed-change route is used only for these four
exact dimension changes. Global thresholds and masks are unchanged. The new
record binds the public resource inventory on BOTH sides, the exact base commit,
and the capture/verifier implementation. It cannot accept the former nine-failure
set, a new fifth failure, a changed dimension or changed bound bytes.

| Viewport | Baseline | Pairing head | Interpretation |
| --- | --- | --- | --- |
| 320 | 320 x 11777 | 320 x 12025 | Single-column cards gain readable content and explicit action |
| 390 | 390 x 11532 | 390 x 11664 | Same intentional single-column redesign |
| 768 | 768 x 13313 | 768 x 12385 | Oversized stacked posters become two bounded cards |
| 1440 | 1440 x 9205 | 1440 x 9182 | Bounded two-column cards replace poster treatment |

Inspected baseline/current full pages and detailed pairing regions at all four
widths from the downloaded CI artifact. Titles, descriptions and 290/370 TRY
prices are visible below complete set photos; unsupported 340 TRY strike-through
and decorative overlays are removed. The following catalogue sections remain
present and shift with the changed pairing section. The original full-page
capture includes the fixed order dock over its capture position on both sides;
that is not proof of normal viewport visibility. Pairing 24/24 and independent
page-action evidence remain separate requirements. Small raster variations occur
between repeated full-page images, so these are not represented as identical PNGs.
The dimension-mismatch sentinel 1 is not a measured 100% content difference.

## Android source boundary

The original smoke still tests public GitHub Pages and is unchanged. Its latest
run [34040984022](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34040984022)
ends WEB_READY_TIMEOUT -> VISUAL_STATE_TIMEOUT. Artifact 9991732300 SHA-256:
`e736688f0eca9ed01cf884186723fa90ff3149d0d1539e36a0b8fe1dc0a980a9`.
It records `web_bytes_pinned_to_pr=false`. Similar terminal failure exists before
pairing. Frames lasting up to 9950ms suggest severe rendering contention but do
not distinguish application, emulator and recorder causes.

The new comparison creates separate temporary diagnostic APK sources from exact
base/head Git archives. Each contains a complete public-file SHA-256 inventory.
Only a resource-delivery adapter is injected into the temporary native copy.
Original URL, origin checks, SSL handling, bridge rules, native deadlines,
animation settings, emulator profile and recording contract are retained.
Production `android-native/` files and the original smoke are unchanged.

The adapter uses Android's
[WebView request interception](https://developer.android.com/reference/android/webkit/WebViewClient)
and [ServiceWorkerClient](https://developer.android.com/reference/android/webkit/ServiceWorkerClient)
to serve pinned APK assets, including byte-range media responses. It verifies each
served file hash and blocks external HTTP(S) resources with 503. Missing first-party
files, hash mismatches and range/adapter errors fail evidence validation. The
verifier independently checks the built APK inventory and observed index/bridge
requests. A handoff failure stays failed even if source identity passes.

This changes transport and external-resource availability: results are a bounded
comparison, not deployed-site, physical-device, TLS/network-performance or release
certification. There is one cold launch per side on separate identical runner
configurations; that does not estimate a failure rate or prove a performance
cause. Native instrumentation is identical on the two starting sources. Their
only pinned web differences are menu.html, pairing CSS/JS, sw.js, package.json and
the integrity manifest. No direct homepage byte change is introduced by pairing.

Local environment lacks Android SDK/emulator. Fixture preparation is verified
locally; APK compilation and actual native handoff require the new CI run.
Keep PR draft; native source identity and handoff remain separate evidence axes.

### First comparison and fixture correction

On `dbc8f7a4`, original public-Pages Android smoke 34054712767 passed and Visual's
screenshot/review steps passed. Pinned comparison 34054712776 compiled both APKs
but timed out on both sides; its resource verifier correctly rejected an
incomplete APK inventory. Those runs cannot certify complete pinned delivery.
Verified artifacts: head9995678729 SHA-256
`2ef5d63dcd39ec8c490b1db5f06bef56cda9281e403016035f217dbdd02a8b34`,
base9995675129 SHA-256
`52186a5df060c5383836d8398b044275cc80b72fce6ed2566e5767e87854a8b9`.

Inspection found underscore-prefixed `_anchors` resource directories vulnerable
to AAPT's default exclusions and two .b64.txt resources omitted by the preparer's
extension selection. Both missing text requests were logged after their terminal
handoff timeout; this does not explain the earlier timeout. The correction keeps
those source files, packs all assets under flat SHA-256 names, and retains each
original URL in the manifest. Exact inventory equality and byte hashes remain
required; an inventory diff is now retained before assertion failure. Android
packaging filters and application deadlines are unchanged. Repeat both sides
after the fixture correction before interpreting delivery-complete results.
