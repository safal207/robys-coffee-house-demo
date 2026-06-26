#!/usr/bin/env bash
set -euo pipefail

assets=(
  "src/products/gallery-v5/latte.webp"
  "src/products/gallery-v5/san-sebastian.webp"
  "src/products/gallery-v5/croissant.webp"
  "src/products/gallery-v5/nutella-croissant.webp"
  "src/products/gallery-v5/lotus-cheesecake.webp"
)

expected_sha256=(
  "c8fe6863ed484c4686bb81e6e4ca02930ed9fb3528e8e87c939b1cb6012b137f"
  "2605c5fe273ab06381160168f7181164df34b17e69e3f78123a2a5275d2c72eb"
  "8caad31a12eac7b84517df9a1121e136b98094ffa9a25f3cdbacdb6df838194c"
  "9afb75dae33eed0a8d9b13941b30f2ba999b69700e16146c6c1a939a07f863e6"
  "0fa65954e9915abfe2cf7c9e122565e8a7475cb37624711c301f181ff84caf68"
)

max_file_bytes=$((350 * 1024))
max_total_bytes=$((1500 * 1024))
min_file_bytes=$((180 * 1024))
total_bytes=0

printf 'Source-quality gallery asset sizes:\n'
for index in "${!assets[@]}"; do
  asset="${assets[$index]}"
  expected="${expected_sha256[$index]}"

  if [[ ! -f "$asset" ]]; then
    echo "Missing source-quality gallery asset: $asset" >&2
    exit 1
  fi

  bytes=$(wc -c < "$asset")
  actual=$(sha256sum "$asset" | awk '{print $1}')
  total_bytes=$((total_bytes + bytes))
  printf '%9d  %s\n' "$bytes" "$asset"

  if (( bytes < min_file_bytes )); then
    echo "Gallery asset appears over-compressed: $asset ($bytes bytes)" >&2
    exit 1
  fi

  if (( bytes > max_file_bytes )); then
    echo "Gallery asset exceeds 350 KiB: $asset ($bytes bytes)" >&2
    exit 1
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "Gallery asset digest mismatch: $asset" >&2
    echo "Expected: $expected" >&2
    echo "Actual:   $actual" >&2
    exit 1
  fi
done

if (( total_bytes > max_total_bytes )); then
  echo "Gallery assets exceed 1.5 MiB in total: $total_bytes bytes" >&2
  exit 1
fi

if grep -nE 'src/products/(cards/.*\.svg|gallery-v2/.*\.avif|gallery-v4/.*\.webp)' src/featured-gallery.ts; then
  echo "The typed featured gallery must use only the reviewed gallery-v5 source-quality posters." >&2
  exit 1
fi

if ! grep -q 'image.width = 1536' src/featured-gallery.ts || ! grep -q 'image.height = 1536' src/featured-gallery.ts; then
  echo "The gallery must reserve the original 1536×1536 image dimensions." >&2
  exit 1
fi

if ! grep -q 'image.loading = index === 0 ? "eager" : "lazy"' src/featured-gallery.ts; then
  echo "Only the first source-quality poster may load eagerly." >&2
  exit 1
fi

if grep -n '100vh' featured-gallery.css src/featured-gallery.ts index.html; then
  echo "Use dynamic viewport units such as 100dvh instead of 100vh in the gallery path." >&2
  exit 1
fi

echo "Source-quality gallery checks passed ($total_bytes bytes total)."
