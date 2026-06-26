# Gallery v5

Six source-quality mobile posters derived from the owner-uploaded 1254 x 1254 PNG masters.

Production rules:

- keep the original 1254 x 1254 pixel dimensions;
- use WebP quality 92 with metadata stripped;
- keep every file below 140 KiB and all six below 700 KiB total;
- load only Latte eagerly and lazy-load the other five;
- use `object-fit: contain` so text and price badges are never cropped;
- update the SHA-256 contract in `scripts/verify-gallery-assets.sh` whenever an approved poster changes.

Files:

- `latte.webp`
- `iced-latte.webp`
- `san-sebastian.webp`
- `lotus-cheesecake.webp`
- `croissant.webp`
- `nutella-croissant.webp`
