# PR346: guest graphics transport is now observable

Android is still unresolved. This evidence branch changes no product source.
PR346 remains on `7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`, where the Visual
binding repair passes. No merge, deployment, APK publication, threshold or
deadline change follows from this diagnostic.

## Bound observation

[Run 34237004349](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34237004349)
uses tooling `9f1f9fa254cfba591b5a50a37436bbda8e934a8a` and observed source
`6592c51a1bd5812e3ae85ed6c83c53effafc7050`. Its original Android capture fails:
WEB_READY_TIMEOUT then VISUAL_STATE_TIMEOUT, with no HANDOFF_COMPLETE.
The separate late profiler completes collection and does not override exit 1.

The 241-file inventory remains
`8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588`.
Artifact `10060603960` is 11,455,926 bytes, SHA-256
`d863f787da2e501f1d24c7571568196e8fd5854c1a5eff2cd970c3f7a11564d2`.
Its ZIP digest, size, CRC and 93-file extraction were independently checked.
Reconstruction matches 38 prepared files and 21 tooling hashes; 61 independent
helper identity, output-hash and command-order checks pass. The raw APK is not
present, so CI inventory records do not constitute independent APK binary
verification.

The observer attaches after the first native marker and exact application
command-line verification. Target PID is 4696; GPU thread is TID 4781. Original
system trace, native code, web bytes, capture assertions and deadlines remain
unchanged. The extra 45-second, 80 Hz userspace profiler adds overhead; this is
not an unchanged-observer performance comparison.

## Newly available stacks

The original profiler still rejects every actual sample before unwinding. The
late PID-scoped session has 2,707 app samples with callsites, including all 662
GPU samples, with zero GPU unwind errors. Numeric PID/TID, original process and
thread lifetimes, and each trace's BOOTTIME snapshots bind the two traces;
trace-local upid/utid values are never joined across files. No non-target stacks
were found. Each trace contains four lost perf CPU records; this limits
completeness without erasing the recorded frames.

| Original draw | Wall duration, ms | GPU samples | read leaves | Exact program response chain | Exact sync creation response chain |
| --- | ---: | ---: | ---: | ---: | ---: |
| 61164 | 7252.685 | 328 | 297 | 173 | 94 |
| 114947 | 2029.637 | 86 | 82 | 0 | 67 |
| 119289 | 2666.146 | 151 | 144 | 0 | 135 |

The exact leaf-to-caller sequences are:

- `read -> qemu_pipe_read -> QemuPipeStream::commitBufferAndReadFully -> glCreateProgram_enc -> GL2Encoder::s_glCreateProgram`
- `read -> qemu_pipe_read -> QemuPipeStream::commitBufferAndReadFully -> rcCreateSyncKHR_enc -> createNativeSync -> eglCreateSyncKHR`

Under the explicitly qualified internal MONOTONIC-to-BOOTTIME mapping, 173
program response chains fall inside the first draw's named Flush spans; its
post-last-recorded-Flush tails contain 94 exact sync creation response chains.
The later two tails contain 67 and 135. Tail span unions are 1710.793,
1681.829 and 2405.437 ms. Internal tracing has no shared-marker clock proof;
whole-draw stack attribution does not depend on that extra internal join.
Counts are sampled stacks, not wall-time shares, and nested matches are not
additive costs.

Program creation is not proof of shader compilation. Sync creation is not
proof of waiting for a fence signal. A `read` leaf is not a scheduling-state
measurement. GPU scheduling delay is also substantial: the first draw has
4089.067 ms Running and 3150.295 ms Runnable. Host queueing, host CPU/GPU work,
transport servicing and the unnamed Chromium/DOM caller remain unresolved.
These data do not prove that the failure is exclusively infrastructure or
exclusively pairing.

## Readiness and visible result

The passive recorder has 48 events and no drops. CSS waiting takes 7267.4 ms,
poster decode waiting 5355.8 ms, and the fonts/layout gate 875.3 ms. These are
callback/getter/await intervals, not network download timings or pure decode
CPU time. All pending CSS load events succeed.

With the full 480.435 ms export-clock bracket, styles are ready before the
delivered ready-timeout marker. Poster completion is already 34.680–515.114 ms
after VISUAL_STATE_TIMEOUT, and the fonts gate starts afterward. Removing the
fonts await therefore cannot rescue this capture. JS ready is 979.680–1460.114
ms late. Bulk service-worker caching is not an established initiator.

Embedded screenrecord timestamps and decoded frames show branded cover at
frame 50 and error at frame 51: +27.736 to +1118.627 ms after the precise native
failure. The error remains in the reviewed later and final frames. Encoded
frame spacing is not physical display latency. With no completion, the
ten-second post-completion window is not applicable, never zero or passing.

## Rejected interventions and next evidence boundary

The hero-only head-link candidate `28be9b6`, run `34232280323`, really served
hero CSS before commit and removed it from pending styles. It still failed
both native timeouts. Five normal-path browser style/geometry pairs passed,
but they do not prove Android startup or every failed-script path. The static
hero marker also loses its incidental proof that qa.js executed. No promotion
is justified.

Separately committed reports show cache-safe c9 failed run `34227119767` and
all-three-early-styles candidate 3ca passed only fallback in run `34232699525`,
with the first reviewed open product 2862.514 ms after completion. Those
external new raw archives were not independently downloaded in this review;
the reported results are preserved as authored evidence, not new raw proof.
The separate stylesheet-error recovery commit d200 fixes an already-past error
event, not the successful-but-late CSS loads measured here.

The smallest justified next observation is host graphics request/service and
scheduling timing correlated with the guest response path. A short hosted
runner capability [preflight 34240042438](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34240042438),
tooling `9ea6882f516e20327f3f240f21d4f6e051040667`, now establishes an access
boundary on this runner: perf is installed, but even `cpu-clock:u` for its own
harmless child returns 255 with `perf_event_paranoid=4`. Collector status is
INCOMPLETE42. Artifact `10061538025`, 4902 bytes, SHA-256
`63a2b7cb820882f20dfd9e8fbf386596903c8c30850790f707fa7897113b3dc5`,
and all four command-output hashes were verified. No permissions changed and
Android was not run. This is an environment access limit, not a product
failure or a completed host profile. A CSS rewrite, removed await, larger timeout, extra
startup sleep or weaker visual gate is not established as a repair.

The existing Visual repair remains the only accepted source change in PR346
from this investigation. Android HOLD remains.
