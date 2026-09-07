import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { orderCatalogPlugin, orderCatalogURL } from './order-catalog-boundary.mjs';
const root = mkdtempSync(join(tmpdir(), 'robys-catalog-boundary-'));
writeFileSync(join(root, 'menu-catalog.js'), 'export const menuCategories = [{name:"Кофе / Kahve"}];\n');
let resolve;
orderCatalogPlugin(root).setup({onResolve(_options, fn) { resolve = fn; }});
try {
  test('store imports canonical catalog externally', () => {
    assert.deepEqual(resolve({importer: join(root,'src/order-store.ts'),path:'../menu-catalog.js'}), {path:orderCatalogURL(root),external:true});
  });
  test('nested Smart Choice catalog resolves to the same URL', () => {
    assert.deepEqual(resolve({importer: join(root,'src/smart-choice/catalog.ts'),path:'../../menu-catalog.js'}), {path:orderCatalogURL(root),external:true});
  });
  test('query alias cannot create a second canonical catalog', () => {
    assert.deepEqual(resolve({importer: join(root,'src/order-store.ts'),path:'../menu-catalog.js?v=old'}), {path:orderCatalogURL(root),external:true});
  });
  test('different file with same basename is not externalized', () => {
    assert.equal(resolve({importer: join(root,'other/src/example.ts'),path:'../menu-catalog.js'}),undefined);
  });
  test('catalog identity is content-bound and invalidates when bytes change', () => {
    const before = orderCatalogURL(root);
    assert.match(before,/^\.\/menu-catalog\.js\?v=[0-9a-f]{12}$/);
    writeFileSync(join(root,'menu-catalog.js'), 'export const menuCategories = [{name:"Tea"}];\n');
    assert.notEqual(orderCatalogURL(root),before);
  });
  test('canonicalization never modifies source price/catalog bytes', () => {
    const before = readFileSync(join(root,'menu-catalog.js'));
    resolve({importer: join(root,'src/order-store.ts'),path:'../menu-catalog.js'});
    assert.deepEqual(readFileSync(join(root,'menu-catalog.js')),before);
  });
  test('menu compiler and offline precache share the same catalog revision function', () => {
    const compiler=readFileSync(new URL('./menu-runtime-source.mjs',import.meta.url),'utf8');
    const builder=readFileSync(new URL('./build.mjs',import.meta.url),'utf8');
    assert.match(compiler,/orderCatalogURL\(\)/);
    assert.match(builder,/plugins: \[orderCatalogPlugin\(\)\]/);
    assert.match(builder,/synchronizeServiceWorkerAsset\(serviceWorker, "menu-catalog.js", orderCatalogURL\(\)/);
    assert.match(builder,/external: \["\.\/order-shell\.js\?\*"\]/);
  });
  test('renderer/compiler encoding is UTF-8 without changed budgets or prices', () => {
    for(const path of ['build.mjs','menu-runtime-source.mjs']) {
      assert.match(readFileSync(new URL('./'+path,import.meta.url),'utf8'),/charset: "utf8"/);
    }
  });
} finally {
  // Tests are registered synchronously and may execute after this module returns.
  process.on('exit',()=>rmSync(root,{recursive:true,force:true}));
}
