from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
path = root / "index.html"
text = path.read_text(encoding="utf-8")

text = re.sub(r'<meta name="robys-build" content="[^"]+" />', '<meta name="robys-build" content="20260621-12" />', text)
text = re.sub(r'\n\s*<script type="module" src="products-extra\.js[^"]*"></script>', "", text)
text = text.replace("styles.css?v=perf-20260621-5", "styles.css?v=stable-20260621-12")
text = text.replace("mobile.css?v=polish-20260621-11", "mobile.css?v=stable-20260621-12")
text = text.replace("shop.css?v=perf-20260621-5", "shop.css?v=stable-20260621-12")
text = text.replace("qa.js?v=video-20260621-10", "qa.js?v=stable-20260621-12")
text = text.replace("./shop.js?v=perf-20260621-5", "./shop.js?v=stable-20260621-12")

cards = [
    ("latte", "Latte", "Латте", 200, "src/products/latte.webp", "Roby's Latte — 200 ₺"),
    ("san-sebastian", "San Sebastian Cheesecake", "Сан-Себастьян", 240, "src/products/san-sebastian.webp", "San Sebastian Cheesecake — 240 ₺"),
    ("croissant", "Croissant", "Круассан", 180, "src/products/croissant.webp", "Croissant — 180 ₺"),
    ("lotus-cheesecake", "Lotus Cheesecake", "Лотус чизкейк", 220, "src/products/lotus-cheesecake.webp", "Lotus Cheesecake — 220 ₺"),
    ("nutella-croissant", "Nutella Croissant", "Круассан с Nutella", 180, "src/products/nutella-croissant.webp", "Nutella Croissant — 180 ₺"),
]

html = []
for product_id, name, ru_name, price, image, alt in cards:
    html.append(f'''        <article class="price-card" data-product-id="{product_id}" data-product-name="{name}" data-product-price="{price}">
          <img src="{image}" alt="{alt}" width="640" height="640" loading="lazy" decoding="async" />
          <div class="price-card-info">
            <div class="price-card-copy"><small>ROBY'S SELECTION</small><strong data-localized data-tr="{name}" data-en="{name}" data-ru="{ru_name}">{name}</strong><span class="price-card-price">{price} ₺</span></div>
            <button class="price-card-action" type="button" data-add-product="{product_id}" data-localized data-tr="Sepete ekle" data-en="Add to cart" data-ru="В корзину">Sepete ekle</button>
          </div>
        </article>''')

replacement = '      <div class="price-grid">\n' + "\n".join(html) + '\n      </div>\n    </div></section>'
text, count = re.subn(
    r'      <div class="price-grid">\n.*?      </div>\n    </div></section>',
    replacement,
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("Could not replace product grid")

if "mobile-cta-cart" not in text:
    cart = '''    <button class="shop-cart-button mobile-cta-cart" type="button" aria-expanded="false">
      <span class="mobile-cta-icon" aria-hidden="true">🛍</span><span data-cart-button-label data-localized data-tr="Sepet" data-en="Cart" data-ru="Корзина">Sepet</span><strong data-cart-count>0</strong>
    </button>
'''
    text = text.replace('    <a class="mobile-cta-instagram"', cart + '    <a class="mobile-cta-instagram"', 1)

path.write_text(text, encoding="utf-8")
