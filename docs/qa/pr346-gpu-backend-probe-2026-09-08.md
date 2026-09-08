# PR346: explicit software graphics comparison

Source ablation run `34195176050` has not produced a repair. Original 7ca fails,
removing bridge filters fails, and removing hero noise only completes via fallback
while a 2400.747 ms draw crosses completion and continues 2336.702 ms afterward.
The latter is rejected despite its green native marker. These single observations
do not estimate an effect size or establish that either source surface is free
of cost. Both interventions stay outside PR346.

Internal observations locate repeated GPU raster/program setup and sync-token
waits. The remaining cost justifies testing the software graphics stack directly
before making further visible product changes. Logs from the original observation
and all three ablation arms report emulator 37.1.11.0, build 15917651. The `software`
choice selects GLES `swangle` and Vulkan `lavapipe`, with guest Skia OpenGL and
WebView 133.0.6943.137. No emulator-version drift between these runs is observed.

## One declared configuration intervention

Both fresh runners package original immutable
`7ca13b9adbf45b953c3b0997107d010e7bad1d9b` with the same 240 web files and inventory
`2c97e25ebf4e0c2b16f50818bc3a577b569a5d18a0f623ed21e498ff26e4395c`.
Original native source, pinned transport, tracing observer, capture source stamp,
recorder and all assertions are identical. The only matrix difference is
`-gpu software` versus `-gpu swiftshader`.

Android documents both as supported software modes. The former selects software
backends automatically; the latter explicitly selects SwiftShader for GLES and
Vulkan. This changes a graphics stack selection, not just one driver function.
The comparison cannot by itself attribute cost to Vulkan, GLES, ANGLE or a DOM
element. Actual backend/version logs must confirm what each runner selected.

API36, the default two guest CPUs, enabled animations, emulator-only 120-second
idle, original cold-provider wait, deadlines and trace windows remain unchanged.
No app/provider warmup, hardware GPU, extra CPU allocation, filtered samples or
performance waiver is introduced. Both arms retain failed native verdicts and
full trace/video artifacts; fail-fast is disabled.

## Acceptance boundary

A green marker alone remains insufficient. Compare complete raster waits and
video after the native outcome, source identities and evidence coverage. A
successful alternative would justify a separate untraced cold-launch validation
before any CI repair; it would not establish physical-device or production
Android performance. No change to PR346, merge or deployment follows from
publishing this diagnostic.

## Primary references

- <https://developer.android.com/studio/run/emulator-acceleration>
- <https://developer.android.com/studio/releases/emulator>
