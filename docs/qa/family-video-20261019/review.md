# Family combo video: actual visual review

Feature head: `f8f1c1e9fb0f17386f06ade15e45105cc9f09210`. Chromium 140.0.7339.186. This is implementation QA evidence, not independent human approval or physical-device testing.

All three PNGs show the real local video playing in the unchanged production combo dialog. The captures use the original menu CSP over local HTTPS. The Watch video control was clicked, the native video was focused, and the pointer was moved over its controls to keep them visible. Dialog scrollTop is zero. No image editing, compositing, cropping or simulated video frames were used.

| Viewport | Playback before → after capture | Decoded source | PNG |
| --- | --- | --- | --- |
| 320 × 780 | 0.611 → 0.973 s | 688 × 464 | [chromium-family-video-320x780-ru.png](chromium-family-video-320x780-ru.png) |
| 390 × 844 | 0.876 → 1.396 s | 688 × 464 | [chromium-family-video-390x844-ru.png](chromium-family-video-390x844-ru.png) |
| 1440 × 1000 | 1.134 → 2.874 s | 688 × 464 | [chromium-family-video-1440x1000-ru.png](chromium-family-video-1440x1000-ru.png) |

In every capture, readyState was 4 and playback was unpaused and unended both before and after the screenshot. The actual selected source was the reviewed family-motion-v1.webm (688 × 464). Chromium in this environment does not include the H.264 decoder; the same family clip is offered as MP4 and WebM.

## Observed visual state

- At 320 × 780, the logo, offer badge, close control and complete title fit. The audience wraps to two lines without overlap. Native pause, time, mute, fullscreen, menu and seek controls are visible. The red return-to-photo action is fully visible.
- At 390 × 844, the same header and title fit, the audience stays on one line, and the native controls and return-to-photo action remain visible.
- At 1440 × 1000, the 660-pixel dialog stays centered and within the viewport, with the header, player, native controls and return-to-photo action all visible.
- At all three sizes, object-fit: contain preserves the source frame ratio; native controls use their normal overlay at the lower edge. Geometry checks found no page horizontal overflow or clipped app controls. The dialog itself is scrollable for the remaining recipe editor.

The capture harness passed 3/3 visual cases. Start/end Git heads are identical; tracked status is clean at both boundaries; source, emitted runtime, CSS, media and service-worker hashes are unchanged. The full exact viewport, element bounds, play times, PNG hashes and source hashes are recorded in [manifest.json](manifest.json) and [report.json](report.json).

This review is limited to the captured Chromium states. It does not settle the separate WebKit media investigation or replace the required final-head browser checks.
