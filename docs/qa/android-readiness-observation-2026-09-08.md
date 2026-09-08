# Android readiness observation — 8 September 2026

Run **34229226048** still fails with `VISUAL_STATE_TIMEOUT`. Its passive
observation localizes late stylesheet/font readiness alongside long raster work.
It does not establish an exclusive function-level cause or a release-ready fix.

This run uses observed subject `6592c51a1bd5812e3ae85ed6c83c53effafc7050`,
derived from the earlier cache-safe candidate. It does **not** contain the
stylesheet-error repair accompanying this note. All three pending stylesheets
finish with `load` in this run; a lost `error` event is not its observed cause.

## Identities and retained evidence

- [Workflow run](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34229226048).
- Tooling: `6fc71045afeb77d9683eb615b6496a4419085865`.
- Artifact: `10057336521`; ZIP SHA-256:
  `cb1bf76457d293f89a16e36b7d272e03b783d55af554c88d9300c54fdfe58b8c`.
- Pinned inventory: 241 files; SHA-256:
  `8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588`.
- API 36, WebView 133.0.6943.137, software renderer; app PID 4729, GPU TID 4830.
- [Independent measurements](../../qa/evidence/android-readiness-20260908/independent-review.json),
  [readiness snapshot](../../qa/evidence/android-readiness-20260908/readiness-observation.json),
  [reconstruction check](../../qa/evidence/android-readiness-20260908/reconstruction-check.json)
  and [verified replay result](../../qa/evidence/android-readiness-20260908/replay-result.json).

The downloaded ZIP hash matches. Twenty-six prepared files match independent
reconstruction, and all 19 archived tool hashes match the immutable tooling
commit. Large traces and video remain in the original artifact. These source
and capture checks do not change the native failure verdict.

## Readiness and concurrent work

The snapshot contains 48 events, zero dropped events and generation 1. Its single
delayed export provides a 166.067609 ms request/callback bracket. Assuming stable
monotonic clock rates, browser time zero maps to native elapsed nanoseconds
184179871774–184345939383. No midpoint or exact epoch conversion is asserted.

| Observed barrier | Browser-relative duration |
| --- | ---: |
| Active stylesheets | 4111.9 ms |
| Poster/header decodes, concurrently | 94.8 ms |
| Font readiness | 2720.1 ms |
| Existing entrance animations | 0.1 ms |
| Two frame callbacks | 39.8 ms |

Pending stylesheets are android-app.css, hero-balance.css and mobile-install.css.
Their adapter `SERVED` records precede the respective JS load callbacks by about
4092–4297 ms across the alignment bracket. A served record precedes response
consumption; it does not prove completed renderer receipt, parsing or event
dispatch. Neither this pause nor the font barrier is a measured download time.

Native markers occur at +2595.315 ms (`WEB_COMMITTED`), +7011.860 ms
(`WEB_READY_TIMEOUT`) and +8578.408 ms (`VISUAL_STATE_TIMEOUT`). JS ready maps to
+9768.458–9934.526 ms, after failure throughout the alignment interval. There is
no native `WEB_READY`, completion or successful post-completion window.

The longest pre-failure draw spans 4040.603 ms. Within that same interval, the
main thread sleeps for 4031.555 ms, the GPU thread runs for 3697.077 ms and
RenderThread runs for 1306.390 ms. These overlapping thread measurements must not
be added as wall latency.

Internal scopes identify 2543.966 ms of RenderThread sync-token waiting and
1095.593 ms of RenderThread shader scopes in that draw. GPU end-raster scopes
cover a 3439.524 ms union, including 1837.426 ms of named Flush scopes. Its
post-Flush tails cover 1602.050 ms with 126 timebase samples and no callstacks.
Later draws of 1449.595 and 763.808 ms retain similarly unresolved tails.

Three internal draw intervals have starts within 0.9–2.2 microseconds and ends
within 14–20 microseconds of their enclosing system draw markers. Eleven
MONOTONIC/BOOTTIME snapshots differ by at most 214 ns. This supports interval
correspondence in this run; neither marker establishes physical pixels.

## Observation limits

- All 9522 timebase samples lack `callsite_id`, including all 550 GPU samples.
  No unwind-error rows are recorded. Function attribution is unavailable;
  symbols alone cannot recover absent stacks.
- Unstacked timebase samples outside the app do not alone prove collection of
  outside-app stacks. No scope-violation verdict is adopted from those counts.
- Device Perfetto v49.0 records the requested scoped DWARF configuration. A
  recorded request is not proof that producer unwinding succeeded.
- The full native failure window is captured. There is no completion from which
  to claim ten seconds of successful post-completion behavior.
- No nonzero severity error/data_loss statistics were returned. Separately, 37
  `ftrace_setup_errors` notices remain visible.
- Internal JSON closes at its declared byte count, with 12 open begin records
  and RECORD_UNTIL_FULL mode. Complete category coverage is not established.
- Stripped arguments cannot identify DOM ownership. This single instrumented
  emulator launch does not establish stable performance or physical-device
  behavior. No threshold or original native assertion has changed.

## Replay without a new Android run

Download artifact 10057336521 from the workflow run, verify its ZIP hash above
and extract it to a fresh directory. Use an existing repository checkout to
prepare detached copies of the two immutable commits. The commands below only
reconstruct the captured fixture; they do not build, install or launch an APK.

```bash
ROBYS_REPLAY="$(mktemp -d)"
ROBYS_EVIDENCE="$PWD/qa/evidence/android-readiness-20260908"
git fetch origin 6fc71045afeb77d9683eb615b6496a4419085865
git fetch origin 6592c51a1bd5812e3ae85ed6c83c53effafc7050
git worktree add --detach "$ROBYS_REPLAY/tooling" \
  6fc71045afeb77d9683eb615b6496a4419085865
git worktree add --detach "$ROBYS_REPLAY/subject" \
  6592c51a1bd5812e3ae85ed6c83c53effafc7050
ROBYS_SUBJECT_SHA=6592c51a1bd5812e3ae85ed6c83c53effafc7050
ROBYS_WEB_SHA=8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588
python3 "$ROBYS_REPLAY/tooling/scripts/prepare-android-pinned-fixture.py" \
  --source "$ROBYS_REPLAY/subject" --output "$ROBYS_REPLAY/fixture"
python3 "$ROBYS_REPLAY/tooling/scripts/prepare-android-trace-probe.py" \
  "$ROBYS_REPLAY/fixture"
python3 "$ROBYS_REPLAY/tooling/scripts/prepare-android-rendering-trace.py" \
  "$ROBYS_REPLAY/fixture" --source "$ROBYS_REPLAY/subject" \
  --expected-source-sha "$ROBYS_SUBJECT_SHA" \
  --expected-web-sha256 "$ROBYS_WEB_SHA" --expected-web-count 241
python3 "$ROBYS_REPLAY/tooling/scripts/prepare-android-readiness-export.py" \
  "$ROBYS_REPLAY/fixture" --source "$ROBYS_REPLAY/subject" \
  --expected-source-sha "$ROBYS_SUBJECT_SHA" \
  --expected-web-sha256 "$ROBYS_WEB_SHA" --expected-web-count 241
python3 "$ROBYS_EVIDENCE/replay-evidence.py" \
  --artifact /absolute/path/to/extracted-artifact \
  --zip /absolute/path/to/downloaded-artifact.zip \
  --tooling "$ROBYS_REPLAY/tooling" \
  --reconstructed "$ROBYS_REPLAY/fixture" \
  --trace-processor /absolute/path/to/trace_processor_shell \
  --output "$ROBYS_REPLAY/results"
```

The analysis used Trace Processor v58.2-add693d8b, binary SHA-256
`58042408e6cc861fb1a731c26bb082dc222285561eaa4e12a48a8b2b90dca7b9`.
The replay checks identities, 26 reconstructed files, 19 tools, readiness clocks,
native markers, sample counts, thread states, internal scope unions and exact
post-Flush interval sets. It saves raw query output for inspection. `PASS` means
the evidence replays while preserving `VISUAL_STATE_TIMEOUT`; it is not an
Android repair, approval, merge decision or deployment result.
