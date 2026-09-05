# Share-region capture verification — 5 September 2026

## Two distinct problems

The real category-heading occlusion is repaired in f38487e and covered by its
48-case scroll-clearance suite. Separately, a locator screenshot centers the whole
share card, which can move sticky controls into a tall component crop. That is not
proof that its individual heading and actions are unreachable.

The new helper captures the share component in document coordinates. It does not
hide or reposition sticky UI, change viewport dimensions or relax pixel thresholds.
A separate viewport test scrolls to and hit-tests the heading and all three actions.
The workflow runs that test before the screenshot comparison.

## Executed evidence

Read-only diagnosis run 33946953969 checked out product source
f38487ec64f60e0721ae5b23074527497886eca1 against main
04b3ce7549a2fc111bcc13ca9cf92adabb29dd4a. The candidate changed only test/capture
files. Full npm check and verify:security passed, and protected public bytes were
unchanged. All 18 browser cases passed: six sticky fixtures at three heights and
two pixel densities, plus twelve product viewport/input profiles. These are not
18 additional complete application flows.

Artifact 9963660970 has SHA-256
007add6583827ae18339cb1bc14d1194bb0ed59aa48162da80fefe5bd77bfa29.
Its input tree, patch, three script blobs and raw baseline/current captures bind
the tested candidate. The final workflow uses the equivalent portable relative
output directory instead of the probe runner's expanded absolute workspace path;
that YAML was separately parsed. Core browser script bytes are unchanged.

Assistant inspection of all changed hero, menu and share capture families is
recorded in PR 338 comment 5549652273. The new supplemental visual record binds
17 exact public/capture inputs and all 13 observed changes among 43 comparisons.
Global thresholds and the exact one-to-one failure-set verifier are unchanged.
Earlier records are retained but do not match the new capture dimensions.

## Limits and release

This is assistant QA, not a fabricated human or independent approval. Required
current-head CI and the owner's conditional release authorization still apply.
Codex is not requested. Neither main nor Pages is changed by this commit.
