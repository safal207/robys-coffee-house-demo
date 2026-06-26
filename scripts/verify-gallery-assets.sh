#!/usr/bin/env bash
set -euo pipefail

assets=(
  "src/products/gallery-v5/latte.webp"
  "src/products/gallery-v5/iced-latte.webp"
  "src/products/gallery-v5/san-sebastian.webp"
  "src/products/gallery-v5/lotus-cheesecake.webp"
  "src/products/gallery-v5/croissant.webp"
  "src/products/gallery-v5/nutella-croissant.webp"
)

max_file_bytes=$((140 * 1024))
max_total_bytes=$((700 * 1024))
min_file_bytes=$((60 * 1024))
total_bytes=0

printf 'Owner gallery asset sizes:\n'
for asset in "${assets[@]}"; do
  if [[ ! -f "$asset" ]]; then
    echo "Missing owner gallery asset: $asset" >&2
    exit 1
  fi

  bytes=$(wc -c < "$asset")
  riff_magic=$(head -c 4 "$asset")
  webp_magic=$(dd if="$asset" bs=1 skip=8 count=4 status=none)
  total_bytes=$((total_bytes + bytes))
  printf '%9d  %s\n' "$bytes" "$asset"

  if [[ "$riff_magic" != "RIFF" || "$webp_magic" != "WEBP" ]]; then
    echo "Gallery asset is not a real RIFF/WebP file: $asset" >&2
    exit 1
  fi

  if (( bytes < min_file_bytes )); then
    echo "Gallery asset appears over-compressed: $asset ($bytes bytes)" >&2
    exit 1
  fi

  if (( bytes > max_file_bytes )); then
    echo "Gallery asset exceeds 140 KiB: $asset ($bytes bytes)" >&2
    exit 1
  fi
done

if (( total_bytes > max_total_bytes )); then
  echo "Gallery assets exceed 700 KiB in total: $total_bytes bytes" >&2
  exit 1
fi

if find src/products/gallery-v5 -maxdepth 1 -type f -name '*.png' | grep -q .; then
  echo "Raw multi-megabyte PNG uploads must not ship to production." >&2
  exit 1
fi

if grep -nE 'src/products/(cards/.*\.svg|gallery-v2/.*\.avif|gallery-v4/.*\.webp)' src/featured-gallery.ts; then
  echo "The typed featured gallery must use only the reviewed gallery-v5 posters." >&2
  exit 1
fi

if ! grep -q 'image.width = 1254' src/featured-gallery.ts || ! grep -q 'image.height = 1254' src/featured-gallery.ts; then
  echo "The gallery must reserve the uploaded 1254x1254 image dimensions." >&2
  exit 1
fi

if ! grep -q 'image.loading = index === 0 ? "eager" : "lazy"' src/featured-gallery.ts; then
  echo "Only the first owner poster may load eagerly." >&2
  exit 1
fi

if grep -n '100vh' featured-gallery.css src/featured-gallery.ts index.html; then
  echo "Use dynamic viewport units such as 100dvh instead of 100vh in the gallery path." >&2
  exit 1
fi

echo "Owner gallery checks passed ($total_bytes bytes total). Browser tests verify the exact 1254x1254 dimensions."
