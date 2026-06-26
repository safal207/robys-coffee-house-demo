# Gallery v5

Five source-quality mobile posters. Each image must stay 1536 x 1536 pixels, use WebP, remain below 350 KiB, and match the SHA-256 values enforced by scripts/verify-gallery-assets.sh.

Files:
- latte.webp
- san-sebastian.webp
- croissant.webp
- nutella-croissant.webp
- lotus-cheesecake.webp

Only the first poster loads eagerly. The other four use lazy loading. CSS must keep object-fit: contain so poster text and prices are never cropped.
