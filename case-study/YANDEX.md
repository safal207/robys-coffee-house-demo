# Yandex-oriented SEO plan

## Objective

Make the site's intentionally indexable pages easier to discover, interpret and validate in Yandex without creating doorway pages or fabricating business claims.

## Implementation principles

1. **One useful page per real intent.** No mass-generated city/keyword pages.
2. **Stable crawlable URLs.** Important Russian content should exist in HTML at a dedicated URL, not only behind a client-side language switch.
3. **Explicit canonical ownership.** Every indexable page has a self-consistent canonical URL.
4. **Sitemap reflects reality.** Include only intended indexable URLs and update `lastmod` when content actually changes.
5. **Structured facts match visible content.** Schema.org data must not introduce facts hidden from users.
6. **Local intent is factual.** Address, opening hours, menu and map references must remain consistent across page copy and structured data.
7. **Measure before claiming.** Yandex Webmaster/Search data is evidence; estimates are not results.

## Planned changes

### P0 — crawl/index contract

- Add `/ru/coffee-gazipasa.html` as a static Russian-language discovery page.
- Add its canonical URL.
- Add it to `sitemap.xml`.
- Keep `robots.txt` open for the page.
- Add a machine-verifiable SEO contract script.

### P1 — semantic / snippet quality

- Clear Russian `<title>` and meta description aligned to real local intent.
- Exactly one useful H1.
- Visible NAP-style location facts consistent with the main site.
- Internal links to the menu and main business page.
- `CafeOrCoffeeShop` / `FAQPage` structured data only for facts visible on the page.

### P2 — Yandex Webmaster verification

After deployment and access to the property:

- submit / verify `sitemap.xml`;
- inspect indexed-page status;
- validate structured data in Yandex Webmaster;
- review regional signals and ensure they match the actual business geography;
- record impressions, clicks, CTR and query/page data at fixed checkpoints.

## Target intent cluster

Primary:

- кофейня в Газипаше
- где выпить кофе в Газипаше
- кофе Газипаша
- кафе Газипаша меню

Supporting:

- десерты Газипаша
- латте Газипаша
- кофейня рядом Газипаша

These are hypotheses for a Russian-speaking audience. Search volume is not claimed until measured with an appropriate keyword-data source.

## What this case does not claim

- prior Russian e-commerce production results;
- guaranteed rankings;
- guaranteed inclusion in AI answers;
- traffic growth before measurement;
- a Russian physical business location when the actual business is in Gazipaşa, Antalya.