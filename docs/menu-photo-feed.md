# Menu in photos

## Product role

The feed is a second view of the existing menu for guests who want to choose by
photograph. The list remains the fast route for a known item. Both views use the
same catalog, prices, variants, order draft and counter QR.

The homepage entry is a photo preview labelled “Swipe to choose” at the start of
“What sounds good today?”, before the category choices. The full menu and
feed share a List / Feed view switch. Switching preserves the language, category,
search and shared order. A stored view preference applies only to a generic menu
entry; explicit view links, product and special-purpose links, reloads and Back
keep their requested destination. Storage failure leaves both modes usable. No additional primary hero CTA or timed feed popup is needed.

The switch stays available while scrolling in both views. An explicit list-view
entry skips the café entrance animation and its prepaint work, so returning from
the feed goes directly to the menu. Native links and Back/reload are retained.
Feed entry controls
open the same 12 editable combos, four takeaway selections, three family ideas
and kids choices as the list. The choice helper stays in the current menu view;
Smart Choice opens the same separate builder in either mode.

Product details and the cart use the list's shared editor, including drink and
dessert pairings, flavor changes, component replacement and quantity editing.
Simple products still support quick Add from a post. Promotional pairs open the
shared composition editor so the stored order contains the canonical components.
Optional editors load on intent; a later navigation cancels an older pending
reveal without cancelling an order transaction already in progress.

## Entry and browsing flow

The intended journey is entry → browse → shortlist or add → shared cart → counter
QR. The first product is visible immediately on mobile. Search, categories and
the personal viewing summary live in a separate accessible discovery dialog.

Cards follow familiar photo-post browsing: a light header, full-width square
photograph with heart/share buttons directly over its lower-left corner, then
the product details with price and Add. The 44px icon buttons have a dark
backplate for contrast; previous/next controls occupy the lower-right corner.
Double-tapping a photograph likes the product without undoing a like.
The feed scrolls continuously without fullscreen snapping; previous/next controls
and arrow keys remain alternatives. Photos keep their complete square composition
and intrinsic aspect ratio, including on short screens. Long content remains
reachable with ordinary scrolling above the shared-cart bar.

Share opens the device share sheet where supported, or a link dialog with Copy
and manual selection when clipboard permission is unavailable. A product link
uses `menu-feed.html?item=<catalog-id>&lang=<tr|en|ru>` and opens that product,
including products beyond the first rendered batch. It contains no order data.
Unknown IDs fall back to normal browsing. Cancelling a share keeps the guest on
the card without an error.

The same feed URL is suitable for a table QR or the cafe's social profile link;
these are proposed distribution channels, not placements made by this change.
The interface does not imply a video exists for a static product photograph or
claim a personalized recommendation algorithm.

## Reference and corrections

Comparison on 20 October 2026 used the deployed homepage and feed at main
`91ae923d2af2e2ed7b66646fa4ef96389daa14fa`, plus the catalog and approved brand assets.

- The original feed used a typed wordmark beside the favicon. The header now
  uses the same approved desktop and compact SVG wordmarks as the main site,
  on white, and the approved Organic O asset for post avatars. No recoloring.
- Warm cream surfaces, sans-serif headings and the red accent follow the main
  site's menu. The feed no longer introduces a separate brown/serif identity.
- Square source photographs were placed in a 1.18-ratio crop. They now retain
  their complete square composition with `contain` and correct intrinsic
  dimensions. The desktop column is capped at 460px, without scaling the subject
  up or cropping it to fill a wide card. These are existing reviewed images.

## Personal likes and views

A heart saves an item to the guest's shortlist; the Liked filter brings that
shortlist back without modifying the order. Likes and viewed items persist on
this device and synchronize between tabs. Each product has separate keys, so
changes to different products cannot overwrite each other.

“Viewed by you” means that a loaded photograph was at least 50% visible for one
continuous second while the document was visible, no dialog covered the feed
and no native share sheet was active. A product is counted once, including
across reloads and language changes.
This is a browsing aid, not proof of attention or an audience metric.

If storage fails, interactions continue in memory and the page explicitly says
that they last only while this page remains open. If IntersectionObserver is
unavailable, no impressions are inferred from loading images.

There is no deployed social aggregation service in this static site. Public
like/view totals are therefore not displayed. A future public count requires a
real service with deduplication, abuse controls and an explicit measurement
definition; local preferences must not be relabeled as global popularity.

## Product link previews

The feed, Stories and Reels share `share/{tr,en,ru}/{category}--{item}.html`.
Each static document contains its product's Open Graph and Twitter image tags
in the initial HTML, including an absolute HTTPS JPEG URL, dimensions, localized
name and category. `scripts/build-menu-share-pages.mjs` generates all 189 pages
and 63 JPEG delivery copies directly from the catalog and approved photographs
as part of `npm run build`. Photos retain their full frame. Image URLs include
a content hash so a changed photo has a new cache identity.
The build prunes obsolete generated pages and photo hashes against the current
catalog. Entry-script/style revisions and the offline product registry are bound
to the service worker cache namespace. Installed offline visitors follow a
catalog-validated share route into the cached feed with the correct item/language.

The browser follows a same-origin external script to the exact product and
language in the feed; without JavaScript, the photo, name and menu link remain
usable. Incoming query/fragment values cannot change that destination. Existing
`menu-feed.html?item=...` links continue to open products, but their initial HTML
cannot have product-specific previews on GitHub Pages. Share again using the
product's Share button to obtain the new URL.

`npm run test:menu-feed` checks every generated page, image and destination.
Messenger rendering and caches are controlled by each messaging application;
static metadata validation does not prove a real message was sent or rendered.
The format follows the [Open Graph protocol](https://ogp.me/).

## Acceptance and measurement

Repository tests cover storage failure, malformed values, cross-tab changes,
uncropped images, responsive brand assets, personal likes and dwell guards,
as well as the existing search, flavor, shared-cart and QR journeys in TR/EN/RU.
Additional cases exercise discovery focus, product links, native-share outcomes,
clipboard recovery, keyboard navigation and short screens with enlarged text.
Screenshots and browser reports are produced by the Order reliability workflow.

The product hypothesis is that choosing visually and saving a shortlist helps
undecided guests reach a useful order. Evaluate entry → add-to-order → QR,
compared with the list. Likes alone are not a success measure. No conversion
improvement has been measured or claimed by this change.
