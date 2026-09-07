# Calm takeaway entry — 7 September 2026

The owner asked to replace the abrupt, layered entry with a relaxing scene of a
real Roby's takeaway cup, “Возьми с собой”, and a small tactile response. The cup
reference was supplied by the owner in this task.

## Change and boundaries

- One shared scene for morning, day and night. White takeaway cup, real brand
  reference, warm espresso background, gentle 10 px entrance and stationary
  opacity exit. No carousel, spinning object, zooming exit, or moving ribbons.
- Russian “Возьми с собой.”, Turkish “Yanına al.”, English “Take it with you.”
  follows the existing saved site language.
- Cold timing: 1050 ms from decoded image to handoff plus 480 ms dissolve.
  Warm timing: 350 + 250 ms. No mandatory minimum before tapping to continue.
- Failed image decode releases the page; stalled image decode is bounded at
  600 ms. A separate 2300 ms scene stop and existing 2800 ms import recovery
  protect navigation. JavaScript timers are not a real-time scheduling guarantee.
- Reduced motion and back/forward routing continue to bypass the bootstrap
  scene; Tab, Escape, visibility changes and pagehide release a running scene.
- Haptics: at most one 8 ms `navigator.vibrate` call after browser-reported user
  activation, including a tap on the scene. Unsupported/denied vibration is
  optional. No physical vibration or iOS support claim; no Android APK rebuild.
- Homepage, menu and discover use the same entry. Smart Choice and the native
  Android atomic-handoff path retain their existing routing.
- Asset: `src/brand/robys-takeaway-cup-v1.webp`, 640 × 918, 27,174 bytes. Prepared
  with the built-in image tool from the user's photograph, then resized/encoded
  with Sharp. This is a generated product rendition, not an unchanged photograph
  or a new master identity asset. The original photo is not published.
- Prompt: isolate the supplied white lidded Roby's cup, preserve printed identity
  and proportions, remove hand/table/chairs, soft studio light, no added objects
  or copy. Initial output had baked checkerboard; corrected its background to
  espresso. The final asset and matching background were inspected in-browser.
- Entry module and image are precached; build synchronizes its content hash in
  bootstrap and service worker. Integrity manifest regenerated.

## Validation

Base: `a2fbce66f716b1b99e924239d5dd118cf37c5eef` (current main when fetched).

| Check | Result |
| --- | --- |
| `npm run check` | PASS |
| `npm run verify:security` | PASS; 285 contracts, no secrets found |
| `npm run verify:entry-handoff` | PASS; active module byte hash and offline match |
| `npm run test:takeaway-entry` | PASS; 19 deterministic lifecycle tests |
| `node scripts/verify-performance-contract.mjs` | PASS; existing static budgets |
| Actual browser scene replay | loading 1 ms → decoded brand 8 ms → handoff 1059 ms → done 1620 ms |
| Mobile 390 / RU; 320 / TR; desktop 1280 / EN | Visual inspection, screenshots below |
| Actual homepage → View Menu | Browser click opened the menu after the entry |

The deterministic tests simulate lifecycle scheduling and capability failure;
they do not measure rendered FPS or physical haptics. Browser measurements above
are a single run, not a device-wide performance certification. One clipped
screenshot request timed out; full-viewport capture succeeded. The browser also
reported extension metadata errors, not attributed to application code.

## Reproduction

`npm ci`, `npm run dev`, then open `/qa/takeaway-preview.html`. Select a width
and language. “Still frame” creates the production component with its production
CSS and holds it for inspection; it is not timing evidence. “Replay transition”
runs the production lifecycle and prints event times. “Open real homepage” opens
the actual product in the selected viewport for handoff/navigation checking.

Vite is a dev dependency only, added because this static repository lacked a
development preview script. The production build/deployment architecture is
unchanged. QA fixtures are excluded from the integrity/public-artifact scope.

## Remaining release gate

This is an intentional visual redesign. Existing Morning/contextual/premium-depth
browser certifications still encode the old spline geometry (red surface,
multiple layers, 20 poses). Their old visual expectations are not evidence for
the new scene and are expected to require redesign-specific review. No old
threshold, snapshot, security gate, or workflow was relaxed in this change.
Keep the PR draft until the required current-head CI and visual/review decisions
are resolved. Do not infer that the live site already serves this change.

## Screenshots

![Russian, 390 px](../../qa/evidence/takeaway-entry/mobile-390-ru.jpg)

![Turkish, 320 px](../../qa/evidence/takeaway-entry/mobile-320-tr.jpg)

![English, 1280 px](../../qa/evidence/takeaway-entry/desktop-1280-en.jpg)
