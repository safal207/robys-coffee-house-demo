from pathlib import Path
import re

def replace(file, old, new):
    p = Path(file)
    source = p.read_text()
    if source.count(old) != 1:
        raise RuntimeError(f'{file}: expected one anchor: {old!r}')
    p.write_text(source.replace(old, new, 1))

replace('menu.html', 'class="visually-hidden" id="menu-cart-status"', 'class="menu-order-status" id="menu-cart-status"')
replace('menu-premium.css', '.full-menu-item-media::after{content:"+";', '.full-menu-item-media::after{content:"↗";')
replace('menu-premium.css', '.menu-product-visual img{width:100%;height:100%;object-fit:cover}', '.menu-product-visual img{width:100%;height:100%;object-fit:contain}')
with Path('menu-premium.css').open('a') as f:
    f.write('''
/* CART-FEEDBACK-003: state derives from the real session cart, not click decoration. */
.full-menu-item.is-in-cart{border-color:var(--ruby);background:#fff9f6;box-shadow:inset 3px 0 0 var(--ruby),0 8px 24px rgba(36,28,27,.06)}
.full-menu-item.is-in-cart .full-menu-item-media::after{content:"✓ " attr(data-cart-quantity);width:auto;min-width:34px;padding-inline:8px;background:var(--ruby);font-size:.72rem;font-weight:800;opacity:1;transform:none}
.menu-order-status{position:fixed;z-index:110;right:16px;bottom:max(20px,env(safe-area-inset-bottom));left:16px;width:max-content;max-width:calc(100% - 32px);margin:0 auto;padding:14px 20px;color:#fff;background:#241c1b;border:1px solid rgba(255,255,255,.24);border-radius:16px;box-shadow:0 14px 44px rgba(24,18,17,.22);font-size:.82rem;line-height:1.45;pointer-events:none;opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .22s cubic-bezier(.16,1,.3,1)}
.menu-order-status.is-visible{opacity:1;transform:none}
.menu-page :is(.menu-category-chip,.menu-cart-trigger,.menu-smart-choice-link):active{transform:translateY(1px) scale(.98)}
.menu-dialog-close:active:not(:disabled){transform:scale(.96)}
.menu-dialog-shell{overscroll-behavior:contain}
@media(prefers-reduced-motion:reduce){.menu-order-status{transition:none;transform:none}.menu-page :is(.menu-category-chip,.menu-cart-trigger,.menu-smart-choice-link):active,.menu-dialog-close:active:not(:disabled){transform:none}}
''')

replace('scripts/build.mjs', 'const menuPremiumRevision = revisionFor("menu-premium.css");', '''const menuPremiumRevision = revisionFor("menu-premium.css");
const menuAppRevision = revisionFor("menu-app.js");
const androidStylesRevision = revisionFor("android-app.css");
let conversionSource = readFileSync("conversion.js", "utf8");
const androidStylePattern = /android-app\\.css\\?v=[^"']+/;
if (!androidStylePattern.test(conversionSource)) throw new Error("Missing Android stylesheet loader");
conversionSource = conversionSource.replace(androidStylePattern, `android-app.css?v=${androidStylesRevision}`);
writeFileSync("conversion.js", conversionSource);
const conversionRevision = revisionFor("conversion.js");''')
replace('scripts/build.mjs', 'html = synchronizeScript(html, "social-offer.js", socialOfferRevision);', 'html = synchronizeScript(html, "social-offer.js", socialOfferRevision);\nhtml = synchronizeModuleScript(html, "conversion.js", conversionRevision);')
replace('scripts/build.mjs', 'menuHtml = synchronizeStylesheet(menuHtml, "menu-premium.css", menuPremiumRevision);', 'menuHtml = synchronizeStylesheet(menuHtml, "menu-premium.css", menuPremiumRevision);\nmenuHtml = synchronizeModuleScript(menuHtml, "menu-app.js", menuAppRevision);')
replace('scripts/build.mjs', '  ["menu-premium.css", menuPremiumRevision],', '  ["menu-premium.css", menuPremiumRevision],\n  ["menu-app.js", menuAppRevision],\n  ["conversion.js", conversionRevision],\n  ["android-app.css", androidStylesRevision],')
replace('scripts/verify-menu-share.mjs', '''assert(html.includes('src="menu-app.js?v=20260904-premium-order-v11"'), "Menu must load the current cache-safe runtime path");''', '''const menuRuntimeRevision = createHash("sha256").update(menuPageRuntime).digest("hex").slice(0, 12);
assert(html.includes(`src="menu-app.js?v=${menuRuntimeRevision}"`), "Menu must load the exact runtime content revision");
assert(serviceWorker.includes(`"./menu-app.js?v=${menuRuntimeRevision}"`), "Menu runtime must be precached at the exact HTML revision");''')
p = Path('sw.js'); source = p.read_text()
source, count = re.subn(r'robys-offline-v61-[^"\n]+?(?=-[a-f0-9]{12}-[a-f0-9]{12}-[a-f0-9]{12}")', 'robys-offline-v62-20260905-cart-feedback', source)
if count != 1:
    raise RuntimeError('Expected one revisioned v61 cache generation')
p.write_text(source)
