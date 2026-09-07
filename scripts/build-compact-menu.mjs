import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const check = process.argv.includes('--check');
const hash = text => createHash('sha256').update(text).digest('hex').slice(0,12);
const style = readFileSync('scripts/compact-menu.css', 'utf8');
const runtime = transformSync(readFileSync('src/compact-menu.ts','utf8'), { loader:'ts', target:'es2020', minify:true, charset:'utf8', format:'esm', legalComments:'none' }).code;
let html = readFileSync('menu.html','utf8');
function replaceOnce(pattern,replacement) {
  const matches = [...html.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags+'g'))];
  assert.equal(matches.length,1,`Compact template anchor changed: ${pattern}`);
  html = html.replace(pattern,replacement);
}
replaceOnce(/<body class="menu-page">/, '<body class="menu-page compact-menu">');
replaceOnce(/<meta name="robots"[^>]*\/>/, '<meta name="robots" content="noindex,follow" />');
replaceOnce(/<script type="module" src="order-launcher\.js\?v=[^"]+"><\/script>/, '');
replaceOnce(/<script defer src="menu-pwa\.js[^\n]+\n/, '');
replaceOnce(/<a class="menu-page-back" href="\.\/">/, '<a class="menu-page-back" href="menu.html">');
replaceOnce(/<span data-menu-copy="back">[^<]+<\/span>/, '<span data-compact-copy="full">Tam menü</span>');
replaceOnce(/<a class="skip-link" href="#menu-root">[^<]+<\/a>/, '<a class="skip-link" href="#menu-root" data-compact-copy="skip">Menüye geç</a>');
replaceOnce(/<section class="menu-page-hero">[\s\S]*?<\/section>/, `<section class="compact-intro container" aria-labelledby="compact-menu-title">
  <img src="src/brand/robys-primary-master-v1.svg?v=20260726-approved-v4" alt="Roby's Coffee House" width="76" height="76" />
  <div><p class="eyebrow">ROBY'S COFFEE HOUSE · GAZİPAŞA</p>
  <h1 id="compact-menu-title" data-compact-copy="title">Menü</h1>
  <p data-compact-copy="lead">Kahveni seç. Yanına güzel bir şey ekle.</p></div>
</section>`);
const cart = html.match(/<button class="menu-cart-trigger"[\s\S]*?<\/button>/)?.[0];
assert.ok(cart,'Canonical cart trigger is required');
replaceOnce(/<button class="menu-cart-trigger"[\s\S]*?<\/button>/, '<p class="compact-flow" data-compact-copy="preview">Seç → Kontrol et → Baristaya göster</p>');
replaceOnce(/    <section class="menu-share-section"[\s\S]*?(?=  <\/main>)/, '');
replaceOnce(/  <\/main>/, `  </main>
  <div class="compact-order-dock">
    ${cart.replace('aria-controls="menu-cart-dialog"','aria-controls="robys-order-dialog"')}
    <p data-compact-copy="draft">Ön seçim · Sipariş ve ödeme kasada.</p>
  </div>`);
replaceOnce(/<noscript>[\s\S]*?<\/noscript>/, '<noscript><p>Menü için JavaScript gereklidir. · JavaScript is needed for this menu. · Для меню нужен JavaScript.</p><p><a href="./">Roby’s Coffee House — café information / информация о кафе</a></p></noscript>');
replaceOnce(/<\/head>/, `  <link rel="stylesheet" href="compact-menu.css?v=${hash(style)}" />\n</head>`);
replaceOnce(/<\/body>/, `  <script type="module" src="compact-menu.js?v=${hash(runtime)}"></script>\n</body>`);
for (const [path, contents] of [['compact-menu.css',style],['compact-menu.js',runtime],['compact-menu.html',html]]) {
  if(check) assert.equal(readFileSync(path,'utf8'),contents,`${path} is stale; run node scripts/build-compact-menu.mjs`);
  else writeFileSync(path,contents);
}
console.log(`Compact menu ${check?'verified':'built'}: same catalogue, product dialog and canonical order; no order transport.`);
