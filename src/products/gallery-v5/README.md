# Gallery v5

Six owner-approved square posters, preserved as 1254 x 1254 WebP masters plus 828 x 828 mobile derivatives.

Production rules:

- keep the original 1254 x 1254 masters at high quality;
- generate 828 x 828 WebP derivatives with `scripts/build-responsive-gallery.sh`;
- serve both candidates through `srcset` and an explicit `sizes` contract;
- use the 828 px file as the safe fallback and the 1254 px file for Retina/high-density layouts;
- load only Latte eagerly and lazy-load the other five;
- use `object-fit: contain` so typography and price badges are never cropped;
- verify generated derivatives against `responsive.sha256`.

Current candidate widths: 828w and 1254w.
