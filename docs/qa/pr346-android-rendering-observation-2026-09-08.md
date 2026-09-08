# PR346: internal WebView rendering observation

This diagnostic reconstructs the unpublished observer preparation after workspace
maintenance removed the previous local files. Recreated files require new hashes
and validation; they are not claimed to be identical to the earlier preparation.

## Why more observation is needed

Preraster run `34157499679` moved a 6.762-second draw after HANDOFF_COMPLETE and
exposed a blank screen. Settling run `34158944236` reduced guest CPU contention,
but a 6.454-second draw still crossed the completion marker. Within the latter,
the Chromium GPU thread ran for 4.900 seconds and was runnable/preempted for
0.990 seconds. Both apparent fixes are rejected. A proposed 2/4-vCPU comparison
was not run because graphics computation dominates the remaining scheduling
delay. Existing system traces do not identify the internal GPU operation.

## Subject and declared instrumentation

The workflow packages immutable `7ca13b9adbf45b953c3b0997107d010e7bad1d9b` and
the same 240 web files, with inventory SHA256
`2c97e25ebf4e0c2b16f50818bc3a577b569a5d18a0f623ed21e498ff26e4395c`.
The native diagnostic adds the pinned transport and a WebView tracing helper.
Original, transport and final native hashes, helper hashes and replayable diffs
declare those changes. This is not an unchanged production APK or DEX proof.

The original capture, recorder, deadlines, animation scale, software GPU and
60-second system trace remain unchanged. An additional 120-second emulator-only
idle interval matches the prior settled case; the existing 20-second capture
wait remains. No app/provider warmup command is added.

## Observer and collection boundary

Tracing starts after WebView configuration, before trusted loading, using the
RENDERING and ANDROID_WEBVIEW presets plus the verified Chromium 133 categories
`disabled-by-default-gpu.service` and `disabled-by-default-skia.shaders`.
The mode is RECORD_UNTIL_FULL. A separate Handler requests stop after 35 seconds;
destroy requests an early stop. An existing tracing session is left untouched.
No observer event controls navigation, bridge readiness or splash removal.

Successful stop is not output completion. The writer records completion only
after OutputStream.close; I/O failures remain sticky. Collection requires timer
completion, matching nonzero byte count, valid timestamps, zero I/O errors,
parseable traceEvents and actual GPU events. Original probe failure retains its
exit code even when observation collection or final reporting also fails.

Valid collection is not a repaired handoff. Analysis must verify emitted events
cover the expensive draw, align clocks, and avoid adding overlapping nested
durations. Absent shader events do not exclude shaders. Start-return timestamps
expose setup cost; tracing adds overhead. No merge, deployment, PR346 native
patch, threshold change or physical-device claim follows from this observation.

## Primary sources

- <https://developer.android.com/reference/android/webkit/TracingController>
- <https://developer.android.com/reference/android/webkit/TracingConfig.Builder>
- <https://raw.githubusercontent.com/chromium/chromium/133.0.6943.137/base/trace_event/builtin_categories.h>
- <https://raw.githubusercontent.com/chromium/chromium/133.0.6943.137/android_webview/glue/java/src/com/android/webview/chromium/SharedTracingControllerAdapter.java>
