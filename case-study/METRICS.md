# SEO measurement contract

## Rule

No SEO result is reported without a source and observation date.

## Measurement checkpoints

Record at:

- T0 — before deployment/submission
- T+7 days
- T+14 days
- T+30 days
- T+60 days when useful

## Search metrics

| Metric | Source | T0 | T+7 | T+14 | T+30 | T+60 |
|---|---|---:|---:|---:|---:|---:|
| Indexed target URLs | Yandex Webmaster | — | — | — | — | — |
| Impressions | Yandex Webmaster | — | — | — | — | — |
| Clicks | Yandex Webmaster | — | — | — | — | — |
| CTR | Yandex Webmaster | — | — | — | — | — |
| Avg / observed query position | Yandex Webmaster | — | — | — | — | — |
| Target-page organic sessions | analytics | — | — | — | — | — |
| Organic menu clicks | analytics | — | — | — | — | — |
| Organic route/map clicks | analytics | — | — | — | — | — |

`—` means not measured, not zero.

## Technical metrics

- SEO verification script: pass/fail
- canonical correctness: pass/fail
- robots crawlability: pass/fail
- sitemap target URL presence: pass/fail
- structured-data parse/validation: pass/fail
- mobile performance evidence: link to exact Lighthouse artifact when available

## Hypothesis log

| ID | Change | Expected mechanism | Primary metric | Status |
|---|---|---|---|---|
| H1 | Dedicated static Russian landing page | clearer crawlable language + intent surface | impressions for Russian intent cluster | planned |
| H2 | Fresh sitemap with target URL | clearer crawl discovery | target URL discovered/indexed | planned |
| H3 | Visible FAQ + matching structured data | easier factual extraction / richer understanding | valid markup + observed answer visibility | planned |
| H4 | Internal links to menu/location | stronger user journey and crawl path | menu/map clicks from organic | planned |
| H5 | Automated SEO contract | prevent regression of critical search metadata | CI verification pass rate | planned |

## Result language

Allowed:

- “Indexed by date X according to Yandex Webmaster.”
- “Impressions increased from A to B over the measured windows.”
- “No measurable uplift yet.”

Not allowed:

- “SEO increased traffic” without attribution evidence.
- “Ranked #1” without query, region, date and source.
- “GEO optimized” as a guaranteed outcome.
