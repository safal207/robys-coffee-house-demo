# PR346: discriminate inherited rendering costs

The original-subject internal trace in run `34193319271`, tooling `54a73c9`,
reproduces VISUAL_STATE_TIMEOUT after WEB_READY. Its closed internal JSON has
110705 events; all 16 archived native/preparation/capture/config files match a
fresh local reconstruction. Raw artifact SHA256:
`58e43c0fd46104ce7b83a483a6ac3cb06854fc07f837626ec16492625442b1c7`.

During the 3378.448 ms first expensive draw, the GPU thread's shader_compile
interval union is 2523.640 ms and its raster-flush union is 2804.062 ms. Those
families nest and are not additive. The outer shader_compile scope includes
program setup; it is not solely driver compilation. Another 1500.271 ms draw
spans WEB_READY and almost the whole visual-callback deadline. Internal trace
arguments are stripped, so neither a shader nor a sync token identifies its DOM
owner. The external trace has no nonzero loss/error rows. The JSON importer
reports one overlapping-complete-event spill, which preserves data but makes
that event's nesting ambiguous. Clock alignment is a source-based inference,
supported by the device's paired monotonic/boottime snapshots; no shared marker
establishes an exact synchronization.

## Bounded interventions

All three subjects use the same original native implementation and 240 pinned
web files. Both candidate effects are byte-identical between main e3 and original
7ca. These are visual diagnostic interventions, not proposed product repairs.

| Arm | Immutable source | Change |
| --- | --- | --- |
| Control | `7ca13b9adbf45b953c3b0997107d010e7bad1d9b` | Original product |
| Hero noise | `c7aa16dd2d44f59605c613c27af39fefd925bc66` | Only hero noise background becomes none; required cache/integrity derivatives follow |
| Bridge filters | `3801d9fa6e7594c13f6d75c2f6d101b509c747ca` | Only focus blur and two logo filter declarations become none; integrity follows |

The workflow binds each exact source to its distinct complete web inventory
digest. Observer preparation accepts that explicitly declared source/digest,
while retaining the original defaults and every original identity/capture gate.
The derived capture scripts differ only in their native-source SHA stamp;
normalizing that one declared stamp gives identical assertions and recording.
The diagnostic writer, categories, 35-second timer and collector are unchanged.
Each fresh runner keeps API36, software GPU, two default guest CPUs, enabled
animations, 120-second emulator-only idle, original cold-provider wait, original
native deadlines, recorder and assertions. Fail-fast is disabled so one product
failure does not erase another arm's evidence.

Local geometry checks preserve hero, cover, stage, focus and logo rectangles,
visibility, opacity, colors, transforms and readiness. This does not establish
identical pixels or Android performance. The source build/integrity derivatives
are retained and declared, not silently bypassed. No approved visual allowance,
baseline or threshold changes. No candidate is added to PR346.

Compare original native outcomes, expensive-draw GPU operations and the full
post-outcome video/system trace. A green marker alone is insufficient. A useful
result narrows the next visual-preserving repair; these three observations do
not establish a general latency distribution, physical-device behavior, or a
merge/deployment approval.
