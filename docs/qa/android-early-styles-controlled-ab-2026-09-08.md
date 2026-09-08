# Early stylesheet application: controlled Android diagnostic

This branch prepares an isolated A/B diagnostic, not a release candidate or a
replacement for PR #346 checks. No native performance verdict is available yet.
Both source pins and their committed-byte fixture inventories were verified locally.

## Hypothesis and scope

The observed source `6592c51a1bd5812e3ae85ed6c83c53effafc7050` reported its three
late stylesheet load callbacks about 4.1 seconds after the stylesheet wait began
in run `34229226048`. The served-resource records precede those callbacks; this
interval is not evidence of a 4.1-second download. The subsequent
`document.fonts.ready` wait is likewise not an attribution to font downloads.

The bounded hypothesis is that installing the three stylesheet links during HTML
parsing, before `DOMContentLoaded`, can avoid later style/layout work that delays
product readiness. The candidate places `android-app.css`, `hero-balance.css`, and
`mobile-install.css` after the existing 13 static stylesheets in their previous
cascade order. The CSS file bytes and existing dynamic-loader duplicate guards
remain unchanged. This changes homepage stylesheet timing in ordinary web entry
as well as the native handoff entry. It is not a native-only change.

Earlier load callbacks, lower readiness times, and a native completion marker are
separate observations. A successful collection does not prove a successful
handoff, a useful uncovered product frame, or a causal rendering improvement.

## Immutable arms

| Arm | Source commit | Web files | Web inventory SHA-256 |
| --- | --- | ---: | --- |
| Control | `6592c51a1bd5812e3ae85ed6c83c53effafc7050` | 241 | `8823867ecbd1325fde477779e8702a362a2cb8242d91d51cc2b5751d8309e588` |
| Candidate | `3ca3e5b20134a7e9678570105849333d23e96ac0` | 241 | `80b4c74cee5b5a8384e096960b06ecadc1d61ad2c3090c40feaeaa974ebe08f4` |

Both arms must retain native subtree
`f2f8179479394f164f82c8d5e5bdb0ad438bdb92`. The workflow asserts this identity
before running the native diagnostic. The subject preparation uses committed
bytes and independently asserts each source SHA, inventory digest, and file
count. Existing fixture and trace negative controls run in each matrix job.

## Workflow isolation and preserved controls

The base tooling commit is `6fc71045afeb77d9683eb615b6496a4419085865`. Its
`.github/workflows/pr346-raster-observer.yml` remains unchanged. The new workflow
is `.github/workflows/pr346-early-styles-probe.yml` and triggers only on
`diagnostic/pr346-early-styles-20260908`. It has a separate concurrency group,
read-only contents permission, and a two-arm matrix with `fail-fast: false`.

Relative to the original workflow, the changes are limited to:

- Workflow/job names, isolated trigger and concurrency group.
- Matrix source/inventory bindings and the arm label environment variable.
- Copying the new workflow into the existing workflow-evidence artifact path.
- A host-side provenance step that binds the arm, source, web inventory, native
  subtree, tooling commit, and archived workflow hash in
  `experiment-binding.json`.
- Unique artifact names containing the arm and tooling commit, plus archiving
  `experiment-binding.json`.

Every original preparation, collector, negative-control, build, capture, and
verification command is retained. The only change within an original command is
the archived workflow's source filename. All original evidence paths remain.
The new provenance step neither edits the fixture nor changes the collectors.

Both arms retain Android API 36, the Pixel 6 profile, software rendering, enabled
animations, a cold uninstalled app, the 120-second settling interval, original
capture deadlines and assertions, the 55-second delayed readiness export, and
the existing 80 Hz scoped CPU sampling configuration. No render setting,
readiness condition, success threshold, or failure propagation has been relaxed.
`if: always()` continues to collect and verify evidence after native failure.

## Decision boundary

Compare the two arms' archived source and tooling bindings before interpreting
results. Then compare readiness phases, native terminal state, trace coverage,
long render spans, and the captured first uncovered product frame. Keep
uncertainty from emulator variability and observer overhead explicit. One A/B
pair can support a narrow result for this setup; it cannot certify physical
Android devices or establish exclusive function-level causation when CPU
callstacks are unavailable.

The current PR head remains a separate subject. This diagnostic alone does not
approve merging PR #346, deploy any website change, or satisfy its outstanding
native and maintainer gates.

## Local validation

The following existing local controls passed using unchanged tooling bytes:

| Control | Result |
| --- | --- |
| Pinned fixture identity | 6/6 |
| Original trace capture and collector outcomes | 14 + 10 |
| Rendering output and wrapper verdict controls | 11 + 9 |
| Readiness collector tests | 7 test methods |
| Raster sampling scope | 12 negative controls rejected |
| Pinned entry module identity | 3 positive + 5 negative controls |
| Readiness export preparation, exact control subject | 35/35 |
| Readiness export preparation, exact candidate subject | 35/35 |

The candidate fixture was reconstructed through all four unchanged preparation
stages. It contains 241 web files with the inventory digest in the matrix above,
and retains the original native SHA-256
`b5fdce9d032204fead7fdb8ac5394b423ea03e2684a292e974c833c4997b8b51`.
The final diagnostic native SHA-256 is
`9ebd9c780f4bef5018f2937c760f68af7c20c0142333ebd4bd77f97b05e4baa0`,
and the extended trace configuration SHA-256 is
`19244cb7d0beefe4aa35469bc5c714c7de8c9a79171c27387b1e1fc48300f326`;
these match the control observation's diagnostic bytes.

The new workflow was parsed and compared against the immutable tooling parent's
workflow. All 15 original steps remain, with only the declared archive
substitutions and one added provenance step. All 19 hashed collector/tool files
match the parent byte for byte. Every shell run block passed `bash -n`.
Twelve negative configuration mutations were rejected: renderer, settling,
job deadline, failure propagation, collection after failure, fail-fast behavior,
trigger branch, required evidence, control source, web digest, archived workflow,
and omitted experiment binding.

Original workflow SHA-256:
`04dbd6ad733980950f6dc88f8b3246b03c144b03643cf5f8b7e63b6ded2f820f`.
Pinned A/B workflow SHA-256:
`8267ce00420e0927f5bc30dd29e67d7792789df01fff73e3f522dd0042f245d1`.

These local checks validate preparation, byte identity, and failure handling.
They do not supply an Android runtime or product-visibility result.
