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

## Original-sampler layer experiment

At product/tooling parent `0545cb9aaf6e4b0a0e44601bd36bf223802e1c62`, the
unchanged contextual gate still fails in CI on Night (33.3 ms, run 34086742409).
The unchanged gate passes locally even with the process restricted to four
CPUs. An earlier two-CPU ablation also failed to reproduce the slow median.
These local passes cannot certify the CI rendering path.

The initial `4027cb2` version of `scripts/probe-contextual-layers.mjs` runs only after the original contextual
step fails. The failed certification remains failed. The diagnostic imports
the original gate functions with one declared initialization hook and retains
the original scene assertions, 18 raw frame samples, 15 unique transforms and
21 ms limit. It also runs the original two cold launches before each measured
Day/Night pair. Source and derived script hashes, graphics renderer, assertions
and frame samples are saved with the existing workflow artifacts.

Two rounds use forward and reverse order across six conditions: unchanged,
shadows removed, filters removed, perspective flattened, overlay layout/paint
containment, and covered body content hidden. Each condition uses a fresh
browser. Removing optical effects is diagnostic only: those conditions are
not approved designs or product repairs. A consistently faster condition would
identify an area for a separate appearance-preserving candidate, not justify
shipping that ablation. `COLLECTED` means all 24 observations contain 18 samples;
it does not mean certification passed. Missing samples fail collection.

Reproduce the bounded diagnostic from the repository root:

```sh
node scripts/probe-contextual-layers.mjs
```

The helper drains its HTTP server log pipes because the longer matrix can fill
them. This changes diagnostic plumbing only; it does not change the original
gate, product runtime, screenshot tolerances or Android deadlines.

## Surface candidates after the optical ablation

Exact product parent: `4027cb2c0a6ead8d47b360b19c3ec5b3d9b609a9`; base remains
`5b01276b99db719cae2fc72f29d38eb00c9953f4`. No product or native file changes.
CI run 34089977296 passed once, then failed its one declared control repeat at
Night 33.2 ms. Its full 24-observation diagnostic obtained original-sampler
medians within 21 ms in 1/4 unchanged cases, 4/4 without shadows, 4/4 without
filters, 4/4 with flattened perspective, 1/4 with containment and 3/4 with
covered content hidden. Optical removals are not approved designs. Full artifact
identities, hashes and the rejected static-promotion experiment are in the PR.

The follow-up keeps the original `optics` suite available and adds a bounded
`surfaces` suite. It compares unchanged rendering with four candidates:

- an explicit rectangular clip on the already clipped overlay;
- a static-filter compositing hint on the animated foreground;
- hidden back faces on scene descendants, whose animation never rotates away;
- automatic isolation for the opaque overlay and its logo stage.

Six local fixed-pose comparisons per candidate (Day/Night, animation fractions
0.2/0.6/0.9, 390 x 844) had zero changed pixels. A separate logo-filter promotion
candidate changed up to 77791 pixels and was rejected before this CI matrix.
The earlier five-static-layer `will-change: auto` candidate remains rejected.

The original sampler was also run on a process restricted to one CPU: 20 full
observations were collected. Unchanged Night reached 33.2 ms once; all candidate
medians were 16.7-16.8 ms. This small local result does not establish a repair.

The CI surface matrix runs after either outcome of the original certification,
with its failure still preserved. It retains the original cold-launch ordering,
18-frame sampler, scene assertions and 21 ms limit for 20 observations. It then
separately captures fixed poses using the same injected candidate implementation
and checks decoded PNG pixels exactly, without tolerance. Six additional
unchanged-versus-unchanged comparisons check capture determinism. All 36 images,
30 comparison results, image hashes, original/derived/probe script hashes and
renderer metadata are retained. Missing captures or changed pixels fail the
diagnostic. Fixed-pose images are never used as frame-timing evidence.

```sh
CONTEXTUAL_PROBE_SUITE=surfaces node scripts/probe-contextual-layers.mjs
```

Only a candidate with preserved appearance and a demonstrated timing benefit
can progress to a separate product patch and broader responsive validation.
The diagnostic does not rebind existing visual reviews or certify Android.
