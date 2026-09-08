# First Android commit callback deadline — 8 September 2026

The first main-frame callback could cancel the 24,000 ms hard timeout after
expiry, when delivered before the overdue timeout Runnable. The earlier
`3127f77cc73fcb6dd7641a376c04cc082b225f20` bridge/visual deadline repair does not
cover this preceding phase. The additional repair records the absolute commit
deadline and checks it before accepting the first callback. It changes callback
classification; it does not repair or explain the observed GPU/presentation delay.

The affected original `MainActivity.java` is byte-identical on main
`e3edcf13de323c3adb80c9c96465f1dd0425eee0`, original pairing head
`7e9e67f2fd643cff873a824cc94ce4b73956bdda`, and current PR346 head
`7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`: SHA-256
`b5fdce9d032204fead7fdb8ac5394b423ea03e2684a292e974c833c4997b8b51`.
This callback classification defect is inherited; that byte equality does not
establish the cause of the separate graphics delay.

## Callback contract and smallest change

Android's `onPageCommitVisible` reports that subsequent draws will no longer show
the previous navigation; new-page resources can still be pending.
`onPageFinished` reports main-frame loading completion, without certifying the
next frame's current DOM pixels. The application deliberately accepts either as
its first commit notification and still requires its existing bridge and visual
phases. This repair retains both notification paths.

The eight added production lines in `MainActivity.java`:

- Add `loadCommitDeadlineAt` and set it at the existing hard-timeout scheduling
  point, after `loadUrl`, using the same uptime clock and 24,000 ms constant.
- After the existing terminal-state, generation and trusted-URL guards, check
  expiry only when `mainFrameCommitted` is false.
- At or after expiry, use the existing `LOAD_COMMIT_TIMEOUT` and retry/error
  path before a callback can cancel the timer or start bridge evaluation.

The deadline is overwritten for every retry. A timely first commit followed by
an `onPageFinished` or duplicate `onPageCommitVisible` after the former load
deadline remains valid: the load phase has already finished. Duplicate callbacks
do not restart the bridge budget. The 3,500 ms bridge budget, 1,500 ms visual
budget, fallback behavior and terminal error semantics are unchanged.

This does not make the UI thread execute a queued timeout promptly when busy.
The commit deadline starts at the original timer-scheduling point; the patch
does not move that point before a potentially slow `loadUrl` call.

One workflow branch-filter entry adds `fix/android-commit-deadline-20260908` to
the existing Android handoff contract workflow. A published candidate can run
its existing browser and whole-activity JVM jobs without altering assertions.

## Differential reproduction

The unchanged runner compiles each actual complete `MainActivity.java` against
the same existing Android JVM doubles. No handoff state machine is copied into
the test. The harness adds fourteen scenarios to the previous twenty-two.

| Source | Result | Exit |
| --- | ---: | ---: |
| Parent `3127f77` | 30 / 36 | 1 |
| Local repair | 36 / 36 | 0 |

Each callback form is delivered at deadline minus 1 ms, exactly at expiry and
plus 1 ms. Further cases exercise timeout before callback, timely commit with a
late duplicate, a stale generation delivered when retry is overdue, and retry's
own 24,000 ms budget. The six parent failures are late first-commit acceptance;
the existing twenty-two bridge/visual tests continue to pass on both sources.

The raw outputs and source/tool hashes are in
[`comparison.json`](../../qa/evidence/android-commit-deadline-20260908/comparison.json).
They test callback ordering on JVM doubles, not SDK compatibility or Android
pixels. No native capture assertion, frame sampling, threshold, product asset or
web runtime is changed. The GPU delay and first-visible-product requirement
remain unresolved.

Replay the complete harness from this checkout:

```sh
python3 scripts/test-android-handoff-deadlines.py
```

To reproduce the negative control, pass `--source` pointing to the exact parent
`MainActivity.java` retrieved with `git show 3127f77cc73fcb6dd7641a376c04cc082b225f20:android-native/app/src/main/java/com/robys/coffeehouse/MainActivity.java`.
Exit 1 with six failures is expected for that control.

Primary Android contracts, checked 8 September 2026:

- [WebViewClient callbacks](https://developer.android.com/reference/android/webkit/WebViewClient)
- [Handler scheduling and uptime clock](https://developer.android.com/reference/android/os/Handler)

## Local verification

The full `npm run check` completed with exit 0 and the terminal hero-video suite
7 / 7, including the intervening guest, order and pairing contracts.
`npm run verify:security` completed with 287 checks and secret scan passing.
Build left generated and web bytes unchanged. Logs and explicit exit witnesses
are preserved beside the differential evidence.

An earlier check attempt returned exit 0 but its log stopped after starting
entry-handoff verification. It is retained as `check-incomplete.log` and is not
counted as a full pass. The complete rerun's initial completion parser expected
TAP footer syntax, while Node emitted its Unicode spec footer. The corrected
parser verified that same full log without another test run; this distinction
is recorded in `check-completion-witness.json`.

This section records local verification only. Publication and CI are reported
separately against the published commit. No merge or deployment follows from
this report.
