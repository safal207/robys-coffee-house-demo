# Premium UI repair — PR #338

## Scope

Photo/copy/price separation; readable enlarged text; direct mobile menu access;
CSS-only press, focus and selected-state feedback; accessible quantity targets;
restrained compositor-based motion and reduced-motion support. Approved artwork,
menu catalog, prices, order semantics, public URLs and recommendation logic are
unchanged. There is no new animation library or pointer-tracking runtime.

## Defects and corrections

- Long descriptions stretched an aspect-ratio media grid item beyond its column.
  Bound the button's width, align it to the start, and remove the image's intrinsic
  sizing contribution. The image remains square; text and prices remain separate.
- At 200% text enlargement, long category headings overflowed their text boxes.
  Allow wrapping within shrinking flex/grid columns rather than hiding content.
- Show the existing direct-menu secondary action on mobile.
- Feedback uses actual `:active`, `:focus-visible`, `aria-pressed` and cart state.
  No synthetic success states or automatic order submission were introduced.
- Cart steppers have 44px targets. Quantity controls and long totals may wrap.
- Reduce excessive cart pulse amplitude and dialog backdrop blur; animate no layout
  dimensions. Keyboard focus and native scroll remain available.
- Compact existing generated gallery/social scripts without changing identifiers;
  regenerate them from TypeScript and preserve classic/deferred execution.
- Content-hash the menu stylesheet in HTML and service-worker precache, validate
  both against the actual bytes, and bump cache generation to v61.

## Evidence boundary

Local Chromium was restricted from navigating to HTTP, including loopback.
The local **isolated offline DOM fixture** used repository HTML/CSS and a bundled
menu runtime, without production navigation, CSP or service workers. It is not a
live-site or full offline-install certificate.

Local geometry matrix: TR/EN/RU × 320/360/390/768/1440px × 100%/200% text = 30
cases; 61 product photos in each; zero overlaps and zero page-width overflow.
Three localized cart paths passed add 2, increment 3, remove to 0, arithmetic,
44px targets, in-dialog announcement, focus restoration and Escape/body unlock.
The old stylesheet reproduces photo/copy overlaps in the same fixture.

Run the real-navigation contract with:

```sh
npm ci --no-audit --no-fund
npm run build
npm run integrity:generate
npm run check
npm run verify:security
npm run verify:performance
npx playwright install --with-deps chromium
node scripts/premium-ui-regression.mjs
```

`Premium UI regression` runs the new geometry/order/state contract and the existing
expanded UI/UX and scroll suites independently of visual approval, but still fails
if either independent suite fails. It does not waive the existing visual gate.

## Release conditions

Do not merge while required checks are red/running or actionable reviews remain.
New visual differences require inspection; existing screenshot approvals are not
silently rebound. Lighthouse transfer measurements must be rerun; static byte
savings are not a new performance score. The existing native APK visual-handoff
failure is separate from browser navigation and is not claimed fixed here.
Request independent Codex and Jules reviews after the final head is published.
