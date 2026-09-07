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

Local controls preserve all 14 original capture cases and test four combinations
of native success/failure and trace retrieval success/failure. Full check and
security remain required before updating the branch. Results belong to the PR
body once the trace artifacts have been collected and inspected.

Primary documentation:
- https://perfetto.dev/docs/learning-more/android
- https://perfetto.dev/docs/reference/perfetto-cli
- https://perfetto.dev/docs/data-sources/atrace
- https://developer.android.com/studio/run/emulator-acceleration

No timeout, threshold, source security setting, merge or deployment changes.
