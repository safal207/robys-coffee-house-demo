from pathlib import Path

root = Path(__file__).resolve().parents[1]

shop_path = root / "shop.css"
shop = shop_path.read_text(encoding="utf-8")
marker = "/* STABLE PRODUCT CATALOG */"
if marker not in shop:
    shop = shop.rstrip() + '''

/* STABLE PRODUCT CATALOG */
.price-card{display:grid;aspect-ratio:auto;grid-template-rows:auto auto;overflow:hidden;color:var(--dark);background:#fffdf9}
.price-card::after{display:none}
.price-card img{width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;background:#2b2220}
.price-card.image-fallback::before{content:"ROBY'S";display:grid;min-height:260px;place-items:center;color:rgba(255,255,255,.72);background:#2b2220;font:600 2rem var(--display);letter-spacing:.12em}
.price-card-info{position:static;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;color:var(--dark);background:#fffdf9}
.price-card-copy{gap:2px}
.price-card-copy small{margin:0;color:var(--muted);font-size:.58rem}
.price-card-copy strong{font:600 1.18rem/1.1 var(--display)}
.price-card-price{display:inline-flex;width:max-content;margin-top:4px;padding:0;color:var(--ruby);background:transparent;box-shadow:none;font-size:.92rem;font-weight:800}
.price-card-action{position:static;flex:0 0 auto;min-height:42px;padding:10px 13px}
.mobile-cta .shop-cart-button{position:relative;right:auto;bottom:auto;z-index:auto;display:flex;min-height:50px;padding:9px 8px;border:0;color:#fff;background:#2a2221;box-shadow:none;opacity:1;pointer-events:auto;transform:none;transition:none}
.mobile-cta .shop-cart-button strong{min-width:21px;height:21px;font-size:.62rem}
@media(max-width:680px){
  .price-grid{padding-bottom:86px}
  .price-card,.price-card:last-child{aspect-ratio:auto}
  .price-card-info{padding:12px 13px}
  .price-card-copy strong{font-size:1.08rem}
  .price-card-action{min-height:40px;padding:9px 11px;font-size:.7rem}
  .shop-cart-button-desktop{display:none}
  .shop-toast{bottom:calc(88px + env(safe-area-inset-bottom))}
}
'''
shop_path.write_text(shop, encoding="utf-8")

mobile_path = root / "mobile.css"
mobile = mobile_path.read_text(encoding="utf-8")
mobile_marker = "/* COMPACT MOBILE HEADER */"
if mobile_marker not in mobile:
    mobile = mobile.rstrip() + '''

/* COMPACT MOBILE HEADER */
@media(max-width:680px){
  .site-header{padding-top:max(6px,env(safe-area-inset-top))}
  .header-inner{min-height:58px}
  .brand-mark{width:34px;height:34px}
  .language-switcher{padding:2px}
  .lang-button{min-width:30px;min-height:30px}
  .menu-toggle{width:34px;height:34px}
}
'''
mobile_path.write_text(mobile, encoding="utf-8")
