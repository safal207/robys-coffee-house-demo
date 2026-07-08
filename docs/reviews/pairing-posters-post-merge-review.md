# Post-merge review: premium pairing poster cards

## Context

This review wrapper exists because the pairing poster work was accidentally committed directly to `main` before opening a pull request.

Future changes must go through a branch and PR before landing in `main`.

## Already-landed commits under review

- `d677c45` — add `pairing-posters.css` premium poster styles.
- `85096d9` — add `pairing-posters.js` overlay enhancer.
- `4288c3f` — load poster CSS/JS from `menu.html`.
- `bfa02b0` — remove `innerHTML` usage to stay compatible with Trusted Types / CSP.
- `be607d8` — prevent MutationObserver render loop by adding `posterReady` key and `requestAnimationFrame` scheduling.

## Files to review

- `menu.html`
- `pairing-posters.css`
- `pairing-posters.js`

## Review focus

- No loading freeze or MutationObserver loop.
- No Trusted Types / CSP violation.
- Mobile layout remains usable for `menu.html#pairing-offers`.
- Poster cards visually follow the Roby's Favorites card direction.
- No change to menu prices or source menu data.

## Manual QA request

Open:

```text
https://safal207.github.io/robys-coffee-house-demo/menu.html#pairing-offers
```

Check:

1. page loads without hanging;
2. pairing cards render as poster-style cards;
3. TR/EN/RU language switch still updates menu content;
4. mobile scroll and search still work.
