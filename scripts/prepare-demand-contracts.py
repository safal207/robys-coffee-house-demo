"""Preparation-only contract update; all existing price, DOM and safety checks stay enabled."""
from pathlib import Path
import hashlib

path = Path('scripts/verify-menu-order.mjs')
data = path.read_bytes()
assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == 'ae2027f63e7fbb9669216ec1ef554725fd209166'
source = data.decode()
old = '  \'from "./order-store.js"\','
new = '''  'import("./order-store.js")',
  "await ensureMenuOrder()",
  "if (addingSelectedProduct) return",
  "requestedProductId",
  "requestedQuantity",
  "hasStoredOrder()",
  'new Event("robys:order-load")','''
assert source.count(old) == 1
source = source.replace(old, new)
marker = 'assert(!runtime.includes("innerHTML"), "Menu order runtime must use safe DOM construction");'
addition = '''
// The source and emitted bytes are verified together by readVerifiedMenuSource.
// An empty menu must not eagerly load the cart engine; order intent must load
// the exact generated module revision, never a second unversioned singleton.
assert.doesNotMatch(runtime, /import\\s+[^;\\n]+\\sfrom\\s+["']\\.\\/order-store\\.js/, "Order model must be demand-loaded");
assert.equal(runtime.split('import("./order-store.js")').length - 1, 1, "Exactly one source order import is required");
const generated = readFileSync("menu-app.js", "utf8");
assert.match(generated, /import\\("\\.\\/order-store\\.js\\?v=[a-f0-9]{12}"\\)/, "Demand import must carry its content revision");
assert.doesNotMatch(generated, /import\\("\\.\\/order-store\\.js"\\)/, "No unversioned order singleton");
assert.match(html, /src="order-launcher\\.js\\?v=[a-f0-9]{12}"/, "Empty menu uses the lightweight drawer entry");
assert.doesNotMatch(html, /<script[^>]+src="order-shell\\.js/, "Do not eagerly load the full drawer on an empty menu");
'''
assert source.count(marker) == 1
path.write_text(source.replace(marker, marker + '\n' + addition))

# A closed and reopened copy of the same product is a new intent, not consent
# to finish a previously pending add. Existing native Escape also changes it.
path = Path('src/menu-app.js')
source = path.read_text()
old = 'let addingSelectedProduct = false;'
assert source.count(old) == 1
source = source.replace(old, old + '\nlet productIntentRevision = 0;\nproductDialog.addEventListener("cancel", () => { productIntentRevision += 1; });\nproductDialog.addEventListener("close", () => { productIntentRevision += 1; });')
old = 'function closeDialog(dialog) {\n'
assert source.count(old) == 1
source = source.replace(old, old + '  if (dialog === productDialog) productIntentRevision += 1;\n')
old = 'function openProduct(id) {\n  if (!productIndex.has(id)) return;'
assert source.count(old) == 1
source = source.replace(old, old + '\n  productIntentRevision += 1;')
old = '  const requestedProductId = selectedProductId;'
assert source.count(old) == 1
source = source.replace(old, old + '\n  const requestedIntent = productIntentRevision;')
old = 'if (!productDialog.hasAttribute("open") || selectedProductId !== requestedProductId) return;'
assert source.count(old) == 1
source = source.replace(old, 'if (!productDialog.hasAttribute("open") || selectedProductId !== requestedProductId || productIntentRevision !== requestedIntent) return;')
path.write_text(source)
print('Menu contracts now verify demand loading and exact revision; cancellation guards updated. No gate was disabled.')
