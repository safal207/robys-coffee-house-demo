# Roby's Motion State Contracts

Motion is a presentation of product state. It must not become a substitute for product state.

## Entry graph

```text
ENTRY_BOOT
  -> BRAND_FRAME
  -> WEB_LOADING
  -> FIRST_MEANINGFUL_FRAME
  -> HANDOFF
  -> READY
```

Failure branch:

```text
WEB_LOADING
  -> LOAD_ERROR
  -> RETRY | EXIT
```

Warm return may use the shorter path:

```text
ENTRY_BOOT
  -> WARM_BRAND_FRAME
  -> FIRST_MEANINGFUL_FRAME
  -> HANDOFF
  -> READY
```

## Entry state contract

### `ENTRY_BOOT`

Trigger: application or web entry begins.

Invariants:

- choose cold or warm entry deterministically;
- read the active locale before rendering customer copy when possible;
- reduced-motion preference is known before starting decorative motion when possible.

### `BRAND_FRAME`

Purpose: establish Roby's identity immediately while product content loads behind it.

Invariants:

- use approved identity assets;
- use canonical core background tokens;
- no white or unbranded intermediate flash;
- no network dependency should be introduced solely to display the first branded frame when a local asset can do the job.

### `WEB_LOADING`

Purpose: allow the product frame to prepare without exposing incomplete WebView content.

Invariants:

- loading is bounded by actual readiness or failure logic, not by animation completion;
- a decorative timeline may finish while the product continues loading;
- after `motion.entry.maxDecorativeBlock`, show an honest loading or failure state instead of looping a branded intro indefinitely.

### `FIRST_MEANINGFUL_FRAME`

Trigger: the first useful product frame is visually confirmed.

Invariants:

- page-start or navigation-start alone is insufficient;
- the frame must not be an empty body, blank background, or transient placeholder;
- customer-visible content must be stable enough for handoff.

### `HANDOFF`

Purpose: swap ownership from entry shell to real product UI without a perceptual discontinuity.

Invariants:

- native and web backgrounds match or transition intentionally;
- no double splash;
- no white flash;
- use the semantic handoff timing from `tokens.md`;
- input must not land on an invisible outgoing layer.

### `READY`

Purpose: product is interactive.

Invariants:

- splash overlay no longer blocks input;
- focus and Android Back behavior belong to the product;
- long entry motion does not replay on normal internal navigation.

## Warm versus cold entry

Treat a launch as cold when product UI is not yet resident or a full branded boot is intentionally required.

Treat a launch as warm when the existing product can become ready quickly after foregrounding or reopening.

Do not force a cold animation merely to maximize brand exposure.

## Reduced-motion entry

Reduced-motion mode changes presentation, not readiness logic.

```text
ENTRY_BOOT
  -> STATIC_BRAND_FRAME
  -> FIRST_MEANINGFUL_FRAME
  -> HANDOFF
  -> READY
```

Decorative transforms collapse, but the branded cover remains until the same meaningful-frame condition is satisfied.

## Payment graph

```text
PAYMENT_READY
  -> PROCESSING
  -> SUCCESS
```

Error branch:

```text
PAYMENT_READY
  -> PROCESSING
  -> ERROR
  -> RECOVERY
  -> PAYMENT_READY | EXIT
```

## Payment state contract

### `PAYMENT_READY`

The customer can understand what action is expected. Amount and payment method truth are not obscured by animation.

### `PROCESSING`

Motion may communicate that work is in progress, but must not imply success before success is confirmed.

Coffee fill, steam, or another Roby's motif may show non-critical progress only when it cannot be mistaken for authoritative payment progress.

### `SUCCESS`

Enter only after authoritative success confirmation.

The success scene should settle quickly and leave the confirmation readable. A visual check or completed-cup state may reinforce the result.

### `ERROR`

Enter when payment or required processing fails.

Error motion must be calm and unambiguous. Do not use decorative motion that masks the reason, retry action, or next step.

### `RECOVERY`

Restore a safe actionable state. The customer must not be trapped behind the motion layer.

## Interruption rules

A motion timeline may be interrupted when:

- the product becomes ready earlier than expected after the minimum intended brand read;
- the app backgrounds;
- navigation is cancelled;
- reduced-motion preference applies;
- a failure state supersedes the current decorative state.

Never interrupt or skip the authoritative transition that confirms payment success, payment error, load failure, or product readiness.

## Lifecycle rules

For Android WebView:

- background to foreground should normally use warm-entry behavior;
- WebView state should not be discarded solely to replay branding;
- Back must not reveal a stale splash overlay;
- orientation changes must not restart an unbounded entry sequence;
- process recreation may use cold-entry behavior if the product frame truly needs reconstruction.

## Acceptance invariants

A release candidate fails the motion contract if any of these occur:

- white or unbranded flash between system splash and product;
- native splash disappears before meaningful WebView content exists;
- outgoing splash blocks input after `READY`;
- long splash replays during ordinary in-product navigation;
- reduced-motion mode skips readiness or error handling;
- payment animation announces success before authoritative confirmation;
- error or retry action is hidden by decorative motion;
- localization changes produce clipped or missing customer-visible state text.
