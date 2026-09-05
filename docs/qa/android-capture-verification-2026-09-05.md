# Android capture verification — 5 September 2026

## Scope and unchanged release requirements

This change improves the API 36 CI harness; it does not claim that the production
handoff is repaired. Native Java, ready/visual deadlines, animation settings,
required states and state-order assertions are unchanged. Main and Pages are not
modified. The public web deployment is not pinned to the feature branch: the
artifact now records this boundary explicitly alongside native source and APK hash.

The complete earlier run 33943632059 reached WEB_READY, then VISUAL_STATE_TIMEOUT.
Renderer stalls are visible in its logcat. Resource contention is a hypothesis,
not a proven exclusive cause. Run 33944210696 was canceled, not a new timeout.

## Harness improvements

The workflow stops the build daemon before cold emulator launch and uses the
supported software GPU backend in place of deprecated swiftshader_indirect.
Video is captured at 540x1200 to reduce software encoder contention; screenshots
remain native resolution. This is state-transition evidence, not a physical-device
FPS measurement. No product timeout was increased.

The EXIT trap preserves the original failure status while collecting bounded
logcat, window and WebView-provider diagnostics. SIGINT/SIGTERM retain nonzero
status. Artifact names identify the checked-out PR head rather than a merge SHA.

## Local contract evidence

The exact capture script blob tested was
`148cee67b4587fb540ec362c293bb666ce8c7213`, introduced on the isolated candidate
`071ed1169d91b797650d1e54adcda9aaaaf89589`.

Nine isolated fake-adb scenarios passed: normal completion, allowed ready fallback,
visual timeout, absent visual confirmation, out-of-order states, absent commit,
short video, install error and SIGTERM. Expected exit statuses were respectively
0, 0, 1, 1, 1, 1, 1, 23 and 143. Diagnostics were retained in every case; failed
cases produced no success summary. This is harness verification, not app testing.
The permanent Python test runs before the real emulator workflow.

The isolated real-emulator run 33944806689 was queued at the time of integration;
there is no successful native readiness result in this note. Current-head CI,
visual approval, independent review and post-deploy checks remain release gates.

## Cleanup

The obsolete bounded-repair transport workflow is removed. Its run 33944544108
failed the exact-parent precondition before source changes and produced no
validated runtime candidate. Parallel menu/conversion compaction is preserved.
