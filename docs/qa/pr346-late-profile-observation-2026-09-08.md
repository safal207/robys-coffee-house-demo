# PR346: scoped profiler after native startup

This branch changes diagnostic collection only. PR head remains
`7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`; there is no product repair claim.

## Why the observer needs repair

Run `34229226048`, with source
`6592c51a1bd5812e3ae85ed6c83c53effafc7050` and tooling
`6fc71045afeb77d9683eb615b6496a4419085865`, failed the original Android
handoff checks. All 9,522 actual CPU samples had raw
`PROFILER_SKIP_NOT_IN_SCOPE`; none supplied a call stack. The profiler was
started before app startup and selected a command line that can still change
during process specialization. Android's producer caches an initial process
rejection; the raw code alone does not distinguish that initial command-line
state from missing userspace register context. Missing symbols are therefore
not an adequate explanation for this capture.

The single CSS intervention in run `34232280323` also failed. Its source
`28be9b60cb0e66a6b115b774781c72b50e770468` loaded the unchanged hero stylesheet
from the document head. The stylesheet was served before commit and was no
longer pending at the readiness gate, but remaining stylesheet callbacks and
layout still ran late. All 661 GPU-thread samples again lacked stacks.
The intervention is rejected as an insufficient repair. One launch per source
does not establish that it caused a general slowdown.

## Bounded collection change

The new workflow returns to source `6592c51a1bd5812e3ae85ed6c83c53effafc7050`
and its 241-file web inventory
`8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588`.
Original native source, web readiness behavior, preparation stages, 60-second
system trace, capture assertions and deadlines remain unchanged.

A separate helper listens for the first exact `NATIVE_SURFACE` log marker,
verifies that PID's command line is exactly `com.robys.coffeehouse.debug`, then
starts an additional 45-second Perfetto session. Its 80 Hz `SW_CPU_CLOCK`
userspace DWARF sampling is scoped to that PID; kernel frames are disabled.
The second trace is separate from the original trace. No permission, rooting,
system-property, product-timeout or readiness changes are made.

The collector bounds marker wait, command-line read, foreground profiling and
pull, records both identities and commands, and retains partial failure
evidence. Its success state is `COLLECTED_UNVALIDATED`: collection does not
prove usable stacks. Original nonzero native verdicts take precedence over
observer, logging and report failures. A collected profile must still be
checked for raw skip reasons, loss, process identity and callsite coverage.

This observer adds CPU and ADB overhead and misses the interval before it
attaches. Its timings cannot certify product performance or be compared as
an unchanged-observer performance experiment. No candidate should enter PR346
until the existing functional and visual requirements pass on bound bytes.

## Local verification

The helper has 22 fake-ADB boundary controls for identity, scope, bounded waits,
command failures and partial evidence. The wrapper has 20 actual-shell
controls for native/profile outcomes, report and log I/O failures, timeout,
signals and preservation of original failure priority. The original capture
and trace configurations are asserted unchanged.
