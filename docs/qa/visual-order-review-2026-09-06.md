# PR #341: visual capture repair and reviewed order changes

This is an assistant's technical visual inspection under the owner's request to
fix the remaining Visual failure. It is **not** an independent human approval,
a merge/deployment authorization, or a claim that every release gate passes.

## Problem and repair

Head `0893c361f035e7c6bf6d9456ee82d8dfb14ab601` passed Lighthouse but failed
Visual with 24 differences out of 43 and no matching content-bound review.
The comparator correctly retained that failure. The base is
`a2fbce66f716b1b99e924239d5dd118cf37c5eef`.

Locator auto-scroll composed fixed navigation, the order bar and even an
off-viewport unfocused skip link over document components. The Discover 360×640
crop made both actions appear obstructed. Menu-preview and Visit crops had the
same capture problem. These three captures now use the existing document-region
helper, as menu-share already does, symmetrically for base and current.
The helper, browser viewport, CSS, DOM nodes, masks and global pixel thresholds
are unchanged. Full-page and hero captures still show the order entry; if an
overlay intersects a document region at its initial viewport position it remains
in the image. Document crops do not prove viewport reachability.

`order-visual-reachability.mjs` independently activates Discover's mark and menu
actions, the last homepage menu category, both map entry surfaces and the social
offer using ordinary taps/clicks. It verifies resulting state/navigation and
popup creation, actual viewport width, the hidden skip link, price and absence
of app page errors. External requests are blocked; popup activation does not
claim that Instagram or Maps delivered a working external page. CSP is enforced;
service workers are blocked for deterministic cold runs. No forced input or
hidden/repositioned overlays are used.

The hero suite now includes 360×640 with TR/EN/RU, 16/32px root text and empty/
99-item saved orders, retaining all existing 320/390/1440×1000 cases and the
original obstruction negative control.

## Exact evidence and disposition

Comparison candidate `da88f49b2d608dcb46220af1a32a779c5c3cbe69` changes QA files
only from the PR's public runtime. Run
[34010630519](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34010630519)
preserves two independent attempts with **identical comparison metrics**:
24 captures pass the original limits and 19 require the following review.
The raw comparator and the evidence workflow remain failed; they are not
relabeled as an ordinary pixel-match pass.

| Compared areas | Count | Disposition |
| --- | ---: | --- |
| Home, menu, Discover full pages at 320/390/768/1440 | 12 | Intentional +96px bottom reservation for the visible shared order. Existing content and the new order entry were inspected. `diff=1` is the dimension-mismatch sentinel, not measured 100% pixel corruption. |
| Hero at 360/390/1366/1440 | 4 | Intentional measured clearance and visible order; short hero grows from 640 to 713px. Real navigation and clearance are checked separately, including at 360×640. |
| Discover at 768/1440 | 2 | The new order bar intersects the document crop at its initial viewport position. It is retained, not masked. Mark and category navigation are checked independently. |
| Social offer at 360×640 | 1 | Raster-origin difference, not changed copy or geometry: both relative child rectangles, text, fonts, colors, overall width and height match exactly. Document Y changes from 7594.5625 to 7666.984375px after hero growth. The fractional phase changes by 0.421875px; the crop differs by 3572/88560 pixels. Price remains 340 ₺ and ordinary link activation is tested. |

The exact metrics and measured geometry are retained in
[`qa/evidence/pr-341-visual-summary.json`](../../qa/evidence/pr-341-visual-summary.json).
The supplemental reviewed-change record binds 34 actual input/runtime/test blobs
and the complete set of 19 comparisons. Ratio ceilings equal the observed values;
dimension reasons must match exactly. It does not grant a general tolerance to
future edits. No baseline file, Lighthouse budget or global visual limit changes.
The unchanged verifier accepts both retained comparison attempts and rejects
an injected extra failed comparison and one additional changed social-offer pixel.

## Verification, including failed attempts

- On comparison candidate `da88f49…`: complete `npm run check`, security and
  generated-byte parity succeeded; hero **48/48** and the original-obstruction
  control **1/1** passed. Expanded UI/UX: **24/24**, no recovered attempts.
- The initial action harness ran its storage initializer in blocked external
  frames. The first two diagnostic runs retain **12/36 failed cases**, with
  `localStorage` access-denied errors after actual navigation/activation succeeded.
  This was test instrumentation, not a reason to suppress app errors.
- Candidate `2d6eb39fc823c3a1f7c7dc24bb9a44a086532576` restricts seeded state to
  the app's top-level origin. Run
  [34010976613](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34010976613)
  passes all **36/36** action cases, full source/security checks and generated
  parity. The case matrix is six viewport pairs × three languages × two paired
  states (16px/empty and 32px/saved99), always reduced motion. These counts overlap
  with other suites and are not additive unique guest journeys.
- The comparison runner, hero test and public runtime are identical between
  these candidates. The later test-state scoping change does not change rendered
  site files or comparison inputs. Diagnostic helper workflows remain confined
  to the QA branch and are not included in the PR repair.

| Evidence | Artifact | SHA-256 |
| --- | --- | --- |
| Original PR Visual, run 34008698059 | 9981820803 | `eab10c42c027f4b0bfe23059a76142f0bd9e6ec94534b46f3ccfd7d3452f199b` |
| First diagnostic, run 34010407131 | 9982356244 | `85e4f345d5f2372242e4f6d9bd1162129e3cd9132cdde625ba57f0c1d4e251a6` |
| Two final comparison attempts, run 34010630519 | 9982410137 | `4510c94f06e190ad831767ae39fe686db68b1a53991affa0e6252cea59c8b40e` |
| Corrected action harness, run 34010976613 | 9982461876 | `ba43a678af871a997539f9c4ee78ce9e0abacae51610b9135399eb32833af623` |

Fresh PR CI must verify the integrated commit; candidate evidence is not relabeled
as final-head execution. Lighthouse on the prior PR head already passed both
profiles (21,932 mixed-route first-party JS bytes); this repair changes no public
JS/CSS/HTML bytes. The separate native Android failure, service-worker upgrade
coverage, maintainer authority and live-site verification remain outside this
visual repair. No physical-device, exhaustive responsive or deployed-site claim.
