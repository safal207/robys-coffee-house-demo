# PR346 raster callstack observation — 8 September 2026

This diagnostic asks which native functions execute after the recorded
`RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` scope. The preceding candidate
remains rejected: run 34200562337 completed through fallback and retained two
post-completion draw stalls. Sampling is additional observation, not a repair or
a replacement for the native, product-frame, video or ten-second checks.

## Bounded configuration

`scripts/qa/android-raster-callstack.pbtx` preserves the complete original
`scripts/qa/android-handoff-trace.pbtx` as its byte prefix. It appends one 32 MiB
DISCARD buffer and a `linux.perf` source targeting only that buffer. The software
CPU clock requests 80 samples per second per CPU, uses MONOTONIC timestamps and
unwinds userspace DWARF stacks only for `com.robys.coffeehouse.debug`. Kernel
frames, wildcard command lines, additional processes and ignored open failures
are not enabled. The original duration and trace sources remain intact.

Perfetto samples per CPU and evaluates the command line of encountered processes;
this scope does not freeze a PID list before launch. Start tracing before the
fresh application launch and verify that samples belong to its resulting PID.
The existing in-process GPU thread is selected through that application process.
The WebView renderer's separate sandboxed process is outside this stack scope.

The intended device is the existing Android API 36 emulator and debuggable APK.
Current Perfetto instructions specify Android 15+ for the modern configuration
used here and require a profileable or debuggable application on a user build.
Although its configuration reference describes command-line matching on Android
12 and earlier, that is not a promise that this modern configuration runs there.
No Android 12 compatibility result or on-device collection result is claimed by
the static test. A missing producer, permission error or unknown configuration
field means incomplete observation; it does not authorize changes to device
permissions, rooting, deadlines or pass criteria.

Official sources:

- [CPU profiling and application prerequisites](https://perfetto.dev/docs/getting-started/cpu-profiling)
- [Trace configuration reference](https://perfetto.dev/docs/reference/trace-config-proto)
- [Perf event configuration](https://github.com/google/perfetto/blob/main/protos/perfetto/config/profiling/perf_event_config.proto)
- [Per-sample process selection](https://github.com/google/perfetto/blob/main/src/profiling/perf/perf_producer.cc)

## Preparation and static verification

Run `python3 scripts/test-android-raster-callstack.py`. It checks preservation of
the existing capture and rejects twelve changes to scope, clock, buffers, rate
or failure handling. This is a bounded text configuration contract, not a device
parser or a synthetic performance result.

The workflow must archive the actual copied configuration and bind its SHA-256 in
the diagnostic manifest after replacing the prepared configuration. Preserve
the source commit, web inventory, native source, observer patches, package and
WebView identities, native result, traces and capture artifacts. The trace source
itself does not change native timing or web readiness. Any accompanying phase
observer or export timing changes must be bound separately and described.

## Post-run evidence checks

First retain producer/Perfetto stderr and verify the actual configuration was
accepted. Query the original native outcome and preserve it even if profiling
fails. Require complete system coverage through ten seconds after completion and
the original internal trace, video and frame checks. Stack availability is an
additional observation verdict and cannot override any of those results.

Use the following SQL with the actual system trace. The first query inventories
all samples before filtering; a sample from an unexpected process is a scope
failure. The second retains parsing, skipped-sample and buffer-loss evidence.
Empty results from the first query mean incomplete profiling, not a clean CPU.

```sql
SELECT p.pid, p.name AS process_name, t.tid, t.name AS thread_name,
       COUNT(*) AS samples,
       SUM(s.callsite_id IS NULL) AS missing_callsite,
       SUM(s.unwind_error IS NOT NULL) AS unwind_errors,
       MIN(s.ts) AS first_sample_ns, MAX(s.ts) AS last_sample_ns
FROM perf_sample s
LEFT JOIN thread t USING (utid)
LEFT JOIN process p USING (upid)
GROUP BY p.pid, p.name, t.tid, t.name
ORDER BY p.pid, t.tid;

SELECT name, idx, severity, value
FROM stats
WHERE value != 0
  AND (severity IN ('error', 'data_loss')
       OR name GLOB '*perf*' OR name GLOB '*stack*')
ORDER BY severity, name, idx;
```

Rows with unresolved process or thread identity remain incomplete scope evidence.
Then locate the current run's draw and token-wait intervals; never reuse prior
run timestamps or thread IDs. Intersect samples from its GPU thread with each
exclusive post-Flush interval derived from the internal trace. Save the exact
intervals and the clock-alignment evidence. Inventory actual GPU samples in
every claimed interval; a trace with samples elsewhere does not cover the tail.

Expand callsites through their parents, retaining unresolved frame offsets and
mapping build IDs. This query emits each sampled frame once per stack level;
its rows are not independent samples and must not be added as latency. Replace
the two NULL values below with the current launch's resolved process `upid` and
GPU thread `utid`; NULL intentionally yields no attribution:

```sql
WITH RECURSIVE selected_ids(upid, utid) AS (
  VALUES (NULL, NULL)
), frames(sample_id, sample_ts, callsite_id) AS (
  SELECT s.id, s.ts, s.callsite_id
  FROM perf_sample s
  JOIN thread t USING (utid)
  JOIN process p USING (upid)
  JOIN selected_ids chosen ON chosen.upid = p.upid AND chosen.utid = t.utid
  WHERE p.name = 'com.robys.coffeehouse.debug'
    AND t.name GLOB 'Chrome_InProcG*'
    AND s.callsite_id IS NOT NULL
  UNION ALL
  SELECT f.sample_id, f.sample_ts, c.parent_id
  FROM frames f
  JOIN stack_profile_callsite c ON c.id = f.callsite_id
  WHERE c.parent_id IS NOT NULL
)
SELECT f.sample_id, f.sample_ts, c.depth, frame.name,
       frame.rel_pc, frame.symbol_set_id,
       mapping.name AS mapping_name, mapping.build_id
FROM frames f
JOIN stack_profile_callsite c ON c.id = f.callsite_id
JOIN stack_profile_frame frame ON frame.id = c.frame_id
JOIN stack_profile_mapping mapping ON mapping.id = frame.mapping
ORDER BY f.sample_ts, f.sample_id, c.depth;
```

For a function-level finding, require interpretable stacks from the relevant
tail and matching binary/build-ID symbolization, recording sample counts and
unwind failures. An empty name, hexadecimal placeholder or module name alone is
not a resolved function. Missing samples, truncated unwinds or unresolved
dominant frames leave attribution incomplete. Retain any partial evidence and
its limits rather than inferring that absent functions did no work.

The discriminating comparison is driver/fence submission versus image lifetime,
font-cache or memory-accounting work. Exact Chromium 133 source permits a second
GL submission during access destruction after the named Flush; current trace
arguments do not identify the backing or prove that path executed. Sampling must
resolve this boundary, not manufacture a DOM or shader owner. Report capture and
unwinder overhead, guest scheduling and internal thread-counter differences.
One instrumented launch cannot establish a stable device-level speedup.

## Bound readiness observation in this workflow

The workflow uses immutable diagnostic subject
`6592c51a1bd5812e3ae85ed6c83c53effafc7050`, tree
`ee7c1df00e13843bfbfdf7bad72ef57cced95d32`, with 241 pinned web files and
inventory SHA-256
`8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588`.
It descends from the unvalidated cache-safe candidate c9a9d9c; it is not the PR
head or a product performance repair. The source records bounded in-memory JS
phase timestamps with no added timers, awaits, layout reads or media operations.

The final native observer schedules one export 55 seconds after configuration,
using an independent Handler. It calls the passive snapshot function, records
performance.now/timeOrigin and the document URL, and brackets evaluation with
native elapsed/uptime/wall clocks. Collection accepts only the original cold
launch generation 1. No evaluations are added to readiness polling. The workflow requires the package to be absent on its fresh AVD before the
original capture installs it; the capture itself does not clear app data and
remains byte-identical after its declared
source-label substitutions; native deadlines and all capture assertions are
unchanged. Missing output, truncated buffers, malformed metadata, wrong document,
and early export are incomplete observation, never repaired handoff evidence.

Preparation preserves original, transport, rendering-observed and final native
stages with verified source, adapter, manifest and diff bindings. The original
trace configuration is the exact byte prefix of the new sampling configuration;
the trace manifest records both config hashes. The APK delivery verifier explicitly
requires the new native entry module; a legacy module fetched by a worker cannot
stand in for launch-module delivery.

The export uses AtomicFile and a process-local single-owner guard. Recorded pre-install package absence
and launch timestamps must rule out a stale prior record.
Activity destruction cancels only the observer's timer; its small diagnostic
status write on teardown is observer interference, and the resulting record is
incomplete. A subsequent activity cannot overwrite the first owner's output.
Export request must be checked against the actual HANDOFF_COMPLETE timestamp to
prove it lies after the full ten-second post-handoff inspection window; the
55-second schedule alone is not proof if the application was severely stalled.
JS/native alignment has a request/callback interval and wall-clock assumptions;
do not claim submillisecond phase alignment from timeOrigin arithmetic alone.

The wrapper preserves every nonzero exit returned by the original capture,
trace collector, or rendering observer even if later export/reporting fails.
An observer-only failure uses exit 42 when the original probe succeeded.
CPU stack presence, lost samples, unknown process metadata, and usable symbols
are separately adjudicated with the SQL above. A successful shell wrapper does
not certify sample availability, a displayed product frame, or smooth rendering.

## Follow-up: first-render hero stylesheet

The earlier observed launch 34229226048 on source 6592c51 failed with
WEB_READY_TIMEOUT and VISUAL_STATE_TIMEOUT. Its 48 passive phases show 4111.9 ms
at the stylesheet barrier and 2720.1 ms across the fonts.ready getter/await.
The existing hero stylesheet is among three dynamically added pending styles.
Native response preparation precedes their load callbacks by over 4 seconds.
The font barrier is not font-download latency: exact Chromium 133 can wait for
style/layout and the load event. Main/renderer waiting overlaps GPU work.
Bulk service-worker installation begins after failure in that launch.

The next bounded hypothesis changes only index.html to declare the same
hero-balance.css URL in the head with data-hero-balance="true", plus its
regenerated integrity entry. The existing qa.js guard prevents duplicate
insertion. CSS/JS/native bytes, media, readiness conditions, deadlines and the
observer/capture configuration remain unchanged from source 6592c51.

Candidate source: 28be9b60cb0e66a6b115b774781c72b50e770468;
tree: 78ee0f9cd5e8c0997034366c6b846b95e8a3f651;
241-file inventory: af38a63663d62ba92bf15680b7ecfa2c32188dd21b1905796b6b7f2384ad2edf.
The modified workflow runs only this source, on the same fresh API 36 / software
emulator and 120-second idle condition. Prior source6592 observations are a
separate single launch, not a randomized estimate of effect.

The first profiler produced 550 GPU counter observations but no callsites:
raw packets explicitly report PROFILER_SKIP_NOT_IN_SCOPE. Target selection can
reject a newly forked process before it has its final identity/userspace state;
its exact initial rejection input was not captured. No specific driver function
or permission failure is established. This follow-up retains that observer
configuration for comparability; it does not promise usable function stacks.
A passing original capture alone still cannot prove timely visible product or
absence of post-completion work. Native outcome, phases, frames and the full
post-completion interval must all be reviewed before promoting any repair.
