#!/usr/bin/env bash
set -euo pipefail

assets=(
  "src/products/gallery-v2/latte.avif"
  "src/products/gallery-v2/san-sebastian.avif"
  "src/products/gallery-v2/iced-latte.avif"
  "src/products/gallery-v2/nutella-croissant.avif"
  "src/products/gallery-v2/lotus-cheesecake.avif"
)

max_file_bytes=$((4 * 1024 * 1024))
max_total_bytes=$((12 * 1024 * 1024))
total_bytes=0

printf 'Gallery asset sizes:\n'
for asset in "${assets[@]}"; do
  if [[ ! -f "$asset" ]]; then
    echo "Missing gallery asset: $asset" >&2
    exit 1
  fi

  bytes=$(wc -c < "$asset")
  total_bytes=$((total_bytes + bytes))
  printf '%9d  %s\n' "$bytes" "$asset"

  if (( bytes > max_file_bytes )); then
    echo "Gallery asset exceeds 4 MiB: $asset ($bytes bytes)" >&2
    exit 1
  fi
done

if (( total_bytes > max_total_bytes )); then
  echo "Gallery assets exceed 12 MiB in total: $total_bytes bytes" >&2
  exit 1
fi

if grep -n 'src/products/cards/.*\.svg' src/featured-gallery.ts index.html; then
  echo "The featured gallery must use uncropped gallery-v2 AVIF posters, not legacy SVG wrappers." >&2
  exit 1
fi

if grep -n '100vh' featured-gallery.css src/featured-gallery.ts index.html; then
  echo "Use dynamic viewport units such as 100dvh instead of 100vh in the gallery path." >&2
  exit 1
fi

echo "Gallery asset and dynamic viewport checks passed ($total_bytes bytes total)."
