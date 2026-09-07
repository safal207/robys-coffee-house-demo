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
- https://perfetto.dev/docs/learning-more/android
- https://perfetto.dev/docs/reference/perfetto-cli
- https://perfetto.dev/docs/learning-more/tracing-in-background
- https://perfetto.dev/docs/data-sources/atrace
- https://developer.android.com/studio/run/emulator-acceleration

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
