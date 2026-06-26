#!/usr/bin/env bash
set -euo pipefail

names=(latte iced-latte san-sebastian lotus-cheesecake croissant nutella-croissant)
full_total=0
responsive_total=0

printf 'Gallery asset sizes:
'
for name in "${names[@]}"; do
  for suffix in "" "-828"; do
    asset="src/products/gallery-v5/${name}${suffix}.webp"
    [[ -f "$asset" ]] || { echo "Missing gallery asset: $asset" >&2; exit 1; }
    bytes=$(wc -c < "$asset")
    riff_magic=$(head -c 4 "$asset")
    webp_magic=$(dd if="$asset" bs=1 skip=8 count=4 status=none)
    printf '%9d  %s
' "$bytes" "$asset"
    [[ "$riff_magic" == "RIFF" && "$webp_magic" == "WEBP" ]] || {
      echo "Gallery asset is not a real RIFF/WebP file: $asset" >&2; exit 1;
    }
    if [[ "$suffix" == "-828" ]]; then
      (( responsive_total += bytes ))
      (( bytes <= 120 * 1024 )) || { echo "Responsive poster exceeds 120 KiB: $asset" >&2; exit 1; }
      (( bytes >= 20 * 1024 )) || { echo "Responsive poster appears over-compressed: $asset" >&2; exit 1; }
    else
      (( full_total += bytes ))
      (( bytes <= 140 * 1024 )) || { echo "Full poster exceeds 140 KiB: $asset" >&2; exit 1; }
      (( bytes >= 60 * 1024 )) || { echo "Full poster appears over-compressed: $asset" >&2; exit 1; }
    fi
  done
done

(( full_total <= 700 * 1024 )) || { echo "Full posters exceed 700 KiB: $full_total" >&2; exit 1; }
(( responsive_total <= 500 * 1024 )) || { echo "Responsive posters exceed 500 KiB: $responsive_total" >&2; exit 1; }

(
  cd src/products/gallery-v5
  sha256sum -c responsive.sha256
)

if find src/products/gallery-v5 -maxdepth 1 -type f -name '*.png' | grep -q .; then
  echo "Raw multi-megabyte PNG uploads must not ship to production." >&2
  exit 1
fi

if grep -nE 'src/products/(cards/.*\.svg|gallery-v2/.*\.avif|gallery-v4/.*\.webp)' src/featured-gallery.ts; then
  echo "The typed featured gallery must use only gallery-v5 posters." >&2
  exit 1
fi

for token in 'image.srcset' '828w' '1254w' 'image.sizes' 'image.loading = index === 0 ? "eager" : "lazy"'; do
  grep -q "$token" src/featured-gallery.ts || { echo "Missing responsive gallery contract: $token" >&2; exit 1; }
done

if grep -n '100vh' featured-gallery.css src/featured-gallery.ts index.html; then
  echo "Use dynamic viewport units such as 100dvh instead of 100vh in the gallery path." >&2
  exit 1
fi

echo "Gallery checks passed: masters=${full_total} bytes, responsive=${responsive_total} bytes."
