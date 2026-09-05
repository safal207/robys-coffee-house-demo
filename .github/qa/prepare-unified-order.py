#!/usr/bin/env python3
"""Apply the owner's attached unified-order candidate to the pinned staged sources.
This is a temporary preparation script, not runtime. Generated files are rebuilt.
It never merges, deploys, changes prices or changes security/performance thresholds.
"""
from pathlib import Path
import json
import subprocess

expected = {
 'src/order-store.ts':'02e9e53111aed29e5d8163313ed4826a2f4370d5',
 'src/order-shell.ts':'c55307efff56a3be7387af7efc970053cb24af0c',
 'src/order-launcher.ts':'4d797f873fd6b3fda1c393c45ba737325ea3ea1f',
 'src/menu-app.js':'d644c2674188ff013dd2063e9bbb3551e4f5263d',
 'src/smart-choice/page.ts':'c74b2ac34df0e9e73cabea1bdfe8e06f610f2c92',
 'src/smart-choice/cart.ts':'44bd80adc870717207319201dbefe5f302c77263',
 'scripts/build.mjs':'c879200',
 'scripts/menu-runtime-source.mjs':'65152b0',
 'scripts/test-smart-choice-cart.mjs':'b13f8d1',
 'scripts/test-smart-choice-page.mjs':'c811be7',
 'scripts/verify-menu-order.mjs':'18161b2',
 'scripts/verify-smart-choice-release.mjs':'1988c3f',
 'package.json':'bc29e98', 'tsconfig.json':'c9658e1'
}
for name, wanted in expected.items():
 actual = subprocess.check_output(['git','hash-object',name],text=True).strip()
 assert actual.startswith(wanted), f'Unreviewed source drift: {name} {actual} != {wanted}'

def replace(text, old, new, count=1):
 assert text.count(old)==count, f'Unexpected match count for {old[:100]!r}'
 return text.replace(old,new)

def edit(name, fn):
 p=Path(name);p.write_text(fn(p.read_text()))

# Shared source produces one content-revisioned ESM instance for every consumer.
shared_build = '''await build({entryPoints: ["src/order-store.ts"], bundle: true, minify: true, format: "esm", target: "es2020", outfile: "order-store.js", legalComments: "none"});
const orderRevision = createHash("sha256").update(readFileSync("order-store.js")).digest("hex").slice(0,12);
const orderPlugin = { name: "shared-order-runtime", setup(builder) {
  builder.onResolve({filter: /^@robys\\/order$/}, () => ({path: `${builder.initialOptions.outfile.startsWith("smart-choice/") ? "../" : "./"}order-store.js?v=${orderRevision}`, external: true}));
}};
await build({entryPoints: ["src/order-shell.ts"], bundle: true, minify: true, format: "esm", target: "es2020", outfile: "order-shell.js", legalComments: "none", plugins:[orderPlugin]});
'''
shared_revisions = '''const orderShellRevision = revisionFor("order-shell.js");
const orderShellCssRevision = revisionFor("order-shell.css");
const launcher = readFileSync("src/order-launcher.ts", "utf8").replace("order-shell.js?v=000000000000", `order-shell.js?v=${orderShellRevision}`);
writeFileSync("order-launcher.js", transformSync(launcher, {loader:"ts",minify:true,format:"esm",target:"es2020"}).code);
const orderLauncherRevision = revisionFor("order-launcher.js");
for (const pagePath of ["index.html", "menu.html", "discover.html", "smart-choice/index.html"]) {
  const prefix = pagePath.startsWith("smart-choice/") ? "../" : "";
  let page = readFileSync(pagePath, "utf8");
  const launcherOnly = pagePath === "index.html" || pagePath === "discover.html";
  page = synchronizeModuleScript(page, `${prefix}${launcherOnly ? "order-launcher.js" : "order-shell.js"}`, launcherOnly ? orderLauncherRevision : orderShellRevision);
  if (pagePath.startsWith("smart-choice/")) page = synchronizeStylesheet(page, "../order-store.js", orderRevision);
  page = synchronizeStylesheet(page, `${prefix}order-shell.css`, orderShellCssRevision);
  writeFileSync(pagePath, page);
}
for (const [filePath, revision] of [["order-launcher.js", orderLauncherRevision], ["order-store.js", orderRevision], ["order-shell.js", orderShellRevision], ["order-shell.css", orderShellCssRevision]]) {
  serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, filePath, revision);
}
'''
def build(s):
 s=replace(s,'writeFileSync("menu-app.js", compileMenuRuntime());',shared_build+'writeFileSync("menu-app.js", compileMenuRuntime());')
 for file in ['app-v2.js','cart-v2.js']:
  old=f'  outfile: "smart-choice/{file}",'
  s=replace(s,old,old+'\n  plugins: [orderPlugin],')
 return replace(s,'writeFileSync("sw.js", serviceWorker);',shared_revisions+'writeFileSync("sw.js", serviceWorker);')
edit('scripts/build.mjs',build)
def menu_compiler(s):
 s='import { createHash } from "node:crypto";\n'+s
 marker='export function compileMenuRuntime(source = readFileSync("src/menu-app.js", "utf8")) {'
 return replace(s,marker,marker+'''\n  const revision = createHash("sha256").update(readFileSync("order-store.js")).digest("hex").slice(0,12);
  source = source.replace('from "./order-store.js"', `from "./order-store.js?v=${revision}"`);''')
edit('scripts/menu-runtime-source.mjs',menu_compiler)

def menu(s):
 s='import { order, resolveOrderProduct, ORDER_KEY } from "./order-store.js";\n'+s
 s=replace(s,'const CART_STORAGE_KEY = "robys-menu-order.v1";','')
 start=s.index('function readCart() {');end=s.index('function cartSummary() {',start)
 s=s[:start]+'''function readCart() { return new Map(order.get().lines.map(line => [line.id, line.quantity])); }
let cart = readCart();
function saveCart() { order.replace(Array.from(cart, ([id, quantity]) => ({ id, quantity }))); }

'''+s[end:]
 s=s.replace('productIndex.get(', 'resolveOrderProduct(')
 s=replace(s,'const quantity = cart.get(row.dataset.productId) ?? 0;', 'const quantity = Array.from(cart).filter(([id]) => id.split("|")[0] === row.dataset.productId).reduce((sum, [, count]) => sum + count, 0);')
 return s+'''\n// Shared state also refreshes menu views after edits made through the global drawer.
order.subscribe(() => { cart = readCart(); renderCart(); });

if (new URLSearchParams(window.location.search).get("order") === "open") openDialog(cartDialog);
'''
edit('src/menu-app.js',menu)

# Explicit route recovery takes priority over a stale saved selected screen.
normalization = '''function normalizeFlow(value: unknown): FlowState {
  if (!value || typeof value !== "object") return initialState();
  const parsed = value as Partial<FlowState>;
  if (parsed.version !== STATE_VERSION || !isLanguage(parsed.locale) || !isScreen(parsed.screen)) return initialState();
  const answers: Answers = {};
  for (const question of questions) {
    const answer = parsed.answers?.[question.id];
    if (question.options.some(option => option.value === answer)) answers[question.id] = answer;
  }
  const requested = Number.isInteger(parsed.questionIndex) ? Number(parsed.questionIndex) : 0;
  const firstMissing = questions.findIndex(question => !answers[question.id]);
  let screen = parsed.screen;
  let questionIndex = Math.max(0, Math.min(questions.length - 1, requested));
  if (screen === "question" && firstMissing >= 0) questionIndex = Math.min(questionIndex, firstMissing);
  if ((screen === "results" || screen === "selected") && firstMissing >= 0) { screen = "question"; questionIndex = firstMissing; }
  return { version: STATE_VERSION, screen, questionIndex, answers, locale: parsed.locale,
    ...(typeof parsed.selectedCandidateId === "string" ? {selectedCandidateId: parsed.selectedCandidateId} : {}) };
}
function loadState(): FlowState {
  try { return normalizeFlow(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")); }
  catch { return initialState(); }
}
function routeState(hash: string, previous: FlowState): FlowState {
  if (hash === "#smart-choice-main") return previous;
  if (hash === "#welcome") return { ...previous, screen: "welcome", questionIndex: 0, selectedCandidateId: undefined };
  const step = /^#step-([1-5])$/.exec(hash);
  if (step) return normalizeFlow({ ...previous, screen: "question", questionIndex: Number(step[1]) - 1 });
  if (hash === "#results" || hash === "#selected") return normalizeFlow({ ...previous, screen: hash.slice(1) });
  return hash ? { ...previous, screen: "welcome", questionIndex: 0 } : previous;
}
function publishFlow(): void { window.dispatchEvent(new CustomEvent("robys:choice-state", { detail: { ...state, answers: { ...state.answers } } })); }

'''
history = '''window.addEventListener("popstate", (event) => {
  suppressHistory = true;
  state = routeState(window.location.hash, event.state?.flow ? normalizeFlow(event.state.flow) : state);
  currentResult = null;
  saveState(); render();
  suppressHistory = false;
});
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#smart-choice-main") return;
  state = routeState(window.location.hash, state); currentResult = null;
  setState(state, "replace");
});
window.addEventListener("robys:choice-request", publishFlow);
state = routeState(window.location.hash, state);
setState(state, "replace");
'''
def page(s):
 for module in ['catalog','engine']: s=replace(s,f'from "./{module}.js"', 'from "@robys/order"')
 pairs=[('choose: "Bunu seç"','choose: "Düzenle ve ekle"'),('choose: "Choose this"','choose: "Configure and add"'),('choose: "Выбрать"','choose: "Настроить и добавить"'),('selectedEyebrow: "SEÇİM KAYDEDİLDİ"','selectedEyebrow: "SEÇİMİNİZ"'),('selectedEyebrow: "CHOICE SAVED"','selectedEyebrow: "YOUR SELECTION"'),('selectedEyebrow: "ВЫБОР СОХРАНЁН"','selectedEyebrow: "ВАШ ВЫБОР"'),('Bu seçim yalnızca bu tarayıcı oturumunda saklandı. Kafeye, kasaya veya ödeme sistemine henüz sipariş gönderilmedi.','Seçiminizi kontrol edin ve ortak sepetinize ekleyin. Henüz sipariş gönderilmez.'),('This choice is stored only for this browser session. No order has been sent to the café, POS, or payment system.','Review this selection and add it to your shared order. No order is sent yet.'),('Выбор сохранён только в этой сессии браузера. Заказ ещё не отправлен в кафе, кассу или платёжную систему.','Проверьте вариант и добавьте его в общий заказ. Заказ пока не отправляется.')]
 for old,new in pairs:s=replace(s,old,new)
 s=replace(s,'let suppressHistory = false;', 'let suppressHistory = false;\nlet flowStorageAvailable = true;')
 start=s.index('function loadState(): FlowState {');end=s.index('function saveState(): void {',start)
 s=s[:start]+normalization+s[end:]
 s=replace(s,'// Session persistence is optional; the flow remains usable without storage.','flowStorageAvailable = false;')
 s=replace(s,'window.history[method]({ smartChoice: true }, "", hash);','try { window.history[method]({ smartChoice: true, flow: state }, "", hash); } catch { /* Keep the flow usable if history is unavailable. */ }')
 s=replace(s,'      saveState();\n      optionButtons.forEach', '      saveState();\n      try { window.history.replaceState({ smartChoice: true, flow: state }, "", window.location.href); } catch { /* Optional browser history. */ }\n      optionButtons.forEach')
 s=replace(s,'  app.replaceChildren(content);','''  if (!flowStorageAvailable) {
    const storageCopy = {tr:"Bu sayfadan ayrılınca seçim kaybolabilir; kayıt kullanılamıyor.",en:"Storage is unavailable; leaving this page may lose your selection.",ru:"Сохранение недоступно: при уходе со страницы выбор может потеряться."};
    content.append(createElement("p", "safe-note", storageCopy[state.locale]));
  }
  app.replaceChildren(content);
  publishFlow();''')
 s=s[:s.index('window.addEventListener("popstate", () => {')]+history
 return s
edit('src/smart-choice/page.ts',page)

add_shared = '''    const addText = {tr:"Ortak sepete ekle",en:"Add to my order",ru:"В общий заказ"};
    const addedText = {tr:"Ortak sepete eklendi",en:"Added to your order",ru:"Добавлено в общий заказ"};
    const failedText = {tr:"Eklenemedi; miktarı kontrol edin.",en:"Could not add; check the quantity.",ru:"Не удалось добавить; проверьте количество."};
    const addShared = create("button", "primary-button", addText[language]);
    addShared.id = "smart-choice-add-order"; addShared.type = "button"; addShared.disabled = !calculation.canHandoff;
    const addStatus = create("p", "cart-notice");addStatus.setAttribute("role", "status");addStatus.setAttribute("aria-live", "polite");
    addShared.addEventListener("click", () => {
      try { const line = lineFromChoice(cart, partySize); order.add(line.id, line.quantity); addStatus.textContent = addedText[language];
        window.dispatchEvent(new Event("robys:order-added")); }
      catch { addStatus.textContent = failedText[language]; }
    });
    footer.append(total, addShared);
    // Per-selection sharing remains secondary and does not claim to send the shared order.
    const shareDetails = create("details", "cart-payload");
    const shareLabel = {tr:"Yalnızca bu seçimi paylaş",en:"Share only this selection",ru:"Поделиться только этим вариантом"};
    shareDetails.append(create("summary", "", shareLabel[language]), handoff);
    root.append(addStatus, shareDetails);'''
def cart(s):
 s='import { order, lineFromChoice } from "@robys/order";\n'+s
 for module in ['catalog','engine','cart-domain']:s=replace(s,f'from "./{module}.js"','from "@robys/order"')
 s=replace(s,'function mountCart(): void {','let currentFlow: FlowStateSnapshot | null = null;\n\nfunction mountCart(): void {')
 s=replace(s,'const flow = readJson<FlowStateSnapshot>(FLOW_STORAGE_KEY);','const flow = currentFlow;')
 s=replace(s,'    footer.append(total, handoff);',add_shared)
 return replace(s,'  new MutationObserver(mountCart).observe(app, { childList: true, subtree: true });','''  window.addEventListener("robys:choice-state", (event) => {
    currentFlow = (event as CustomEvent<FlowStateSnapshot>).detail;
    mountCart();
  });
  window.dispatchEvent(new Event("robys:choice-request"));''')
edit('src/smart-choice/cart.ts',cart)

# Retain both previous local-review repairs of the staged domain.
def store(s):
 s=replace(s,'    const next = validLines(lines);\n    snapshot =', '''    const next = validLines(lines);
    const remaining = new Set(next.map(line => line.id));
    const removed = snapshot.lines.filter(line => !remaining.has(line.id));
    if (removed.length === 1) undo = { ...removed[0] };
    snapshot =''')
 return replace(s,"        try { snapshot = { ...stored, lines: validLines(stored.lines) }; emit(); } catch { notice = 'invalid-order'; emit(); }",'''        try {
          snapshot = { version: 2, revision: stored.revision, lines: validLines(stored.lines), migrationDone: stored.migrationDone === true };
          if (snapshot.migrationDone) pendingLegacy = null;
          emit();
        } catch { notice = 'invalid-order'; emit(); }''')
edit('src/order-store.ts',store)

# Static contracts now verify the shared instance, not the obsolete storage adapter.
edit('scripts/test-smart-choice-cart.mjs', lambda s:replace(s,'  assert(source.includes("MutationObserver"));','''  assert(source.includes('window.addEventListener("robys:choice-state"'));
  assert(source.includes("const flow = currentFlow"));
  assert(source.includes("lineFromChoice(cart, partySize)"));
  assert(source.includes("order.add(line.id, line.quantity)"));'''))
edit('scripts/test-smart-choice-page.mjs',lambda s:replace(s,'assert(source.includes(\'from "./engine.js"\'), "Page source must import the Recommendation Engine");','assert(source.includes(\'from "@robys/order"\'), "Page source must import the shared Recommendation Engine");'))
edit('scripts/verify-menu-order.mjs',lambda s:replace(s,'''  'const CART_STORAGE_KEY = "robys-menu-order.v1"',
  "sessionStorage.getItem(CART_STORAGE_KEY)",
  "sessionStorage.setItem(CART_STORAGE_KEY",''','''  'from "./order-store.js"',
  "order.get().lines",
  "order.replace(",'''))
def release(s):
 s=replace(s,'const jsFiles = [','const jsFiles = [\n  "order-store.js", "order-shell.js",')
 s=replace(s,'const cssFiles = [','const cssFiles = [\n  "order-shell.css",')
 return replace(s,'  const fileName = path.basename(file);','  const fileName = file.startsWith("smart-choice/") ? path.basename(file) : `../${file}`;')
edit('scripts/verify-smart-choice-release.mjs',release)
p=Path('package.json');package=json.loads(p.read_text());package['scripts']['check']+=' && npm run test:unified-order';package['scripts']['test:unified-order']='node scripts/test-unified-order.mjs';p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
p=Path('tsconfig.json');config=json.loads(p.read_text());config['compilerOptions']['baseUrl']='.';config['compilerOptions']['paths']={'@robys/order':['src/order-store.ts']};p.write_text(json.dumps(config,indent=2)+'\n')
for name in ['index.html','menu.html','discover.html','smart-choice/index.html']:
 p=Path(name);s=p.read_text();assert 'order-shell.css' not in s
 prefix='../' if name.startswith('smart-choice/') else ''
 runtime='order-launcher.js' if name in ['index.html','discover.html'] else 'order-shell.js'
 tags=f'  <link rel="stylesheet" href="{prefix}order-shell.css?v=000000000000">\n'
 if prefix:tags+='  <link rel="modulepreload" href="../order-store.js?v=000000000000">\n'
 tags+=f'  <script type="module" src="{prefix}{runtime}?v=000000000000"></script>\n'
 p.write_text(replace(s,'</head>',tags+'</head>'))
p=Path('sw.js');s=p.read_text();assert '"./order-store.js' not in s
marker='  "./smart-choice/",';assert marker in s
assets=''.join(f'  "./{name}?v=000000000000",\n' for name in ['order-launcher.js','order-store.js','order-shell.js','order-shell.css'])
s=replace(s,marker,assets+marker)
# New precached module family requires a new cache generation, no blanket cache reset.
s=replace(s,'const CACHE_VERSION = "robys-offline-', 'const CACHE_VERSION = "robys-offline-order-v2-')
p.write_text(s)
print('Bounded source integration applied. Run build, integrity and complete checks before publishing any candidate.')
