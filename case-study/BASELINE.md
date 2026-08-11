# SEO Baseline — 2026-08-11

This file records the state before the Yandex-oriented SEO case changes.

## Existing strengths

- `index.html` has a unique title and meta description.
- `index.html` declares a canonical URL.
- `index.html` contains `CafeOrCoffeeShop` JSON-LD with address, opening hours, menu, cuisine and map data.
- `menu.html` has its own title, description and canonical URL.
- `menu.html` contains `Menu` JSON-LD.
- `robots.txt` allows crawling and points to `sitemap.xml`.
- `sitemap.xml` exists.
- Open Graph and Twitter metadata are already present on core pages.
- The customer surface is mobile-first and has an established performance/QA pipeline.

## Gaps / hypotheses to test

### 1. Sitemap freshness and coverage

The sitemap currently exposes only the homepage and menu and uses `2026-06-27` as `lastmod`. The case will update the sitemap only for pages that are intentionally indexable and keep dates tied to real content changes.

### 2. Russian-language crawlability

The site can switch interface language in JavaScript, but a search crawler does not get a dedicated Russian URL representing a stable Russian-language search intent. Hypothesis: a crawlable Russian landing page gives clearer language/topic signals than a client-side language state alone.

### 3. Search-intent depth

The homepage is brand/local-business focused. It does not provide a dedicated static answer surface for Russian queries such as:

- `кофейня в Газипаше`
- `где выпить кофе в Газипаше`
- `кофе и десерты Газипаша`
- `кафе Газипаша меню`

The case will create one useful page around this intent rather than generate thin keyword pages.

### 4. AEO / GEO evidence

Structured local-business data exists, but the repository does not yet document an answer-engine content contract: concise factual answers, entity consistency, sourceable business facts, FAQs and explicit non-claims.

### 5. Automated SEO verification

The repository has extensive QA checks, but no focused script that fails when critical SEO invariants disappear. The case will add a verifier for core static-search contracts.

## Baseline measurement status

| Metric | Baseline |
|---|---|
| Yandex impressions | Not yet connected / not claimed |
| Yandex clicks | Not yet connected / not claimed |
| Yandex CTR | Not yet connected / not claimed |
| Target-query positions | Not yet measured / not claimed |
| Organic sessions | Requires analytics source; not claimed |
| Conversion from organic | Requires analytics source; not claimed |
| Index coverage | To be verified in Yandex Webmaster |
| Structured-data validity | To be validated after change |

## Integrity rule

A future result may be added only with a date, source and reproducible evidence. “Expected uplift” and “measured uplift” must remain separate.
