# PR #342: entry rendering follow-up

Subject: `07aa407d091f8d37264871eaa330dab6e849c884`; base:
`5b01276b99db719cae2fc72f29d38eb00c9953f4`. PR remained open/draft when
rechecked on 7 September. No product, native deadline, threshold, review binding,
merge or deployment changes are included in this follow-up.

## Local controls

The unchanged contextual certification passed on Chromium 140.0.7339.186:
Day cold 1262.5 ms, Night 1702.4 ms, cross-scene warm 701.6 ms; both frame
medians 16.7 ms. This does not supersede the Day 33.3 ms failure in CI run
34055360928 on the same product bytes.

`qa/evidence/pr342-entry-render-probes-2026-09-07.json` retains original gate
diagnostics and all samples from two bounded local experiments. The diagnostic
probe samples 50 frames from BRAND_FRAME, rather than the gate's 18 frames after
scene inspection. It is **not a replacement certification measurement**.

1. Three rounds per Day/Night scene, baseline versus video source/initialization
   removed (12 navigations). Median was 16.7 ms on both sides throughout. The
   baseline issued play calls but decoded zero frames during observation; this
   runtime cannot establish a benefit from deferring video decoding.
2. Three rounds per scene, baseline versus hiding covered body content versus
   adding layout/paint containment to the entry overlay (18 navigations). All
   medians remained 16.7 ms, without a consistent decisive improvement.

Reproduce from repository root with locked Playwright installed:

```sh
ENTRY_PROBE_VARIANTS=baseline,no-video ENTRY_PROBE_OUTPUT=/tmp/media.json node scripts/probe-entry-render-load.mjs
ENTRY_PROBE_VARIANTS=baseline,hide-covered,contain ENTRY_PROBE_OUTPUT=/tmp/render.json node scripts/probe-entry-render-load.mjs
```

These negative/inconclusive results do not justify a product optimization or
attribution of the contextual failure to pairing. The original 21 ms limit and
18-frame certification are unchanged.

## Android evidence and remaining discriminator

Re-downloaded pinned head artifact 9995868505 from run 34055360870; ZIP SHA-256
`84f58a87d2e3d439f0ae0fb6e8d021b764803fd58376d72f2177bb683d9fdd33` matched.
Its resource identity passed, but the launch failed. The app's main thread logged
304 skipped frames at 19:40:38.561, then WEB_READY_TIMEOUT at 19:40:39.466 and
VISUAL_STATE_TIMEOUT at 19:40:43.875. HWUI reported a 9103 ms frame finishing at
19:40:43.491. Video was served at 19:40:31.688; decoder initialization is logged
at 19:40:38.847. Timing alone cannot identify video as the cause. Changed pairing
resources arrived after the terminal timeout, as documented in the preceding
investigation. System UI also skipped frames before the application launched.

The additional Android observer experiment uses the **same immutable subject
07aa407** for two recorded and two unrecorded independent cold-provider launches.
Only encoder startup/retrieval/video-file checks are absent in the explicitly
unrecorded diagnostic copy. It retains installation, 20-second service settling,
native screenshot resolution, animation settings, launch wait, terminal errors,
and state ordering. The recorded copy is byte-for-byte the original pinned
capture script. No original workflow or capture script is edited.

Each artifact binds the original/derived script hashes and their diff, subject,
APK resources, provider, logcat, native states and exit result. Neither side is
a waiver of the required visual smoke; unrecorded success would only help
separate recording overhead from product/native behavior. Both negative results
would leave that cause unresolved. Two trials cannot estimate failure frequency.

## Validation and disposition

The observer helper preserves 11 native success/failure controls, including
terminal timeout followed by completion, missing visual confirmation, wrong
order, install failure and cancellation. The original 14-case recording contract
remains unchanged. Full `npm run check` and `npm run verify:security` passed
before updating the draft branch. CI experiment results will be linked in the
PR body after completion. No unproven product repair is proposed here.
