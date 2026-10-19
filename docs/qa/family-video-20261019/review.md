# Family combo video: actual visual review

Feature head: `6a4dcecbdf3e30759cea794985b41f93d88a2497`. Tree: `28fd4066c95fdf92f2678b7e52bb36e2a9c7fe6c`. Chromium 140.0.7339.186. This is implementation QA evidence, not independent human approval or physical-device testing.

The three PNGs show the real reviewed local video in the unchanged production combo dialog. Captures use the original menu CSP over local HTTPS. The Watch video control was clicked, the native video was focused, and the pointer was moved over its controls so the controls are visible. Dialog scrollTop is zero. No image editing, compositing, cropping, simulated video frames or runtime/source modifications were used.

| Viewport | Playback before → after capture | Decoded source | PNG |
| --- | --- | --- | --- |
| 320 × 780 | 1.952 → 3.042 s | 688 × 464 | [chromium-family-video-320x780-ru.png](chromium-family-video-320x780-ru.png) |
| 390 × 844 | 2.857 → 3.042 s | 688 × 464 | [chromium-family-video-390x844-ru.png](chromium-family-video-390x844-ru.png) |
| 1440 × 1000 | 1.632 → 3.042 s | 688 × 464 | [chromium-family-video-1440x1000-ru.png](chromium-family-video-1440x1000-ru.png) |

Before each screenshot, readyState was 4 and the video was unpaused and unended. The 3.042-second clip reached its natural end by each post-screenshot observation (paused:true, ended:true); these observations are retained rather than described as continuous playback after capture. Manual inspection of each PNG shows native video controls with a pause icon and elapsed time during the shot. The selected source was the reviewed family-motion-v1.webm at 688 × 464.

## Observed visual state

- At 320 ×780, the logo, offer badge, close control and complete title fit. The audience wraps to two lines without overlap. Native pause, time, mute, fullscreen, menu and seek controls are visible, and the red return-to-photo action is fully visible.
- At 390 ×844, the header/title fit, the audience stays on one line, and native controls and the return-to-photo action remain visible.
- At 1440 ×1000, the 660-pixel dialog stays centered and within the viewport; its header, player, native controls and return-to-photo action are visible.
- At all three sizes, object-fit:contain preserves the source frame ratio; native controls use their normal overlay at the lower edge. Geometry checks found no page horizontal overflow or clipped app controls. The remaining recipe editor is reached through the dialog's vertical scrolling.

The capture harness passed 3/3 visual cases. Start/end Git heads and trees match; tracked status is clean at both boundaries; source, emitted runtime, CSS, media and service-worker hashes are unchanged. Exact viewport and element bounds, native playback states, PNG hashes and source hashes are recorded in [manifest.json](manifest.json) and [report.json](report.json). The executed capture script is frozen as [capture.mjs](capture.mjs).

This visual review covers the captured Chromium states. It does not replace required final-head browser, security or publication checks.
