# Guest entry startup investigation

This is a continuation of PR #346, not a deployment or acceptance certificate.
The requirement remains a visible entrance within 150 ms of the original
`brand-frame` event, followed by 24 consecutive sampled frames, at least 20
changing transitions, no more than two identical frames, and median cadence
at most 20.5 ms. No event origin, allowance or visible sample is changed here.

## Failure and observation boundary

The product head `8b1613abc250919d66b2173249b87f417c925883` has two failed
motion checks: runs `34146422851` and `34146422836` recorded 271.7 ms and
158.8 ms startup respectively. Their visible-motion samples otherwise passed.
Both failures occurred in the shared morning prefix. The green predecessor
does not certify these bytes.

A six-fresh-process diagnostic at `237573fbe5e3a8e1c4a5a04bc5dccf3a61c255b8`
collected five original-gate passes and one 156.2 ms failure. CPU tracing was
enabled in three passing cases; it did not capture the failing case. The trace
showed expensive initial style/layout work both inside and outside the sampler.
That alone cannot establish that removing a sampler read removes the work.

The rAF argument timestamps a rendering opportunity, not the end of executing
the callback. Diagnostics therefore also record `performance.now()` after the
actual style reads, relative to the unchanged event origin. Neither observation
is proof of physical display presentation.

## Controlled observer comparison: hypothesis not supported

Run `34150093184`, diagnostic head
`41eb32206afecedd1f78427780c6891d93587780`, collected 12 fresh Chromium
processes in ABBA order repeated three times. All public runtime bytes matched
the failing product head. Both arms had identical animation wrappers, callback
timestamps, long-task observations and CDP metrics. Appearance measurements
were postponed until 24 visible samples in both arms to isolate sampler effects;
this differs from release-helper call order and is not release certification.

The metadata arm skipped style reads only while the initial animation was
pending at currentTime zero. Those records contain null style values, never
invented opacity zero. Missing or unexpected animation states still received
full reads, and no samples after the first visible frame were skipped.

| Observation from the unchanged event origin | Original reads | Metadata pending prefix |
| --- | --- | --- |
| Actual callback-end startup, ms | 77.2, 64.8, 161.8, 40.6, 61.4, 64.3 | 162.4, 71.2, 174.9, 57.3, 89.1, 173.0 |
| Median actual startup, ms | 64.55 | 125.75 |
| Actual observations above 150 ms | 1/6 | 3/6 |
| All 24 visible transforms sampled and distinct | 6/6 | 6/6 |

The metadata arm did not improve startup in this bounded experiment. Its values
do not justify replacing the release sampler or declaring its null prefix to
be measured zero opacity. The original release sampler remains in place.
CDP comparisons use after-minus-before metrics from the retained raw snapshots;
final totals alone are not attributed as incremental work.

Artifact `10029059868` has SHA-256
`e200848b1722761419a165afe0fa3bbd39948e327507ed08569c60107fd9a95d`.
It includes the two derived helpers, original helper hash, runtime hashes,
per-case probes, appearances, metrics and collection outcomes. A successful
collection job is not a passing product gate.

## Concrete candidates

The order dock reads resolved CSS bottom twice with a root style write between
the reads. Reusing the first resolved value for both clearances eliminates that
second read-after-write boundary while retaining the same safe-area-aware
geometry. A source candidate and generated bundles pass the existing dock
contracts, full repository checks and security verification. Browser evidence
must establish its effect before it is called a startup repair.

The home page also declares an autoplay video source that QA initialization
assigns and loads again. The follow-up removes this redundant reset while keeping
playback retries and explicit recovery of an existing media error. Seven focused
behavior checks pass; running the same checks against the previous initializer
produces four expected failures. Build now synchronizes the QA module's HTML
revision, which the existing service worker matches exactly.

## Runtime comparisons and remaining failure

Both runtime experiments used the original helper plus only callback-start/end
timestamps, original appearance-check order and identical response interception
in each arm. Each ran 12 fresh processes in ABBA order. They are controlled
diagnostics, not an exact deployed-page or physical-media playback certificate.

| Treatment | Baseline actual startup median | Candidate actual startup median | Candidate original-gate failures |
| --- | --- | --- | --- |
| One resolved dock-bottom snapshot | 179.45 ms | 202.50 ms | 4/6 |
| Conditional hero video reload | 191.95 ms | 187.05 ms | 3/6 |

Dock style recalculation counts generally decreased, but startup did not improve
in this sample. The video candidate reduced completed retained media resource
entries from two to one in every case, but still exceeded the startup budget.
All recorded videos had readyState zero at the final checkpoint: these runs do
not certify playback or a decoder-speed improvement. ResourceTiming is not a
complete count of aborted network requests.

These two source repairs remove demonstrated redundant work. **Neither is
claimed to solve the startup requirement**, and their combined product head
still requires its own CI. The sampler, event origin and limits are unchanged.

- Dock collection: run `34150746354`, head
  `8d7f3d4ef926647b92d8df5d0a746cdc9c04243e`, artifact `10029280259`, SHA-256
  `563759ffc9b5885b87c9578374624186df05a515a5eaecde8fd7c7b2434d39a8`.
- Video collection: run `34150856374`, head
  `d2a09412f0f22afc3139cc141b28a83da093cc45`, artifact `10029309047`, SHA-256
  `c4a8676f794040d352f8564c1239323f97b6d7771b82d99a75ff6b0e6737dce5`.
- The first dock attempt, run `34150614884` at `8f0a818`, failed integrity before
  any browser measurement because its diagnostic fixture was in the public
  asset root. The fixture was moved under `scripts/fixtures`; no manifest
  exception or integrity weakening was introduced. Retain that failed attempt.
