# PR346 Android preraster diagnostic

This branch is a bounded experiment, not a product repair or release approval.
The existing PR346 Android smoke and all thresholds remain unchanged.

## Subjects

| Role | Immutable native source |
| --- | --- |
| Control | `7ca13b9adbf45b953c3b0997107d010e7bad1d9b` |
| Candidate | `292124321f3702ca6c6dfbae10c327788ba7cc23` |

The candidate changes exactly three native lines: keep the covered WebView
`INVISIBLE` before loading, enable offscreen preraster, and make it `VISIBLE`
inside the existing guarded visual callback immediately before splash dismissal.
Its tree is `44dc68c9fe999c9ba9d2f7d54c93e187a5a6818d`.
The JS bridge, readiness states, trusted URL/generation guards and deadlines
are unchanged. Both subjects contain exactly the same 240 pinned web files.
The SHA256 of the sorted compact JSON resource inventory is
`2c97e25ebf4e0c2b16f50818bc3a577b569a5d18a0f623ed21e498ff26e4395c`.

## Hypothesis and limits

Avoiding an onscreen draw of a covered WebView may remove the synchronous
render-thread wait seen in an earlier trace. The precise internal operation
responsible for that wait remains unknown. A faster callback alone cannot prove
the wait was removed: it may have moved to the first visible WebView draw.

The current pinned base/head comparison does not establish pure inheritance:
the base completed only through the documented readiness fallback, while the
head reached a terminal visual callback timeout. Both missed `WEB_READY`.
Do not describe the base as a healthy readiness control.

The Android API supports an attached `INVISIBLE` WebView made `VISIBLE` directly
from `VisualStateCallback.onComplete`. Preraster increases raster memory usage;
this experiment uses one WebView no larger than the screen. The callback covers
DOM/image/CSS/WebGL state but does not guarantee video state. The existing web
bridge still waits for two animation frames; readiness must be observed, not
assumed or manufactured.

Sources: [WebView visual callback](https://developer.android.com/reference/android/webkit/WebView#postVisualStateCallback(long,%20android.webkit.WebView.VisualStateCallback))
and [offscreen preraster](https://developer.android.com/reference/android/webkit/WebSettings#setOffscreenPreRaster(boolean)).

## Experiment and interpretation

Two independent fresh API36 emulator jobs use the same pinned transport, software
GPU mode, 60-second Perfetto configuration, original 40-second recorder, and
capture assertions. The trace collector waits for file closure and retains the
original capture exit. CI logs expose capture exit, handoff events, provider,
resource delivery and frame statistics; full evidence remains in the artifacts.

Require valid trace coverage through at least ten seconds after completion before
concluding that a render stall disappeared. Compare long WebViewFunctor draw and
UI postAndWait slices before reveal and during that post-reveal interval, plus
recorded pixels and subsequent motion. Missing coverage is inconclusive.
The nominal trace duration is not evidence that the required interval was captured.

Successful fallback is not repaired web readiness. A missing visual callback,
blank first frame, increased fallback use or a stall shifted after reveal rejects
the candidate as a complete repair. One A/B pair is diagnostic evidence only;
retry, stale callback, duplicate callback and lifecycle coverage remain necessary
before any later product promotion. No merge or deployment is performed here.
