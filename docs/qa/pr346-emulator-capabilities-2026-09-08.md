# Installed emulator tracing capability inspection

This diagnostic inspects the SDK package corresponding to failed observation
34237004349: emulator 37.1.11, build 15917651. PR346 remains contextual source
7799f80b5a6561beec57f2d98f8e8ca58e8c36fa; this job does not check out, build or
run the app, create an AVD, attach to a process, or change host permissions.

The helper records package metadata and four documented commands: version,
help-all, help-debug-tags and help-environment. It checks fresh tooling identity,
exact version/build, output hashes and bounded completion. Each command has a
10-second timeout and a 2 MiB per-stream limit. Incomplete results retain exit42.
The workflow has a five-minute job limit and a 90-second outer collector bound.

Five fixed SDK binary paths are inspected for five source-backed literal
markers. Missing files and absent strings remain distinct. Each present file
is streamed with a 512 MiB bound and its hash, size and observed metadata recorded.
This is explicitly LITERAL_PRESENCE_ONLY: unused strings or a stub implementation
do not establish a working tracing backend. No binary trace flag is executed.

Local focused tests pass 22/22, including exact build rejection, conflicting
version output, command failure, timeout, output bounds, path containment,
missing files and a marker split across read chunks. Root independently reran
the same 22 tests. Successful collection means only
CAPABILITIES_RECORDED_UNVALIDATED. Runtime trace activation and host event
coverage require separate evidence.

Primary discovery source:
[Android emulator command-line help](https://developer.android.com/studio/run/emulator-commandline).
Current AEMU source provides an in-process Perfetto candidate, while also carrying
a stub implementation. Neither that source nor historical ANDROID_EMU_TRACING
release notes establish support in this exact installed build.

No product assertion, timeout, visual threshold, merge or deployment changes.
