# Early stylesheet experiment: not ready for promotion

The isolated early-stylesheet candidate is **not an Android handoff repair**.
It passes the native test through fallback, but the inspected recording first
shows the uncovered product 2862.514 ms after `HANDOFF_COMPLETE`. Long draws
continue afterwards. No source change from this experiment is promoted to
PR #346 or main.

The separate confirmed stylesheet-error fix remains published at
`d20027ddec387d9692a1e2711d86ba2a88493194`; see its
[repair and differential proof](android-stylesheet-error-recovery-2026-09-08.md).
That error-path repair is not present in either arm of this experiment.

## Experiment and identities

[Run 34232699525](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34232699525)
uses tooling `80dbc2c5ad5acc81f84cb477ad01a6f7eb26cf3e`. Its tree is
`66c2370b21e3d06176b95a1aee7292b9309d5cd8`.

| Arm | Immutable subject | Web inventory SHA-256, 241 files |
| --- | --- | --- |
| Control | `6592c51a1bd5812e3ae85ed6c83c53effafc7050` | `8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588` |
| Candidate | `3ca3e5b20134a7e9678570105849333d23e96ac0` | `80b4c74cee5b5a8384e096960b06ecadc1d61ad2c3090c40feaeaa974ebe08f4` |

The candidate declares the same three stylesheets after the existing thirteen
in the homepage HTML. Final cascade order, CSS bytes, native Java, the passive
recorder, renderer, deadlines, assertions and 120-second settling are unchanged.
The real conversion/QA/PWA owners reuse those links without duplicates. The
candidate also changes ordinary browser-home timing; its static hero marker
no longer incidentally proves that `qa.js` executed. It is an isolated timing
experiment, not an approved browser change.

Both artifact ZIP sizes, hashes, CRCs and extraction paths were verified.
For each arm, 26 preparation outputs, 19 tool hashes and eight copied scripts
match independent reconstruction; the exact workflow and arm binding match.
Both instrumented native sources have SHA-256
`9ebd9c780f4bef5018f2937c760f68af7c20c0142333ebd4bd77f97b05e4baa0`.

| Artifact | ZIP SHA-256 |
| --- | --- |
| Control 10058796885, 9537482 bytes | `64b74a0722c462eb1e6d38124783816fe1f19b0ba0239b2746c0ec2041dc128f` |
| Candidate 10058788402, 11195334 bytes | `e88b7683295da2195e7f253c5414d55c696a3a87c7a103f48e03fef5ff6eaeff` |

## Observed behavior

| Observation | Control | Candidate |
| --- | ---: | ---: |
| Native origin to WEB_COMMITTED | 3216.907 ms | 2894.138 ms |
| Native origin to terminal marker | 12454.561 ms, failure | 9714.860 ms, fallback completion |
| WEB_COMMITTED to terminal marker | 9237.655 ms, failure | 6820.721 ms, fallback completion |
| Stylesheet await | 36.3 ms | 0.2 ms |
| Poster decode await | 6200.3 ms | 7913.7 ms |
| Header decode await, concurrently | 6179.9 ms | 6542.0 ms |
| Font readiness await | 3915.3 ms | 2687.0 ms |
| Native WEB_READY | Absent | Absent |
| Longest pre-terminal draw | 5860.647 ms | 6546.669 ms |

Failure and fallback completion are different outcomes; subtracting them does
not measure an improvement to a common successful state. The previous run's
4111.9 ms stylesheet barrier did not repeat even in this control. This pair
does not support attributing removal of that earlier delay to the candidate.
Decode and font awaits likewise do not isolate download time, decoder CPU work
or callback scheduling.

Control JS readiness arrives at native +13527.029–13532.291 ms, after failure.
Candidate release occurs while poster decode is still pending. Poster readiness
arrives at +10997.947–11004.062 ms and fonts at +13684.947–13691.062 ms. Instead
of emitting `ready`, preparation eventually records `released-pending`.
The export alignment brackets are 5.262 ms and 6.114 ms respectively.

## Video and work after completion

The original recording contains Winscope v2 frame timestamps. Their count and
timing match decoded MP4 frames within one 90 kHz video tick. This binds encoded
video observations to the trace clock; it does not measure physical display
presentation or interaction responsiveness.

Candidate frame 59 still shows the native splash. The next frame, 60, shows
the product at +2862.514 ms after completion, or +12577.374 ms after native
origin. The inspected consecutive boundary is frames 56–60. Product frames
62 and 63 are 2202.544 ms apart in the recording. Control frame 47 retains
the splash and frame 48 shows the terminal retry error.

- [Candidate: remaining splash, frame 59](../../qa/evidence/android-early-styles-20260908/candidate-splash-059.png).
- [Candidate: first uncovered product in the inspected boundary, frame 60](../../qa/evidence/android-early-styles-20260908/candidate-product-060.png).
- [Control: terminal retry error, frame 48](../../qa/evidence/android-early-styles-20260908/control-error-048.png).

| Candidate draw | Start relative to completion | Full duration | End relative to completion |
| --- | ---: | ---: | ---: |
| 92326 | −98.331 ms | 1318.407 ms | +1220.076 ms |
| 96446 | +1251.355 ms | 1572.369 ms | +2823.724 ms |
| 102191 | +4005.899 ms | 1246.932 ms | +5252.832 ms |

The second draw includes 1400.660 ms of RenderThread sync-token waiting while
its GPU thread runs for 1079.067 ms. Internal end-raster scopes cover a
1508.492 ms union including 328.974 ms of Flush and 1179.492 ms of post-Flush
tails. Overlapping thread and scope intervals must not be summed. These
observations do not identify an exclusive native function or DOM owner.

## Capture boundaries and replay

The system and internal traces cover the candidate's complete ten-second
post-completion window. Control has no completion; its separately retained
after-failure window is diagnostic only. The delayed export begins after the
critical window.

Control has 9450 timebase samples, including 701 GPU samples; candidate has 9462,
including 677 GPU samples. Every callsite is absent. Candidate also records
13 lost perf records, whose placement in the critical intervals is unknown;
its profile is not loss-free. Control has no returned nonzero error/data_loss
rows. Both retain 37 ftrace setup notices. Internal JSON closes at the declared
byte count, with eight open begin records in control and seven in candidate.
Closed output is not proof of complete category coverage.

The retained evidence directory contains
[provenance](../../qa/evidence/android-early-styles-20260908/provenance.json),
[comparison](../../qa/evidence/android-early-styles-20260908/comparison.json),
[control measurements](../../qa/evidence/android-early-styles-20260908/control-report.json),
[candidate measurements](../../qa/evidence/android-early-styles-20260908/candidate-report.json)
and [pixel review](../../qa/evidence/android-early-styles-20260908/pixel-review.json).

`analyze.py` with adjacent `query.sql` derives each PID, TID and native window
from that trace. Its `arm --help` documents required artifact, ZIP, source,
tooling and inventory pins; `pair` compares the resulting two reports. It does
not launch Android or a browser. `test_analyze.py` has five passing clock,
missing-readiness and interval-union checks. The same analyzer also reproduces
the preceding archived run's clock brackets and exact raster-tail intervals.
Trace Processor v58.2-add693d8b used here has SHA-256
`58042408e6cc861fb1a731c26bb082dc222285561eaa4e12a48a8b2b90dca7b9`.

`verify-provenance.py --help` accepts both downloaded artifact directories,
both reconstructed fixtures and the immutable tooling checkout. Reconstruct
each subject using the four fixture preparation commands described in the
[preceding observation](android-readiness-observation-2026-09-08.md), substituting
the subject and web inventory from the table above. `parse-video-clock.py`
checks the original video's embedded timestamps against `ffprobe`; extract a
retained frame with FFmpeg's zero-based `select=eq(n\,60)` filter, preserving
its original pixels. Raw traces and recordings remain in the original CI
artifacts, with their declared retention period.

Full source build, integrity, check and security passed before the experiment
was published. The new ownership tests and all fixture/capture negative
controls also passed. Those results are local/source validation, not evidence
of a smooth native handoff. This verdict keeps PR #346 at `7799f80` and main at
`e3edcf13`; no merge, deployment or APK publication occurred.
