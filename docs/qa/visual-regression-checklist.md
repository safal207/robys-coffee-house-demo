# Visual regression checklist

Use this checklist before merging visual or menu UI changes.

## Required pages

- `index.html`
- `menu.html`
- `menu.html#pairing-offers`
- `menu.html#hot-coffee`
- `menu.html#desserts`

## Devices / widths

Check at minimum:

- 390px mobile width;
- 430px mobile width;
- tablet-ish width around 768px;
- desktop width around 1280px.

## Visual checks

```text
[ ] Header is visible and not broken
[ ] Logo / wordmark is readable
[ ] Language switch works and remains tappable
[ ] Search input is visible and usable
[ ] Category chips scroll correctly
[ ] Pairing cards do not overflow
[ ] Product cards keep consistent crop
[ ] Prices are readable
[ ] Shadows and borders do not look heavy or dirty
[ ] CTA buttons remain clear
[ ] Footer is not visually detached
```

## Functional checks

```text
[ ] Page loads without freeze
[ ] No blocking console errors
[ ] Search filters products correctly
[ ] TR / EN / RU switch updates visible text
[ ] Back link returns to cafe page
[ ] Instagram link opens externally
[ ] Google Maps link opens externally
[ ] PWA install/download scripts do not block menu load
```

## Content integrity checks

```text
[ ] No unintended price changes
[ ] No unintended product removals
[ ] No unintended translation changes
[ ] No accidental SEO description changes
[ ] No unrelated analytics changes
```

## PWA / cache checks

```text
[ ] New critical assets are considered for precache
[ ] Cache version bump is intentional when needed
[ ] Integrity manifest is regenerated if required
[ ] Offline fallback still works
```

## Evidence format for PR body

```text
## Visual QA

- Mobile 390px: pass/fail
- Mobile 430px: pass/fail
- Desktop 1280px: pass/fail
- Language switch: pass/fail
- Search: pass/fail
- Console: pass/fail

Notes:
- <known limitation or human visual decision>
```
