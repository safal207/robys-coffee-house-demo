from pathlib import Path
import base64

root = Path(__file__).resolve().parents[1]
assets = {
    "src/premium-latte.b64": "src/products/latte.webp",
    "src/premium-san-sebastian.b64": "src/products/san-sebastian.webp",
    "src/premium-croissant.b64": "src/products/croissant.webp",
    "src/products/lotus-cheesecake.b64": "src/products/lotus-cheesecake.webp",
    "src/products/nutella-croissant.b64": "src/products/nutella-croissant.webp",
}

for source_name, target_name in assets.items():
    encoded = "".join((root / source_name).read_text(encoding="utf-8").split())
    payload = base64.b64decode(encoded, validate=True)
    if not (payload.startswith(b"RIFF") and payload[8:12] == b"WEBP"):
        raise ValueError(f"Invalid WebP payload: {source_name}")
    target = root / target_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
