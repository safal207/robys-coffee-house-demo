from pathlib import Path


def replace_idempotent(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Expected block not found: {label}")
    return text.replace(old, new, 1)


index = Path("index.html")
html = index.read_text(encoding="utf-8")

old_head = '''  <meta name="description" content="Roby's Coffee House — Gazipaşa'da iyi kahve, tatlılar ve sakin anlar." />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <meta name="theme-color" content="#241c1b" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />'''
new_head = '''  <meta name="description" content="Gazipaşa'da taze kahve, latte, soğuk içecekler, cheesecake ve kruvasan. Roby's Coffee House menüsünü keşfedin ve kolayca yol tarifi alın." />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
  <meta name="geo.region" content="TR-07" />
  <meta name="geo.placename" content="Gazipaşa, Antalya" />
  <meta name="theme-color" content="#241c1b" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />'''
html = replace_idempotent(html, old_head, new_head, "homepage description")

old_social = '''  <meta property="og:title" content="Roby's Coffee House | Gazipaşa" />
  <meta property="og:description" content="Good coffee. Calm moments in Gazipaşa." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://safal207.github.io/robys-coffee-house-demo/" />
  <meta property="og:site_name" content="Roby's Coffee House" />
  <meta property="og:locale" content="tr_TR" />
  <meta property="og:image" content="https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg" />
  <meta property="og:image:alt" content="Roby's Coffee House in Gazipaşa" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Roby's Coffee House | Gazipaşa" />
  <meta name="twitter:description" content="Good coffee. Calm moments in Gazipaşa." />
  <meta name="twitter:image" content="https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg" />
  <meta name="twitter:image:alt" content="Roby's Coffee House in Gazipaşa" />
  <title>Roby's Coffee House | Gazipaşa</title>'''
new_social = '''  <meta property="og:title" content="Roby's Coffee House Gazipaşa | Kahve, Tatlı & Sakin Atmosfer" />
  <meta property="og:description" content="Gazipaşa'da taze kahve, soğuk içecekler, cheesecake ve kruvasan. Menüyü inceleyin, konumu açın ve Roby's atmosferini keşfedin." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://safal207.github.io/robys-coffee-house-demo/" />
  <meta property="og:site_name" content="Roby's Coffee House" />
  <meta property="og:locale" content="tr_TR" />
  <meta property="og:locale:alternate" content="en_US" />
  <meta property="og:locale:alternate" content="ru_RU" />
  <meta property="og:image" content="https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg" />
  <meta property="og:image:secure_url" content="https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content="Roby's Coffee House Gazipaşa kahve ve tatlı atmosferi" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Roby's Coffee House Gazipaşa | Kahve & Tatlı" />
  <meta name="twitter:description" content="Taze kahve, cheesecake, kruvasan ve sakin bir atmosfer. Menüyü keşfedin ve Roby's Coffee House'a yol tarifi alın." />
  <meta name="twitter:image" content="https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg" />
  <meta name="twitter:image:alt" content="Roby's Coffee House Gazipaşa kahve ve tatlı atmosferi" />
  <title>Roby's Coffee House Gazipaşa | Kahve & Tatlı</title>'''
html = replace_idempotent(html, old_social, new_social, "homepage social preview")

old_schema = '''    "name": "Roby's Coffee House",
    "url": "https://safal207.github.io/robys-coffee-house-demo/",
    "image": "https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg",
    "hasMenu": "https://safal207.github.io/robys-coffee-house-demo/menu.html",'''
new_schema = '''    "name": "Roby's Coffee House",
    "description": "Gazipaşa'da taze kahve, soğuk içecekler, cheesecake, kruvasan ve sakin bir kafe atmosferi.",
    "slogan": "İyi kahve. Sakin anlar.",
    "url": "https://safal207.github.io/robys-coffee-house-demo/",
    "image": "https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg",
    "hasMenu": "https://safal207.github.io/robys-coffee-house-demo/menu.html",
    "priceRange": "₺₺",
    "currenciesAccepted": "TRY",
    "areaServed": {
      "@type": "City",
      "name": "Gazipaşa, Antalya"
    },'''
html = replace_idempotent(html, old_schema, new_schema, "homepage structured data")
html = replace_idempotent(
    html,
    '    "servesCuisine": ["Coffee", "Desserts"],',
    '    "servesCuisine": ["Coffee", "Desserts", "Croissants", "Sandwiches"],',
    "homepage cuisine",
)
index.write_text(html, encoding="utf-8")

menu = Path("menu.html")
menu_html = menu.read_text(encoding="utf-8")
menu_html = replace_idempotent(
    menu_html,
    '  <meta name="description" content="Roby\'s Coffee House tam menüsü: kahveler, soğuk içecekler, çaylar, tatlılar ve sandviçler." />',
    '  <meta name="description" content="Roby\'s Coffee House Gazipaşa menüsü: espresso, latte, soğuk kahveler, çaylar, cheesecake, kruvasan ve sandviçler. Türkçe, English ve Русский." />',
    "menu description",
)
menu_html = replace_idempotent(
    menu_html,
    '''  <meta property="og:title" content="Roby's Coffee House | Menu" />
  <meta property="og:description" content="Full multilingual menu in Turkish, English and Russian." />''',
    '''  <meta property="og:title" content="Roby's Coffee House Menü | Gazipaşa Kahve & Tatlı" />
  <meta property="og:description" content="Kahveler, soğuk içecekler, çaylar, cheesecake, kruvasan ve sandviçler. Roby's Gazipaşa menüsünü Türkçe, English veya Русский inceleyin." />''',
    "menu Open Graph",
)
menu_html = replace_idempotent(
    menu_html,
    '''  <meta name="twitter:title" content="Roby's Coffee House | Menu" />
  <meta name="twitter:description" content="Full multilingual menu in Turkish, English and Russian." />''',
    '''  <meta name="twitter:title" content="Roby's Coffee House Menü | Gazipaşa" />
  <meta name="twitter:description" content="Kahve, soğuk içecek, cheesecake, kruvasan ve sandviç seçeneklerini keşfedin." />''',
    "menu Twitter preview",
)
menu_html = replace_idempotent(
    menu_html,
    "  <title>Tam Menü | Roby's Coffee House</title>",
    "  <title>Roby's Coffee House Menü | Gazipaşa</title>",
    "menu title",
)
menu.write_text(menu_html, encoding="utf-8")

sitemap = Path("sitemap.xml")
sitemap_text = sitemap.read_text(encoding="utf-8")nsitemap_text = sitemap_text.replace("<lastmod>2026-06-22</lastmod>", "<lastmod>2026-06-27</lastmod>")
sitemap.write_text(sitemap_text, encoding="utf-8")
