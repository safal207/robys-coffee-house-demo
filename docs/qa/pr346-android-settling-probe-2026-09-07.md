# PR346 Android startup-settling diagnostic

This is an isolated experiment, not a product change or a relaxation of handoff
deadlines. It does not approve the rejected preraster candidate.

## Question

Does unrelated emulator/system startup work contribute to guest CPU starvation
and the long synchronous WebView draw wait? Compare one additional idle interval
before the unchanged first-app capture, not a longer in-app timeout.

Both arms build exactly the original subject
`7ca13b9adbf45b953c3b0997107d010e7bad1d9b`. Neither tested APK includes the three-line
native preraster candidate. Diagnostic tooling descends from `d88ab8ec`; its own
native files are never built. Fixture creation archives the pinned subject.

| Arm | Extra idle interval before original capture |
| --- | --- |
| Control | 0 seconds |
| Intervention | 120 seconds |

Both subjects contain the same 240 pinned web files, with sorted compact JSON
inventory SHA256
`2c97e25ebf4e0c2b16f50818bc3a577b569a5d18a0f623ed21e498ff26e4395c`.

## Controlled boundaries

The helper records requested and elapsed idle time, monotonic timestamps and
completion state. It executes before the original capture installs or launches
the app. It issues no adb, app or WebView-provider warmup commands. Android's own
background work may naturally change during this interval; that is part of the
intervention, not evidence that the provider remains globally untouched.

The fresh API36 image, software GPU mode, animations, pinned transport, original
20-second capture settling, first app/provider launch, recorder and all product
deadlines remain unchanged. No snapshots are restored. Perfetto still captures
60 seconds around launch; the original video still records 40 seconds. Original
capture and trace-collection failures retain their independent failure status.

## Interpretation

Compare actual handoff states, native cover and product pixels, guest scheduling
and render waits. Require valid trace coverage through ten seconds after any
completion marker before concluding a wait disappeared. A PASS marker alone,
readiness fallback or a stall moved after reveal cannot establish a repair.

If the waiting arm improves, the result supports sensitivity to the emulator's
startup state. It does not identify which background service caused contention,
prove all-device stability or authorize adding a two-minute product splash.
One pair is bounded diagnostic evidence. Neither arm has been run as part of
preparing this document; no merge, deployment or PR346 runtime change is made.
