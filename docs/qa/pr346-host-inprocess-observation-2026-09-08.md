# PR346 host in-process observation candidate

This diagnostic experiment asks whether the installed emulator can emit useful
host graphics events without host perf. It does not repair Android or certify
pairing causality. It remains separate from PR346 product head 7799f80b.

## Evidence authorizing this bounded experiment

Headless capability run 34246647280, tooling
ceee5b0d58eed0b1662ad1016d47eb09267d384e, recorded SDK 37.1.11.0
build 15917651 and all four documented help commands successfully. Artifact
10064267116, 52,736 bytes, SHA256
510c6853451724fd6d02dff3f266ebbc29e91bbc173f3bdfb07b389793c12d8f.
The headless engine contains VPERFETTO_TRACE_ENABLED; the tracing library
contains output-file, activation, and save message literals. This establishes
a candidate implementation, not functioning host tracing.

The helper freezes four observed SHA256 identities: launcher, headless engine,
libandroid-emu-tracing.so, and libgfxstream_backend.so. Before the Android action,
the unchanged capability helper records the package again. Before the original
120-second settling interval, the new wrapper rechecks actual binary bytes and
binds exactly one running headless engine by executable path, PID, starttime,
and argv. It also requires that only the intended host-trace environment is
active. This second check matters because the action installs the current SDK
emulator package before launching.

## Changes and preserved conditions

The diagnostic branch is
diagnostic/pr346-host-inprocess-observer-20260908. The workflow retains source
6592c51a1bd5812e3ae85ed6c83c53effafc7050,241 web files, inventory SHA-256
8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588,
the same four preparation stages, original native code and capture, original
deadlines, software renderer, guest profiling, 120-second settling, and KVM setup.
No host perf access or permission setting is changed.

Only VPERFETTO_TRACE_ENABLED=1 and the absolute VPERFETTO_HOST_FILE activate
the new observer. ANDROID_EMU_TRACING is not enabled; optional guest-file and
combined-file environment variables must be empty. The help-verified
`-stdouterr-file` records emulator activation and save messages in the evidence
directory. No source or capture threshold changes are included.

The original settling/capture chain runs inside one shell wrapper. Its exit
is saved separately and retains priority if writing that record fails. The
existing late-profile-exits.txt remains the source for original native probe
and guest-profiler exits. Identity failure prevents starting the product probe
and remains INCOMPLETE.

## Normal teardown and fail-closed collection

The reviewed android-emulator-runner@v2.38.0 resolves to
a421e43855164a8197daf9d8d40fe71c6996bb0d, also observed in the previous
run 34237004349. Its executed lib/main.js catches script failures, marks the
action failed, and still awaits killEmulator. That method uses the existing
adb emu kill path; it swallows a kill-command failure. Completion of adb does
not mean QEMU has exited or flushed a file.

An always-run finalizer waits at most 45 seconds for the bound PID/starttime to
exit or become a zombie. It adds no kill signal. It rechecks the same four
package identities, reads the original exits, requires activation, ended,
and completed-host-save log witnesses, and hashes a stable nonempty regular
host trace (maximum 128 MiB). The log is limited to 16 MiB for validation. A missing
or partial result, stalled teardown, identity mismatch, or missing witness
is INCOMPLETE with exit 42. A collection success is COLLECTED_UNVALIDATED,
never a product PASS. The original failed action remains failed.

## Interpretation limits

This observer starts at emulator initialization, before the120-second settling
interval. Source documentation indicates a 100 MiB SDK buffer, but actual build
configuration, buffer loss, and retention of the product interval require raw
trace analysis. The added observer and file logging can change scheduling;
performance comparisons do not have an unchanged observer.

Nonempty output plus log witnesses establishes collection only. Relevant
host events, request service coverage, PID/TID mapping, clock alignment,
packet loss, and overlap with the failed handoff remain NOT_RUN until the
recorded protobuf is independently inspected. Host scope duration includes
scheduling and is not a host CPU stack profile. Separate gfxstream tracing
categories are not assumed to enter the AEMU session.

## Primary implementation sources

- Activation and teardown in public QEMU source 9172e21fe3376fba0585c69dea67060e16c2b376:
  https://android.googlesource.com/platform/external/qemu/+/9172e21fe3376fba0585c69dea67060e16c2b376/android-qemu2-glue/qemu-setup.cpp
- In-process recorder and synchronous host save:
  https://android.googlesource.com/platform/external/qemu/+/9172e21fe3376fba0585c69dea67060e16c2b376/android/third_party/perfetto-tracing-only/perfetto-sdk-tracing-only.cpp
- Exact reviewed action implementation:
  https://github.com/ReactiveCircus/android-emulator-runner/blob/a421e43855164a8197daf9d8d40fe71c6996bb0d/lib/main.js
  https://github.com/ReactiveCircus/android-emulator-runner/blob/a421e43855164a8197daf9d8d40fe71c6996bb0d/lib/emulator-manager.js
  https://github.com/ReactiveCircus/android-emulator-runner/blob/a421e43855164a8197daf9d8d40fe71c6996bb0d/lib/sdk-installer.js

The public source declares 37.2.7; it is not a full source-to-binary binding for
the installed 37.1.11 package. Runtime witnesses remain required.

Validation before publication: focused rejection of package drift, original
nonzero exit preservation, missing/incomplete trace rejection, and syntax /
workflow review. Live observation and product fix remain NOT_RUN here.

The setup step explicitly installs the emulator package before capability
inspection. The action may reinstall it, so the live binary check remains.
All archive paths stay within the prepared fixture; the copied capability
helper is retained for evidence and executes from the tooling checkout.
