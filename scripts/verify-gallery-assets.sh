#!/usr/bin/env bash
set -euo pipefail

assets=(
  "src/products/gallery-v4/latte.webp"
  "src/products/gallery-v4/san-sebastian.webp"
  "src/products/gallery-v4/iced-latte.webp"
  "src/products/gallery-v4/nutella-croissant.webp"
  "src/products/gallery-v4/lotus-cheesecake.webp"
  "src/media/latte-story-360.mp4"
)

max_file_bytes=$((4 * 1024 * 1024))
max_total_bytes=$((12 * 1024 * 1024))
max_latte_video_bytes=$((300 * 1024))
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

latte_video_bytes=$(wc -c < "src/media/latte-story-360.mp4")
if (( latte_video_bytes > max_latte_video_bytes )); then
  echo "Latte click video exceeds 300 KiB: $latte_video_bytes bytes" >&2
  exit 1
fi

if (( total_bytes > max_total_bytes )); then
  echo "Gallery assets exceed 12 MiB in total: $total_bytes bytes" >&2
  exit 1
fi

if grep -nE 'src/products/(cards/.*\.svg|gallery-v2/.*\.avif)' src/featured-gallery.ts index.html; then
  echo "The featured gallery must use the reviewed gallery-v4 WebP posters." >&2
  exit 1
fi

if ! grep -q 'src/media/latte-story-360\.mp4' src/featured-gallery.ts; then
  echo "Typed gallery source must reference the reviewed Latte click video." >&2
  exit 1
fi

if ! grep -q 'video\.preload = "none"' src/featured-gallery.ts; then
  echo "Latte video must remain lazy and use preload=none." >&2
  exit 1
fi

if grep -n '100vh' featured-gallery.css src/featured-gallery.ts index.html; then
  echo "Use dynamic viewport units such as 100dvh instead of 100vh in the gallery path." >&2
  exit 1
fi

echo "Gallery asset, lazy video and dynamic viewport checks passed ($total_bytes bytes total)."
