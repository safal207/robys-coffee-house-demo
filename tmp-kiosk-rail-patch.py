from pathlib import Path

js = Path('src/menu-app.js')
text = js.read_text()
anchor = 'document.querySelector("#current-year").textContent = String(new Date().getFullYear());\n'
if anchor not in text:
    raise SystemExit('JS anchor missing')
block = '''function setupKioskCategoryRail() {
  const controls = document.querySelector(".menu-controls");
  const menuWrap = document.querySelector(".full-menu-wrap");
  const header = document.querySelector(".site-header");
  if (!controls || !menuWrap) return;

  const kioskMedia = window.matchMedia("(min-width: 820px) and (min-height: 620px)");
  let frame = 0;

  const sync = () => {
    frame = 0;
    if (!kioskMedia.matches) {
      document.body.classList.remove("menu-kiosk-rail-visible");
      return;
    }
    const controlsRect = controls.getBoundingClientRect();
    const menuRect = menuWrap.getBoundingClientRect();
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const active = controlsRect.top < window.innerHeight && menuRect.bottom > headerBottom + 12;
    document.body.classList.toggle("menu-kiosk-rail-visible", active);
  };

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(sync);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  kioskMedia.addEventListener?.("change", schedule);
  sync();
}

'''
if 'function setupKioskCategoryRail()' not in text:
    text = text.replace(anchor, block + anchor)
call_anchor = 'initializeMenuScrollMetrics();\n'
if call_anchor not in text:
    raise SystemExit('init anchor missing')
if 'setupKioskCategoryRail();' not in text:
    text = text.replace(call_anchor, call_anchor + 'setupKioskCategoryRail();\n')
js.write_text(text)

css = Path('menu-security-v2.css')
c = css.read_text()
old = '.menu-category-nav{position:fixed;z-index:92;top:calc(var(--menu-sticky-inset,180px) + 18px);left:max(20px,calc((100vw - 1180px)/2));display:flex;width:218px;max-height:calc(100dvh - var(--menu-sticky-inset,180px) - 38px);flex-direction:column;gap:7px;padding:10px;overflow-x:hidden;overflow-y:auto;background:rgba(255,250,243,.98);border:1px solid rgba(47,39,37,.12);border-radius:24px;box-shadow:0 18px 54px rgba(36,28,27,.12);scrollbar-width:thin}'
new = '.menu-category-nav{position:fixed;z-index:92;top:calc(var(--menu-sticky-inset,180px) + 18px);left:max(20px,calc((100vw - 1180px)/2));display:flex;width:218px;max-height:calc(100dvh - var(--menu-sticky-inset,180px) - 38px);flex-direction:column;gap:7px;padding:10px;overflow-x:hidden;overflow-y:auto;background:rgba(255,250,243,.98);border:1px solid rgba(47,39,37,.12);border-radius:24px;box-shadow:0 18px 54px rgba(36,28,27,.12);scrollbar-width:thin;opacity:0;visibility:hidden;pointer-events:none;transform:translateX(-10px);transition:opacity .18s ease,transform .18s ease,visibility 0s linear .18s}'
if old not in c and new not in c:
    raise SystemExit('CSS rail anchor missing')
c = c.replace(old, new)
visible = '  .menu-category-chip.active::before{color:var(--ruby);background:#fff;border-color:#fff}\n'
visible_rule = '  body.menu-kiosk-rail-visible .menu-category-nav{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s}\n'
if visible_rule not in c:
    if visible not in c:
        raise SystemExit('CSS active anchor missing')
    c = c.replace(visible, visible + visible_rule)
mobile = '  .menu-category-nav{position:static;width:auto;max-height:none;flex-direction:row;padding:0;overflow-x:auto;overflow-y:hidden;background:transparent;border:0;border-radius:0;box-shadow:none}'
mobile_new = '  .menu-category-nav{position:static;width:auto;max-height:none;flex-direction:row;padding:0;overflow-x:auto;overflow-y:hidden;background:transparent;border:0;border-radius:0;box-shadow:none;opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:none}'
if mobile not in c and mobile_new not in c:
    raise SystemExit('CSS mobile anchor missing')
c = c.replace(mobile, mobile_new)
css.write_text(c)
