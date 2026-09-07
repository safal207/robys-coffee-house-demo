# PR #342: isolate Android render latency

This diagnostic compares the immutable base
`5b01276b99db719cae2fc72f29d38eb00c9953f4` and product head
`409eef86b76749c0af35847447012cd13f47e7a6`. A third run uses the same head
with explicit `-gpu swiftshader`, while both original controls retain
`-gpu software`. These are independent cold emulators, not device benchmarks.

Prior artifact 10003825719 shows frames with 7.31 seconds between
IssueDrawCommandsStart and SwapBuffers, compared with 8.78 ms of UI work
(HandleInputStart to SyncQueued). This locates a long render-side interval; it
does **not** by itself identify CPU computation, a driver wait, or a GPU fault.
The same mechanism exists in base artifact 10003831130 (7.82 seconds).
Previous workflow logs identify Emulator 37.1.11.0 and the automatic software
selection as Vulkan Lavapipe plus GLES SwANGLE, with guest HWUI skiagl. No
presumption that SwiftShader repairs it is made.

The original recorder, screenshots, 30-second observation window, native
deadlines, terminal failures, and ordering assertions remain intact. A temporary
capture copy only inserts Perfetto startup after the existing cold-provider
settling. Neither MainActivity nor the web runtime gains new instrumentation;
the existing pinned transport remains the sole APK instrumentation.

The 60-second trace uses bounded buffers and records scheduling, process/thread
identity, Android render/view/WebView events, logcat and frame timelines. A
read-only host sampler records QEMU thread CPU ticks once a second for at most
120 seconds. It reads no command arguments or environment variables. Clock
samples bound host/guest wall-clock alignment. The collector preserves the
original capture exit even if trace retrieval also fails. A missing trace after
native success makes the diagnostic collection fail.

Each archive includes the trace config, original/derived script hashes, diff,
sampler hash and data, source/asset manifest, original handoff evidence and
independent resource identity result. Analysis must inspect trace data-loss
stats and verify that NATIVE_SURFACE through the terminal/completion event is
covered. Missing events or decoder errors are incomplete observation, not proof
of idleness. Tracing adds overhead and is not an alternative acceptance gate.

Local controls preserve all 14 original capture cases and test ten combinations
of native success/failure and delayed writer completion, failed wait, failed
retrieval, empty trace, or missing close event. Full check and
security remain required before updating the branch. Results belong to the PR
body once the trace artifacts have been collected and inspected.

Primary documentation:

- [Android tracing](https://perfetto.dev/docs/learning-more/android)
- [Perfetto CLI](https://perfetto.dev/docs/reference/perfetto-cli)
- [Background tracing and file closure](https://perfetto.dev/docs/learning-more/tracing-in-background)
- [ATrace](https://perfetto.dev/docs/data-sources/atrace)
- [Emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration)

No timeout, threshold, source security setting, merge or deployment changes.

## First collection: incomplete system evidence

Run 34084052432 at tooling head `a8e176f07f2630727d3d33217461ac482bdfee32`
reproduced VISUAL_STATE_TIMEOUT in all three subjects. Resource identity passed
in each job. Explicit SwiftShader did not suffice in this observation. However,
all three `launch.pftrace` files were empty: these runs cannot identify scheduler
or renderer causes. Native failure remained failure (`capture_exit=1`); a
successful `adb pull` did not establish successful trace collection.

Verified archive SHA-256:

| Subject | Artifact | SHA-256 |
| --- | --- | --- |
| base | 10004706470 | 66e8c9b4d16626d5be76042ebc4fd3f5ef09dad4c0f8e473225f15160cd2ea76 |
| head | 10004728633 | 6e4526d978a66b129bb5130c10175c16dc1c17c4d0d356c2c4b4fb07efcc3cd6 |
| head-swiftshader | 10004737130 | f4f82336e5991f0fa78146c35df69e1903deabedb6b168455cea4f0486f47d5d |

The first follow-up let the configured 60-second session complete, attempting
to wait for the writer process to exit before retrieval. Run 34084946381 base
artifact 10004975892 (verified ZIP SHA-256
`b6e20a3d733caec0b13e4f2fb3f59f35f19a7dd1ac1672281dfa9dd6c035a047`)
still had an empty trace. Final collector logcat reveals the specific failure:
SELinux denied `signull` from `shell` to `perfetto`. Thus a failed `kill -0`
did not establish process exit. This supersedes the process-wait approach.

The collector now installs a bounded, read-only `inotifyd` watcher immediately
after trace startup, before the native launch, and waits for the file's writable
close event. It never signals the Perfetto process. The watcher and event file
use existing shell access; SELinux and all other security settings stay intact.
Wait status, close event, watcher errors, pull status and nonempty status are
independent evidence. Final collector logcat retains trace-service errors. This
is collection plumbing, not an Android performance repair; the next trace still
needs decoding, coverage and loss checks before causal conclusions.

## Verified trace result at tooling head 708bf6c

Run [34085557929](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34085557929)
used tooling `708bf6c82433f98206eb5e685034986dabad8dcd`, immutable base
`5b01276b99db719cae2fc72f29d38eb00c9953f4` and immutable product head
`409eef86b76749c0af35847447012cd13f47e7a6`. Tooling changes since that product
head affect six QA/workflow/documentation files only. Product/native bytes and
all 251 current visual review bindings are unchanged.

All three collectors observed the writable-close event, had no watcher errors,
and returned wait/pull exit zero with nonempty files. Perfetto Trace Processor
v58.2 (`add693d8b338ba9599dbcbc3e300b1ab8c000897`) decoded each trace without
errors. No nonzero `stats` rows with severity `error` or `data_loss` were reported.
Trace bounds include every handoff event. Main and RenderThread scheduling
coverage equals the complete NATIVE_SURFACE-to-terminal/completion interval in
each trace: 22056.078 ms base, 28817.463 ms head, 9714.849 ms SwiftShader.

| Subject | Native capture | Longest drawGl fully inside handoff interval | UI postAndWait in corresponding frame |
| --- | --- | --- | --- |
| Base, software | FAIL, VISUAL_STATE_TIMEOUT | 7833.854 ms | 7847.235 ms |
| Head, software | PASS, documented fallback | 5901.219 ms | 5642.265 ms |
| Head, SwiftShader | PASS, documented fallback | 5320.158 ms | 5364.785 ms |

The base's long `WebViewFunctor::drawGl` slice starts 8522.055 ms after
NATIVE_SURFACE, almost immediately after WEB_COMMITTED. Its RenderThread spends
6371.242 ms sleeping, 979.832 ms runnable/preempted and 482.595 ms running.
The app's Chrome_InProcGp thread runs for 2440.910 ms during the same slice.
Meanwhile the UI is inside `postAndWait`; this is an observed render wait, not
7.8 seconds of UI JavaScript computation. The trace has no nested drawGl slices
or blocked-function names that identify the exact driver call.

Read-only host counters corroborate active emulator render work: for a
conservatively clock-aligned 7.181-second interior of that base draw, QEMU
threads named RenderThread accumulated 6.950 CPU seconds. All QEMU threads
accumulated 21.510 CPU seconds. This supports a graphics/emulator bottleneck
inference, not proof of a GPU defect, a specific shader, or pure CPU saturation.
Host thread names can be shared by multiple threads; CPU totals are aggregated.

The same long render-wait mechanism is present before pairing, so pairing is
not necessary for it. These independent runs do not estimate failure rates or
exclude added precache load in every head launch. Head sw.js/menu.html were
served at 05:11:35.506/35.717 and pairing-posters.css/js at 05:11:43.437/43.441,
before this run's completion at 05:11:46.266. Do not generalize earlier
after-timeout resource ordering to all launches.

Explicit SwiftShader is **not a demonstrated repair**: it failed in both prior
trace attempts and still has a multi-second render wait here. The ordinary
software head also passed this traced attempt. Both untraced pinned base/head
in run 34085557784 failed VISUAL_STATE_TIMEOUT on the same tooling head.
Tracing and transport add overhead; these controls are not physical-device or
production-network benchmarks. A passing state sequence is not a wall-clock
responsiveness certificate: UI-handler timers can themselves be delayed while
the UI waits for rendering.

### Verified artifact identities

Each ZIP digest below was checked after download. Manifest hashes, original
source identities, complete archived APK inventories, all logged delivery
hashes and trace-script/config/sampler hashes were checked. CI separately
verified actual APK asset bytes. Each APK binds 238 source resources; observed
delivery counts were 202 base, 199 head and 198 SwiftShader.

| Subject | Artifact | ZIP SHA-256 | Trace bytes |
| --- | --- | --- | --- |
| Base | 10005182705 | ac6e6a8cfd381750c13fd09a6278d9330c78d049de6beff4fa4aedee7b6f731c | 58842197 |
| Head | 10005182231 | a2af5ba36eaf03e458e8566fb8fbc906204c865c2d608431de51fb8e5ec5f35f | 55396026 |
| SwiftShader | 10005191801 | e4bcedf88209c0e0b48a25dc17c95955e03980e70b3baac0401814571eb85660 | 51649512 |

Trace SHA-256, in the same order:

- `c6ff75f2f35407c5c417a3d60d26b8c733561dae6632f6644911b4339ce639bc`
- `5cf9fb505418cbd63c2ec19c9ab72da339033aa52ebdb2bdf9000e53e3069e6a`
- `e096efee150e23acf6055592db6948a3f8fc6ba37bd99ae6764114d9c70db379`

The preceding head `0e72dae` must retain separate native/collection results:
base and SwiftShader had native failures; software head completed via fallback.
All three system traces were empty, so all three diagnostic jobs were red.
Additional verified ZIP digests: head artifact 10004984720
`8dc1520e71c26c5a19be36283b42fdf74d202ee1112c451b2b9f5ef34af1bd43`;
SwiftShader artifact 10004999624
`901e10155176cd11c1256a74b0e60277724399e0023e0448244491d7ed61d86a`.

### Other gates on 708bf6c and smallest safe disposition

Pairing regression passed. Contextual failed Day at 33.30 ms against the
unchanged 21 ms limit; Morning passed at 16.7 ms, Night/routing/offline were
not run after failure. Contextual artifact 10005099723 has verified ZIP SHA-256
`42abce799168f0bcb04b093437f0f9f3a9b2687199f1ca9bc65847789de8903f`, internal
source exactly `708bf6c82433f98206eb5e685034986dabad8dcd` and empty tree diff.
The earlier identity probe found all 46 contextual paths equal to base; these
QA commits change none of them. The scene/runner instability remains unresolved.

Visual run 34085557815 is **FAIL**, despite the retained share-capture repair.
All six share crops have zero diff in both attempts. Attempt one has only the
four specifically reviewed menu-height changes. Attempt two additionally has
42658 differing landing-full/desktop-1440 pixels out of 10213920
(0.004176457227, above 0.004). The verifier correctly rejects this fifth diff.
Visual artifact 10005187530 has verified ZIP SHA-256
`0fa336be1bb0faab7b66347819408d60565812f8dbfbc26b44ef5558a618b0d1`; both source
checkouts are clean and equal to the exact base and tooling head above.

The first landing base/head images match exactly. The base landing is identical
between attempts, while the second head image omits painted map elements and
parts of the Android promotion block. The six directly relevant files
index.html, app.js, conversion.js, styles-v2.css, map-live.css and android-app.css
are byte-identical to the exact base. The artifact records loaded fonts and
11 images on both sides, but lacks per-layer paint/DOM state needed to establish
the missing-paint cause. Treat this as observed capture variance, not an approved
design change or an established lazy-loading cause. A bounded follow-up would
compare ordinary visible-viewport and full-page captures with element/layer
readiness evidence, preserving missing-content rejection.

The original public-web Android smoke also failed VISUAL_STATE_TIMEOUT; it does
not pin web bytes to this PR. Keep draft/HOLD. Retain the confirmed fractional
share-origin repair and the now-verified trace collector. Do not raise limits,
add landing masks, broaden reviewed differences, or ship speculative native,
video, containment or backend changes. A product repair needs a controlled
intervention that removes the render wait while preserving the original gates.

This report-only follow-up also corrects its six Markdown formatting errors
(MD032/MD034) reported by Reviewdog. It changes no runtime or diagnostic code.
