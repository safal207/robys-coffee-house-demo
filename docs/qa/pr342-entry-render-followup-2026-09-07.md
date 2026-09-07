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

The first surface run, 34092569025 on `7031d4d`, failed before collecting the
candidate matrix because the contextual workflow does not normally install
`pngjs`. Its original Day gate independently failed at 33.3 ms. This is an
incomplete diagnostic, not a negative candidate result. The follow-up installs
the same pinned PNG decoder used by the visual workflow (`pngjs@7.0.0`) in a
temporary, separate dependency directory with lifecycle scripts disabled. It
does not reinstall or replace locked application/Playwright dependencies. The
default optical-only diagnostic does not load the PNG decoder.

## Bounded front-face product candidate

Surface CI run 34093016171 on exact `58f30c5f6708395eb30f3e95efccbaffd6ba1e38`
completed both the unchanged certification and the diagnostic. Artifact
10007609603 has verified ZIP SHA-256
`46e4221c0b63e87fa2d74d51a3651f725cc85b870aff626753364ec4ec35ccc5`.
All 20 observations contain 18 original samples; source/derived/probe identities
and all 36 PNG hashes were checked. All 30 fixed-pose comparisons, including six
unchanged controls, had exactly zero differing decoded pixels.

| Variant | Day/Night medians, forward then reverse round (ms) | Within 21 ms |
| --- | --- | --- |
| Unchanged | 33.3, 33.3, 16.8, 16.7 | 2/4 |
| Rectangular clip | 33.3, 33.3, 16.7, 33.3 | 1/4 |
| Foreground filter hint | 16.8, 33.3, 33.3, 16.7 | 2/4 |
| Hidden back faces | 16.7, 16.7, 16.8, 16.7 | 4/4 |
| Automatic isolation | 16.7, 16.7, 16.7, 16.7 | 4/4 |

This small comparison supports a candidate; it does not establish a failure rate
or a completed product repair. Chromium was 140.0.7339.186 with software GPU
compositing/raster and SwiftShader, as recorded in the artifact.

The selected product change applies `backface-visibility: hidden` once to entry
descendants. All existing poses use positive scale and never rotate surfaces
away from the viewer. It retains every gradient, shadow, static blur, perspective,
20 poses, seven animations, duration and reduced-motion path. Bootstrap and
offline revisions move together to `20260907-frontface-v26`; generated cache
references and the integrity manifest are rebuilt.

Broader local static checks covered 320 x 740, 768 x 1024 and 1440 x 900, each
at Day/Night fractions 0.2, 0.6 and 0.9. An initial capture that paused animations
after first paint varied even for unchanged-versus-unchanged controls at 768px.
Those mismatches cannot attribute a defect to a candidate. Pausing/seeking each
entry animation at creation, before its first paint, and then holding lifecycle
timers produced zero differing pixels in all 18 back-face comparisons, all 18
isolation comparisons and all 18 unchanged controls. This establishes bounded
static appearance equivalence; it does not identify an internal browser bug or
certify moving-frame performance. The diagnostic now uses that capture protocol
only for still images. The original timing sampler is unchanged.

Local candidate evidence and exact changed resource bindings are retained in
`qa/evidence/pr342-frontface-candidate-2026-09-07.json`. The untouched Contextual
gate passed (Day cold 1262.4 ms, Night 1703.3 ms, warm 701.3 ms), as did the full
Premium depth contract. A separate product diagnostic collected 16 timing
observations but did not finish its final static control; it is incomplete and
is not accepted as completed evidence. Full `npm run check` and
`npm run verify:security` passed, including 287 security checks and the secret scan.
These are working-tree candidate results over 58f30c5, not runtime results for
the unchanged parent commit.

CI will now compare the actual product candidate with a reverse intervention
that restores visible back faces, in four alternating-order rounds (eight
Day/Night observations per side). Both preserve the original cold ordering,
18 samples and 21 ms assertions. Twelve exact static comparisons include six
unchanged controls. Diagnostic completeness never overrides certification.

Existing Visual bindings are deliberately not refreshed before seeing all 43
comparisons for the changed product bytes. The current four precisely reviewed
menu-height differences remain the only eligible exceptions. A stale-binding
failure on this candidate must be resolved by inspecting the new complete
artifact before rebinding; no threshold or fifth exception is introduced.

No Android runtime or native deadline changes are included. On 58f30c5 the
original Android smoke failed while the two pinned base/head diagnostic jobs
passed; that mixed outcome does not demonstrate an Android repair. Android uses
its separate handoff runtime and does not inherit this Day/Night optimization.


## Front-face rejection and automatic-isolation candidate

Exact candidate `10d64cab8e76834f39cfc20a5296920a7843221b` failed the original
Contextual gate at Night 33.2 ms in run 34095261869. Its four-round counterfactual
comparison found hidden back faces within the 21 ms limit in 7/8 observations,
while restored visible back faces passed 8/8. All 16 observations have 18 samples;
all 12 fixed-pose comparisons have zero changed pixels. Verified artifact
10008457976 has ZIP SHA-256
`0f55f5d4dfa1c0401a78cb3b8f3ef83b0005512f4ee6be1b26819ff3adc08eb8`.
Original/derived/probe hashes and every retained PNG hash were checked against
that exact head. The initial four-case signal did not reproduce. The back-face
product change is rejected and removed; it is not retained as an optimization.

Visual run 34095261937 on 10d64ca contains 43 comparisons in each attempt, with
only the same four exact menu-height differences. Its verifier rejects stale
content bindings, as required. Artifact 10008471664 has verified ZIP SHA-256
`ab25a7643a1e44ba11f2bb7aebe79cdc5489c7ea6175bedcd8408001b2e08b5d`.
Pairing, original Android and both pinned Android jobs passed on this head;
unchanged Android code and earlier base failures prohibit an Android repair claim.
The report's single newly introduced MD012 blank-line error is also corrected.

The remaining preselected surface candidate changes the overlay and logo-stage
isolation from `isolate` to `auto`. Both already create stacking contexts through
position/z-index or transform. It changes no geometry, material, assets,
animations or release timing. The two-line candidate previously had four valid
CI timing observations and exact static equivalence at 390/320/768/1440px.
It now receives an independent four-round comparison with a reverse intervention
restoring `isolate` on both containers. The first candidate's contradictory
result is retained, not replaced by a passing rerun.

With the corrected before-first-paint capture, another six-pose check confirmed
that logo-filter promotion and removing static-layer hints still change pixels
(up to 77874 and 221331 respectively); those candidates remain rejected.
Automatic isolation and unchanged controls again matched exactly. None of these
still images substitute for the original timing certification.

Local original Contextual and Premium depth gates passed on the automatic-
isolation working tree over 10d64ca (Day 1262.7 ms, Night 1702.9 ms, warm 701.2 ms).
Full check/security passed. Exact product bindings, original samples, rejected
counterfactual samples and static controls are recorded in
`qa/evidence/pr342-isolation-candidate-2026-09-07.json`. Runtime/cache revision
is `20260907-isolation-v27`. Visual bindings remain unchanged pending complete
new-head comparisons. Android runtime, capture deadlines and all limits are
unchanged; this is still a draft candidate, not a completed repair.
