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
  dimensions=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$asset")
  format=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$asset")
  total_bytes=$((total_bytes + bytes))
  printf '%9d  %-10s  %-8s  %s\n' "$bytes" "$dimensions" "$format" "$asset"

  if [[ "$dimensions" != "1254x1254" ]]; then
    echo "Gallery asset must preserve the uploaded 1254x1254 source dimensions: $asset ($dimensions)" >&2
    exit 1
  fi

  if [[ "$format" != "webp" ]]; then
    echo "Gallery asset must be a real WebP file: $asset ($format)" >&2
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

echo "Owner gallery checks passed ($total_bytes bytes total)."
