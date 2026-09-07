# Shared order focus and delivery evidence — 6 September 2026

## Follow-up repair

The enlarged skip-to-content label could extend below its old fixed -100px
hiding offset and cover the header. It is now translated by its own height while
unfocused, bounded to the viewport and allowed to wrap. Keyboard focus reveals
the link without removing the accessible navigation shortcut.

Runtime/test candidate: `1017f6ad987b62c3a296cd47fa3c14841376a70d`.
Parent checkout: `ae0d022de0ae1878cfcaf7940757896e7e6e54a1`.
Candidate tree: `4cdb14e75297a3c77e867190aa072994c25683ae`.
Run: `34007892303`; workflow input: `2fa083f6785660acd5a7f6fd7a534881ec642060`.
Artifact: `9981562933`; downloaded archive SHA-256:
`d27c2752c8079560623128e96ba84a1a1d7607d1bef882df0c84c13c8ef52fa6`.
The archive digest was verified and the 320px enlarged-Russian screenshot was
inspected. The checkout, working-tree patch and candidate hashes are distinct.

Full build/check/security passed, as did hero/focus 36/36, original-obstruction
negative control 1/1, existing layout 12/12 and cross-route journeys 20/20. The
permanent test asserts both the unfocused offscreen state and the focused visible
state, retaining measured focus geometry. In the 320px/32px Russian saved-order
case, the focused rectangle was x=16, y=16, width=288, height=122.375.

Initial run 34007603608 passed the new unfocused checks but failed 18 synchronous
Playwright bounding-box focus checks. Its failure screenshots already showed the
focused link onscreen. The next test measures DOM geometry after two animation
frames, keeps the same visibility bounds and records the measured rectangle.
This timing correction does not claim that the initial run passed.

## Independent exact-checkout result

Run `34007505907` freshly checked out parent `ae0d022`, verified generated-byte
parity and passed hero 36/36, negative 1/1, demand loading 8/8, layout 12/12 and
journeys 20/20. Artifact `9981448133`, verified archive SHA-256:
`431c1523b18ba6f8ab0568748a3265d5181ae173261235d2698f4e3818718d0b`.
This independent checkout confirms the earlier combined candidate; the focus
follow-up is separately bound above. Test counts overlap and are not additive.

## Performance remains a release blocker

Run `34007505989`, mobile artifact `9981466804`, verified archive SHA-256:
`e06bfa41497ec8051526f8cd4e696fe55e47ac41bd4f47061b3a4b68146fa2c0`.
Its checkout is test merge `96078d5d2f66eaefe5ffc2c041992faf12ac7ef4`, associated
with PR head `ae0d022`. The summary combines three home and three menu runs.

Aggregate JavaScript transfer fell from 31,717 to 24,413.5 bytes (23.03% less),
but is still 10.27% above baseline 22,139 under an unchanged 5% limit. Home alone
transferred 28,513 bytes and menu 20,314. Neither initially loaded the full order
store/drawer. Aggregate Performance was 98.5/100, LCP 1780.8029ms, TBT 56.25ms,
CLS 0; TBT also exceeded the allowed baseline growth. Individual home scores were
82/98/98 and menu 99/100/100; the aggregate is not a stable per-page guarantee.
All these measurements use entry=off and do not certify the intro animation.

The parent full CI also passed gallery, Android native, WebKit and core UI, but
visual review and Day/Night remained red. The contextual artifact retained only
Morning evidence, so no missing Day/Night measurement is invented. No performance
budget, security policy or visual threshold was raised; no blind rerun is treated
as a repaired root cause. Fresh final-head CI and post-deployment checks remain.

No Codex request, merge, publication, QR/POS/payment or catalogue price change is
part of this update. Isolated preparation workflows are absent from the PR tree.
