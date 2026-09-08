# PR 346 passive readiness observation

This isolated diagnostic source records which existing preparation barrier delays
native product readiness. It is not a product repair or evidence of a passing
handoff. The current PR source remains unchanged by this experiment.

## Unobserved source identity

- Commit: `c9a9d9c5feeb35d8b6077485b537ab3b60f62b67`.
- Tree: `5addeba9033bf9df10f301e714466e148c39ae5c`.
- Native subtree, unchanged here: `f2f8179479394f164f82c8d5e5bdb0ad438bdb92`.
- Original `bootstrap-v2.js` SHA-256:
  `63411e8b1666f7f81a85d02998b23102bd0419383f14228eca0149001dd03831`.
- Original `android-native-product-frame.js` SHA-256:
  `b3fc17389457337e465cb93223907b2d6f2f4b98add0a2925176a80c9927f71f`.

Byte-exact copies of both original modules are retained under
`scripts/qa/fixtures/android-readiness-unobserved/` for differential lifecycle
tests. Their hashes are asserted before use. The original source is also
retrievable from that commit. Generated HTML, worker
references, and integrity evidence bind the observed runtime bytes separately.
Neither source identity should be substituted for the other in native evidence.

## Recorder and collection contract

Only the native route installs `window.__robysAndroidReadinessRecord(phase,
detail)`. `window.__robysAndroidReadinessDisabled === true` prevents installation.
Every caller isolates observer failures from product control flow.

After the critical capture window, the diagnostic native collector may evaluate:

```javascript
JSON.stringify(window.__robysAndroidReadinessSnapshot?.() ?? null)
```

The snapshot is a detached JSON-compatible object:

```json
{
  "schema": "robys.android.readiness.v1",
  "timeOriginMs": 0,
  "events": [{ "phase": "bootstrap", "atMs": 0 }],
  "dropped": 0
}
```

`timeOriginMs` is the finite browser performance time origin or null. `atMs` is
the finite `performance.now()` timestamp at the observed operation. `detail`,
when present, is a finite number or a string bounded to 160 characters. Phase
names are bounded to 80 characters. The buffer stores at most 128 events; later
records increment a saturating dropped counter. Snapshot mutation cannot alter
the recorder. Clock conversion into native trace time requires an explicitly
recorded alignment; epoch arithmetic alone is not submillisecond proof.

The recorder has no timers, promises, animation frames, console messages, media
operations, or layout queries. It performs bounded memory writes. Collection
must not introduce evaluation polling into the handoff window.

## Recorded boundaries

- Bootstrap, retained DOMContentLoaded event, and native module evaluation.
- DOM wait/resume; active stylesheet barrier and existing load/error events.
  `style` maps each stylesheet index to its href, `style-pending`, `style-loaded`,
  and `style-error` carry the same index.
- Before/after the existing header computed-style read; image decode start,
  completion, or rejection. Image index 0 is the hero poster, index 1 is the
  responsive header background.
- Existing font readiness await, animation discovery, and entrance completion.
- Both existing animation frame callbacks and the existing final opacity reads.
- Handoff state emissions, effective release, observed abort, late preparation
  after release, and preparation failure.

An unfinished phase indicates where its JavaScript continuation stopped. It
does not by itself distinguish resource completion from renderer scheduling or
prove that a completed visual frame reached the display. Concurrent native and
rendering traces and the full post-completion video remain necessary evidence.

## Observer-only review boundary

The diff retains the order and values of the existing product operations. DCL
and stylesheet callbacks pass their original event to resolve; the second
animation frame passes its original timestamp. Existing rejection and release
guards retain their behavior. No deadline, timeout, animation timing, readiness
condition, image selection, video playback, or stylesheet selection changes.

| Existing operation | Unobserved native module | Observed native module |
| --- | ---: | ---: |
| await expressions | 8 | 8 |
| requestAnimationFrame calls | 2 | 2 |
| getComputedStyle calls | 2 | 2 |
| getAnimations calls | 1 | 1 |
| image decode calls | 1 | 1 |
| timer calls | 0 | 0 |
| media play/load calls | 0 | 0 |

Bootstrap retains its two original timer call sites and adds no awaits or
animation frame calls. Count equality is supporting evidence only; controlled
dependency and lifecycle tests verify state and operation behavior.

## Validation

- Focused native product and recorder tests: 53/53 pass. Pending DOM, stylesheet,
  image, font, and entrance dependencies cannot falsely report readiness.
- Twenty differential mode/lifecycle comparisons against the byte-exact
  unobserved fixtures preserve states, timer/frame counts, synchronous reads,
  decodes, release-hook state, and absence of media calls. The modes cover
  enabled, disabled, deleted, throwing, and full recorders; transitions cover
  successful readiness and release, pending release, pending abort, and failure.
- `npm run check`: pass, including the combined final 60/60 native product,
  recorder, and hero video controls.
- `npm run verify:security`: pass, 287 security contracts and the unchanged
  secret scanner. An initial scan flagged explanatory text in a test object;
  renaming that object's nonfunctional field resolved the false positive.
- Build and integrity generation: pass. Native source and the generationless
  browser bridge remain byte-identical to the unobserved candidate.
- `git diff --check`: pass.

These are behavioral and source validation results. Native performance,
observer overhead, delayed export collection, and the actual displayed frame
still require the separately bound diagnostic run. No native deadline or smoke
assertion has been altered here, and no performance or release certification is
claimed.
