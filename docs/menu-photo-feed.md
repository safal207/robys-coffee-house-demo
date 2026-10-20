# Menu in photos

## Product role

The feed is a second view of the existing menu for guests who want to choose by
photograph. The list remains the fast route for a known item. Both views use the
same catalog, prices, variants, order draft and counter QR.

The homepage entry belongs at the start of “What would feel good today?”, before
the category choices. The full menu also links to the photo view. The feed has a
List / Photos switch; returning to the list preserves the selected category.
No additional primary hero CTA is needed.

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
continuous second while the document was visible and no dialog covered the
feed. A product is counted once, including across reloads and language changes.
This is a browsing aid, not proof of attention or an audience metric.

If storage fails, interactions continue in memory and the page explicitly says
that they last only while this page remains open. If IntersectionObserver is
unavailable, no impressions are inferred from loading images.

There is no deployed social aggregation service in this static site. Public
like/view totals are therefore not displayed. A future public count requires a
real service with deduplication, abuse controls and an explicit measurement
definition; local preferences must not be relabeled as global popularity.

## Acceptance and measurement

Repository tests cover storage failure, malformed values, cross-tab changes,
uncropped images, responsive brand assets, personal likes and dwell guards,
as well as the existing search, flavor, shared-cart and QR journeys in TR/EN/RU.
Screenshots and browser reports are produced by the Order reliability workflow.

The product hypothesis is that choosing visually and saving a shortlist helps
undecided guests reach a useful order. Evaluate entry → add-to-order → QR,
compared with the list. Likes alone are not a success measure. No conversion
improvement has been measured or claimed by this change.
