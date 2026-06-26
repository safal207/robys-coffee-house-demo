#!/usr/bin/env bash
set -euo pipefail

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp is required (install the webp package)." >&2
  exit 1
fi

names=(
  latte
  iced-latte
  san-sebastian
  lotus-cheesecake
  croissant
  nutella-croissant
)

for name in "${names[@]}"; do
  source="src/products/gallery-v5/${name}.webp"
  target="src/products/gallery-v5/${name}-828.webp"
  [[ -f "$source" ]] || { echo "Missing source: $source" >&2; exit 1; }
  cwebp -quiet -q 86 -m 6 -resize 828 828 "$source" -o "$target"
done

(
  cd src/products/gallery-v5
  sha256sum *-828.webp > responsive.sha256
)

python3 <<'PY'
from pathlib import Path
import re

names = [
    "latte",
    "iced-latte",
    "san-sebastian",
    "lotus-cheesecake",
    "croissant",
    "nutella-croissant",
]
version = "20260626-7"
sizes = "(max-width: 680px) calc(100vw - 40px), (max-width: 1100px) 42vw, 360px"

# Typed source: two candidates, lightweight fallback, full Retina master.
ts_path = Path("src/featured-gallery.ts")
ts = ts_path.read_text()
if "imageSmall: string;" not in ts:
    ts = ts.replace("  image: string;\n", "  image: string;\n  imageSmall: string;\n", 1)
for name in names:
    replacement = (
        f'    image: "src/products/gallery-v5/{name}.webp?v={version}",\n'
        f'    imageSmall: "src/products/gallery-v5/{name}-828.webp?v={version}",'
    )
    pattern = re.compile(
        rf'    image: "src/products/gallery-v5/{re.escape(name)}\.webp\?v=[^"]+",'
        rf'(?:\n    imageSmall: "[^"]+",)?'
    )
    ts, count = pattern.subn(replacement, ts, count=1)
    if count != 1:
        raise SystemExit(f"Could not update typed source for {name}")

source_block = re.compile(
    r"  image\.src = product\.(?:image|imageSmall);\n"
    r"(?:  image\.srcset = .*\n)?"
    r"(?:  image\.sizes = .*\n)?"
)
ts, count = source_block.subn(
    '  image.src = product.imageSmall;\n'
    '  image.srcset = `${product.imageSmall} 828w, ${product.image} 1254w`;\n'
    f'  image.sizes = "{sizes}";\n',
    ts,
    count=1,
)
if count != 1:
    raise SystemExit("Could not update responsive image assignment")
ts_path.write_text(ts)

# Static HTML fallback must also be responsive; otherwise the parser downloads all masters before JS runs.
index_path = Path("index.html")
html = index_path.read_text()
html = re.sub(r'<meta name="robys-build" content="[^"]+" />', f'<meta name="robys-build" content="{version}" />', html, count=1)
html = re.sub(r'featured-gallery\.js\?v=[^"]+', f'featured-gallery.js?v=responsive-{version}', html, count=1)
for name in names:
    pattern = re.compile(
        rf'<img src="src/products/gallery-v5/{re.escape(name)}(?:-828)?\.webp\?v=[^"]+"'
        rf'(?: srcset="[^"]+")?(?: sizes="[^"]+")?([^>]*)/>'
    )
    replacement = (
        f'<img src="src/products/gallery-v5/{name}-828.webp?v={version}" '
        f'srcset="src/products/gallery-v5/{name}-828.webp?v={version} 828w, '
        f'src/products/gallery-v5/{name}.webp?v={version} 1254w" '
        f'sizes="{sizes}"\\1/>'
    )
    html, count = pattern.subn(replacement, html, count=1)
    if count != 1:
        raise SystemExit(f"Could not update HTML fallback for {name}")
index_path.write_text(html)

# Browser contract: inspect the selected binary directly, not density-corrected naturalWidth.
qa_path = Path("qa/gallery.spec.ts")
qa = qa_path.read_text()
qa = qa.replace(
    'test("all six source-quality posters render inside their square frames", async ({ page }) => {',
    'test("all six responsive posters render inside their square frames", async ({ page }) => {'
)
qa = qa.replace(
    '    const result = await image.evaluate((element: HTMLImageElement) => {',
    '    const result = await image.evaluate(async (element: HTMLImageElement) => {'
)
qa = qa.replace(
    '      const style = getComputedStyle(element);\n\n      return {\n'
    '        path: new URL(element.currentSrc || element.src).pathname,\n'
    '        naturalWidth: element.naturalWidth,\n'
    '        naturalHeight: element.naturalHeight,\n',
    '      const style = getComputedStyle(element);\n'
    '      const probe = new Image();\n'
    '      probe.src = element.currentSrc || element.src;\n'
    '      await probe.decode();\n\n'
    '      return {\n'
    '        path: new URL(element.currentSrc || element.src).pathname,\n'
    '        fallbackPath: new URL(element.src).pathname,\n'
    '        srcset: element.srcset,\n'
    '        sizes: element.sizes,\n'
    '        selectedPixelWidth: probe.naturalWidth,\n'
    '        selectedPixelHeight: probe.naturalHeight,\n'
)
qa = qa.replace(
    '    expect(result.path).toMatch(/^\\/src\\/products\\/gallery-v5\\/[a-z0-9-]+\\.webp$/);\n'
    '    expect(result.naturalWidth).toBe(1254);\n'
    '    expect(result.naturalHeight).toBe(1254);\n',
    '    expect(result.path).toMatch(/^\\/src\\/products\\/gallery-v5\\/[a-z0-9-]+(?:-828)?\\.webp$/);\n'
    '    expect(result.fallbackPath).toBe(`/src/products/gallery-v5/${expectedProductIds[index]}-828.webp`);\n'
    '    expect(result.srcset).toContain(`${expectedProductIds[index]}-828.webp`);\n'
    '    expect(result.srcset).toContain(`${expectedProductIds[index]}.webp`);\n'
    f'    expect(result.sizes).toBe("{sizes}");\n'
    '    expect([828, 1254]).toContain(result.selectedPixelWidth);\n'
    '    expect(result.selectedPixelHeight).toBe(result.selectedPixelWidth);\n'
)
qa = qa.replace('await page.route("**/san-sebastian.webp?*",', 'await page.route("**/san-sebastian*.webp?*",')
qa_path.write_text(qa)

# Deterministic asset contract for masters and responsive derivatives.
verify = '''#!/usr/bin/env bash
set -euo pipefail

names=(latte iced-latte san-sebastian lotus-cheesecake croissant nutella-croissant)
full_total=0
responsive_total=0

printf 'Gallery asset sizes:\n'
for name in "${names[@]}"; do
  for suffix in "" "-828"; do
    asset="src/products/gallery-v5/${name}${suffix}.webp"
    [[ -f "$asset" ]] || { echo "Missing gallery asset: $asset" >&2; exit 1; }
    bytes=$(wc -c < "$asset")
    riff_magic=$(head -c 4 "$asset")
    webp_magic=$(dd if="$asset" bs=1 skip=8 count=4 status=none)
    printf '%9d  %s\n' "$bytes" "$asset"
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

if grep -nE 'src/products/(cards/.*\\.svg|gallery-v2/.*\\.avif|gallery-v4/.*\\.webp)' src/featured-gallery.ts; then
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
'''
verify_path = Path("scripts/verify-gallery-assets.sh")
verify_path.write_text(verify)
verify_path.chmod(0o755)

readme = f'''# Gallery v5

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
'''
Path("src/products/gallery-v5/README.md").write_text(readme)
PY

npm run build

echo "Responsive gallery generated successfully."
