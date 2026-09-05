# Roby's Motion Localization Contract

Roby's customer-facing product supports Turkish, English, and Russian.

The current application language type is `tr | en | ru`, with copy maintained in `src/i18n.ts`. Motion must preserve that three-language contract.

## Locale requirements

Any customer-visible motion copy must exist for all three supported locales:

- Turkish (`tr`);
- English (`en`);
- Russian (`ru`).

Do not ship a motion scene that contains only English because its first concept was written in English.

## Copy ownership

Prefer application-localized text rendered above or beside animation layers rather than baking words into SVG, Lottie, video, or Rive assets.

This keeps copy:

- translatable;
- accessible to assistive technology;
- adjustable without rebuilding the animation asset;
- consistent with the rest of the application.

If a new motion scene requires a new customer-facing string, add the same semantic key for `tr`, `en`, and `ru` in the application's localization source before release.

## Required semantic coverage

When these states are customer-visible, define localized copy for the applicable keys:

- `entry.morning.greeting`;
- `entry.day.greeting`;
- `entry.night.greeting`;
- `entry.loading`;
- `payment.ready`;
- `payment.processing`;
- `payment.success`;
- `payment.error`;
- `action.retry`.

The list defines required semantic coverage, not literal implementation key names. Reuse an existing project naming convention when one exists.

## Existing tone references

Current Roby's copy already establishes a calm, café-first voice. Examples in the repository include concepts such as morning focus, golden hour, slow evening, calm moments, and time for yourself.

New entry copy should preserve that tone:

- short rather than promotional;
- warm rather than excited;
- specific enough to understand immediately;
- no invented scarcity, urgency, discount, availability, or operational promise.

## Concept examples are not approved translations

Phrases such as `Good morning`, `Welcome back`, and `Good evening` are concept examples only until equivalent Turkish and Russian strings have been reviewed in context.

Do not treat an English concept phrase inside `SKILL.md` as approved production copy.

## Layout and animation rules

Turkish and Russian can occupy more horizontal space than a short English phrase.

Therefore:

- do not animate to a fixed text width based on English;
- allow wrapping where the design permits it;
- avoid clipping during reveal animations;
- test the longest supported translation at narrow mobile widths;
- keep greeting animation independent from word count when possible;
- do not time critical state changes to speech or letter count alone.

## Accessibility

Localized text must remain real text whenever practical.

For customer-visible state changes:

- keep the visual copy readable after motion completes;
- use the application's existing live-region pattern when a status needs announcement;
- do not rely on animation alone to communicate loading, success, or error;
- reduced-motion mode must preserve the same localized state truth.

## Release checklist

Before shipping motion with customer copy, verify:

- `tr`, `en`, and `ru` all contain the required semantic message;
- no fallback exposes untranslated internal keys;
- narrow-screen wrapping has been tested;
- success and error meaning is equivalent across locales;
- copy contains no unsupported business or payment claim;
- animation assets do not contain stale baked-in language.
