# Homepage pairing photo fill — 19 October 2026 (Moscow)

The “Drink + dessert” entry photo inherited a `contain` override, leaving empty bands in its responsive frame. Removing that override restores the shared `object-fit: cover`. A mobile-only `object-position: 25% 50%` keeps the original cup logo visible while retaining a recognizable cake. The photograph and its proportions are unchanged; cover crops the outer edges.

`report.json`: 30/30 focused browser checks passed across Chromium and WebKit, widths 320, 360, 390, 768 and 1440 CSS pixels, each in RU, EN and TR. Every viewport was 900 px high. Checks verified a decoded 1024×1024 image, cover sizing, the mobile/desktop focal position, no document or card overflow, selected language, no uncaught application exceptions, and the unchanged native `menu.html#pairing-offers` href. These checks did not submit an order or navigate to an external destination.

The run served the emitted repository files unchanged over local HTTPS under the original CSP. It used fresh browser contexts, reduced motion, blocked service workers and external requests, and touch viewport emulation below 800 px. This is desktop engine evidence, not physical-phone or Samsung forced-dark verification. SHA-256 source bindings were identical before and after the run. The reported base commit predates this uncommitted CSS change; the file hashes identify the tested bytes.

Three retained screenshots show the final source without diagnostic style injection:

- `pair-chromium-320-ru.png`: narrowest, longest Russian mobile copy.
- `pair-webkit-390-ru.png`: WebKit mobile layout.
- `pair-chromium-1440-ru.png`: desktop crop and card.

Assistant visual inspection found no empty bands, distortion or clipped text in these samples. The cup logo is readable and the cake remains recognizable. The narrowest mobile frame intentionally crops the cake’s outer right edge. Additional WebKit 390/TR and 768/EN images were inspected during the same run. This is assistant review, not independent-human approval.

To reproduce, serve the built checkout over local HTTPS, set `robys-language` before loading `index.html?entry=off`, and use each viewport/language combination above. Scroll `.coffee-path-pair` into view, decode its image, inspect its computed `object-fit` and `object-position`, and capture that element. No CSS injection, replacement photo, new runtime, or test-framework change was used in the final run.
