from pathlib import Path
import hashlib

EXPECTED = {
 'src/menu-app.js':'b72ee2ff02c9b8767eabc08b4a1273b3e1f49b19',
 'src/order-launcher.ts':'d147b28915c2d7a8734798051befeda077b9aa20',
 'scripts/menu-runtime-source.mjs':'6154402a7bf0dfaa391b95e06abae4da38b47fd9',
 'scripts/build.mjs':'4d2f536a69783c3fd08274737618190008d80794',
}
for name, expected in EXPECTED.items():
 b=Path(name).read_bytes()
 actual=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
 assert actual==expected,(name,actual,expected)

def replace(name,old,new):
 p=Path(name);s=p.read_text();assert s.count(old)==1,(name,old[:90],s.count(old));p.write_text(s.replace(old,new))

replace('src/menu-app.js','import { order, resolveOrderProduct, ORDER_KEY } from "./order-store.js";\n','')
replace('src/menu-app.js','const productIndex = buildProductIndex();', '''const productIndex = buildProductIndex();

// Browsing an empty menu needs the catalogue, not the recommendation/order engine.
// Existing records hydrate before the menu renders; first order intent loads the
// same versioned module as the shared drawer. No timer or benchmark detection.
let order = null;
let orderRuntime = null;
let orderLoad = null;
let addingSelectedProduct = false;
function resolveOrderProduct(id) {
  return orderRuntime ? orderRuntime.resolveOrderProduct(id) : productIndex.get(id);
}
function hasStoredOrder() {
  try {
    const storage = window.sessionStorage;
    return ["robys:coffee-house:order.v2", "robys-menu-order.v1", "robys-smart-choice-cart.v1"]
      .some(key => storage.getItem(key) !== null);
  } catch { return false; }
}
function orderUnavailable() {
  announceCart({
    tr: "Sepet yüklenemedi. Seçiminiz değiştirilmedi. Bağlantınızı kontrol edip sayfayı yenileyin.",
    en: "The order could not load. Your selection was not changed. Check your connection and reload.",
    ru: "Не удалось загрузить заказ. Ваш выбор не изменён. Проверьте связь и обновите страницу."
  }[language]);
}
function ensureMenuOrder() {
  if (order) return Promise.resolve(order);
  orderLoad ??= import("./order-store.js").then(runtime => {
    orderRuntime = runtime;
    order = runtime.order;
    cart = readCart();
    order.subscribe(() => { cart = readCart(); renderCart(); });
    renderCart();
    window.dispatchEvent(new Event("robys:order-load"));
    return order;
  }).catch(error => { orderLoad = null; throw error; });
  return orderLoad;
}
window.addEventListener("robys:order-ready", () => { void ensureMenuOrder().catch(orderUnavailable); });''')
replace('src/menu-app.js','function readCart() { return new Map(order.get().lines.map(line => [line.id, line.quantity])); }','function readCart() { return order ? new Map(order.get().lines.map(line => [line.id, line.quantity])) : new Map(); }')
replace('src/menu-app.js','function saveCart() { order.replace(Array.from(cart, ([id, quantity]) => ({ id, quantity }))); }','function saveCart() { if (!order) throw new Error("Order is not ready"); order.replace(Array.from(cart, ([id, quantity]) => ({ id, quantity }))); }')
replace('src/menu-app.js','  addToCartButton.disabled = availableQuantity === 0;','  addToCartButton.disabled = addingSelectedProduct || availableQuantity === 0;')
replace('src/menu-app.js','  openDialog(productDialog);\n}','  openDialog(productDialog);\n  void ensureMenuOrder().then(() => { if (productDialog.open) hydrateProductDialog(); }).catch(() => {});\n}')
p=Path('src/menu-app.js');s=p.read_text();start=s.index('function addSelectedProduct() {');end=s.index('\nfunction createItem(',start)
old=s[start:end];body=old[len('function addSelectedProduct() {\n'):].rsplit('}',1)[0].rstrip()
new='''async function addSelectedProduct() {
  if (addingSelectedProduct) return;
  addingSelectedProduct = true;
  const requestedProductId = selectedProductId;
  const requestedQuantity = selectedProductQuantity;
  addToCartButton.disabled = true;
  addToCartButton.setAttribute("aria-busy", "true");
  try {
    await ensureMenuOrder();
    // Closing/switching the product while loading cancels that pending action.
    if (!productDialog.hasAttribute("open") || selectedProductId !== requestedProductId) return;
    selectedProductQuantity = requestedQuantity;
'''+ '\n'.join('  '+line for line in body.splitlines())+'''
  } catch { orderUnavailable(); }
  finally {
    addingSelectedProduct = false;
    addToCartButton.removeAttribute("aria-busy");
    if (productDialog.hasAttribute("open")) updateProductQuantity();
  }
}
'''
s=s[:start]+new+s[end:];p.write_text(s)
replace('src/menu-app.js','''cartTrigger.addEventListener("click", () => {
  renderCart();
  openDialog(cartDialog);
});''','''async function openMenuCart() {
  cartTrigger.setAttribute("aria-busy", "true");
  try {
    await ensureMenuOrder();
    renderCart();
    if (!cartDialog.open) openDialog(cartDialog);
  } catch { orderUnavailable(); }
  finally { cartTrigger.removeAttribute("aria-busy"); }
}
cartTrigger.addEventListener("click", () => { void openMenuCart(); });''')
old='''document.querySelector("#current-year").textContent = String(new Date().getFullYear());
translateStaticPage();
renderCategoryNav();
renderMenu();
initializeMenuScrollMetrics();

if (language !== "tr") void loadMenuActions();

if (activeCategory !== "all") {
  window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
}

// Shared state also refreshes menu views after edits made through the global drawer.
order.subscribe(() => { cart = readCart(); renderCart(); });

if (new URLSearchParams(window.location.search).get("order") === "open") openDialog(cartDialog);'''
new='''async function initializeMenuPage() {
  const requestedOrder = new URLSearchParams(window.location.search).get("order") === "open";
  if (hasStoredOrder() || requestedOrder) {
    cartTrigger.setAttribute("aria-busy", "true");
    try { await ensureMenuOrder(); } catch { orderUnavailable(); }
    finally { cartTrigger.removeAttribute("aria-busy"); }
  }
  document.querySelector("#current-year").textContent = String(new Date().getFullYear());
  translateStaticPage();
  renderCategoryNav();
  renderMenu();
  initializeMenuScrollMetrics();
  if (language !== "tr") void loadMenuActions();
  if (activeCategory !== "all") window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
  if (requestedOrder && order) await openMenuCart();
}
void initializeMenuPage();'''
replace('src/menu-app.js',old,new)
replace('scripts/menu-runtime-source.mjs', '''  source = source.replace('from "./order-store.js"', `from "./order-store.js?v=${revision}"`);''', '''  const orderImport = 'import("./order-store.js")';
  assert.equal(source.split(orderImport).length - 1, 1, "Menu must have one lazy order import");
  source = source.replace(orderImport, `import("./order-store.js?v=${revision}")`);''')
replace('src/order-launcher.ts', '/** Empty home/discover routes do not download the recommendation engine/cart model. */', '/** Empty browsing routes load the order model only for a saved order or order intent. */')
replace('src/order-launcher.ts', '.then(()=>{stopDock();holder.remove();})', '.then(()=>{stopDock();holder.remove();window.dispatchEvent(new Event("robys:order-ready"));})')
replace('src/order-launcher.ts', 'if(saved)void load().catch(()=>{});', '''window.addEventListener("robys:order-load",()=>{void load().catch(()=>{});});
if(saved)void load().catch(()=>{});''')
replace('scripts/build.mjs', 'const launcherOnly = pagePath === "index.html" || pagePath === "discover.html";', 'const launcherOnly = !pagePath.startsWith("smart-choice/");')
replace('menu.html', 'src="order-shell.js?v=', 'src="order-launcher.js?v=')
replace('scripts/build.mjs', 'minifyIdentifiers: false, legalComments: "none"', 'minifyIdentifiers: true, legalComments: "none"')
replace('scripts/build.mjs', '// Keep stable public identifiers while avoiding shipping development whitespace.\n  // No bundling, execution-order changes or business-logic substitutions.', '// Without bundling/format, esbuild preserves classic top-level bindings.\n  // Compact local identifiers only; no property mangling or script-order change.')
replace('.github/workflows/unified-order-regression.yml', '      - name: Real touch and enlarged text geometry', '''      - name: Empty-menu lazy load and first-order failure boundaries
        env:
          MENU_DEMAND_RESULTS_DIR: .artifacts/unified-order/menu-demand
        run: node scripts/menu-demand-browser.mjs
      - name: Real touch and enlarged text geometry''')
print('Applied bounded demand-loading candidate; catalogue, storage model, CSP and budgets unchanged.')
