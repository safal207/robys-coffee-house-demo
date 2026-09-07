import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = mkdtempSync(join(tmpdir(), 'robys-order-share-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const source = readFileSync(new URL('../src/order-share.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, strict: true },
  reportDiagnostics: true
});
assert.deepEqual((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
writeFileSync(join(temp, 'order-share.mjs'), compiled.outputText);
const { buildOrderShare, shareCopy, TELEGRAM_LINK_BUDGET } = await import(pathToFileURL(join(temp, 'order-share.mjs')));

// Isolated projection fixtures. These are NOT a replacement for production
// resolveOrderProduct or an assertion about current cafe prices/availability.
const names = name => ({ tr: name, en: name, ru: name });
const product = (name, price) => ({ item: { name: names(name), price } });
const products = new Map([
  ['cold-coffee:iced-latte', product('Iced Latte', 180)],
  ['hot-coffee:espresso', product('Espresso', 110)],
  ['desserts:macaron', product('Macaron', 30)],
  ['fixture:configured-set', product('Set · Hot substitution · Second latte', 550)],
  ['fixture:plain-set', product('Set', 370)]
]);
const latte = 'cold-coffee:iced-latte';
function input(overrides = {}) {
  return {
    snapshot: { revision: 4, lines: [{ id: latte, quantity: 3 }] },
    summary: { quantity: 3, totalMinor: 54000 },
    language: 'en', menuUrl: 'https://safal207.github.io/robys-coffee-house-demo/menu.html',
    resolveProduct: id => products.get(id), ...overrides
  };
}
for (const language of ['tr', 'en', 'ru']) {
  for (const [title, lines, totalMinor, quantity] of [
    ['three lattes', [{ id: latte, quantity: 3 }], 54000, 3],
    ['four lattes and existing espresso', [{ id: latte, quantity: 4 }, { id: 'hot-coffee:espresso', quantity: 1 }], 83000, 5],
    ['three lattes and explicitly selected macaron', [{ id: latte, quantity: 3 }, { id: 'desserts:macaron', quantity: 1 }], 57000, 4]
  ]) {
    test(`${language}: ${title}; exact text and Telegram URL round trip`, () => {
      const result = buildOrderShare(input({ language, snapshot: { revision: 2, lines }, summary: { totalMinor, quantity } }));
      assert(result.text.includes(shareCopy[language].title));
      assert(result.text.endsWith(shareCopy[language].disclaimer));
      assert.equal(result.revision, 2);
      const url = new URL(result.telegramUrl);
      assert.equal(url.origin + url.pathname, 'https://t.me/share/url');
      assert.equal(url.searchParams.get('text'), result.text);
      assert.equal(url.searchParams.get('url'), result.menuUrl);
      assert.deepEqual([...url.searchParams.keys()].sort(), ['text', 'url']);
      assert.equal((result.text.match(/^\d+ × /gm) ?? []).length, lines.length);
    });
  }
}
test('configured names and separately ordered plain set remain distinct', () => {
  const result = buildOrderShare(input({ snapshot: { revision: 1, lines: [{ id: 'fixture:configured-set', quantity: 1 }, { id: 'fixture:plain-set', quantity: 1 }] }, summary: { quantity: 2, totalMinor: 92000 } }));
  assert(result.text.includes('Hot substitution · Second latte'));
  assert.match(result.text, /Total: ₺920/);
});
for (const quantity of [0, -1, 1.5, 100, NaN, Infinity, '3']) {
  test(`invalid quantity rejected: ${String(quantity)}`, () => {
    assert.throws(() => buildOrderShare(input({ snapshot: { revision: 1, lines: [{ id: latte, quantity }] } })), /Invalid order line/);
  });
}
for (const revision of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid revision rejected: ${String(revision)}`, () => assert.throws(() => buildOrderShare(input({ snapshot: { revision, lines: [{ id: latte, quantity: 3 }] } })), /Invalid order snapshot/));
}
test('empty basket rejected rather than shared as an order', () => assert.throws(() => buildOrderShare(input({ snapshot: { revision: 0, lines: [] } })), /Invalid order snapshot/));
test('duplicate rows rejected, not silently combined or dropped', () => assert.throws(() => buildOrderShare(input({ snapshot: { revision: 0, lines: [{ id: latte, quantity: 1 }, { id: latte, quantity: 2 }] } })), /Invalid order line/));
test('unknown product blocks entire list', () => assert.throws(() => buildOrderShare(input({ resolveProduct: () => undefined })), /Unresolved order product/));
test('price mismatch blocks entire list', () => assert.throws(() => buildOrderShare(input({ summary: { quantity: 3, totalMinor: 53999 } })), /Order summary mismatch/));
test('quantity mismatch blocks entire list', () => assert.throws(() => buildOrderShare(input({ summary: { quantity: 4, totalMinor: 54000 } })), /Order summary mismatch/));
test('price uses canonical resolver, not injected line properties', () => {
  const result = buildOrderShare(input({ snapshot: { revision: 1, lines: [{ id: latte, quantity: 3, price: 1, name: 'spoof' }] } }));
  assert.match(result.text, /Total: ₺540/); assert(!result.text.includes('spoof'));
});
for (const price of [-1, 0, 0.001, NaN, Infinity, 1e20]) {
  test(`invalid price rejected: ${String(price)}`, () => assert.throws(() => buildOrderShare(input({ resolveProduct: () => product('Test', price) }))));
}
test('minor-unit rounding agrees with canonical store conversion', () => {
  const result = buildOrderShare(input({ snapshot: { revision: 1, lines: [{ id: latte, quantity: 3 }] }, summary: { quantity: 3, totalMinor: 10002 }, resolveProduct: () => product('Test', 33.335) }));
  assert.match(result.text, /Total: ₺100.02/);
});
test('overflowing sum rejected even when individual lines are safe', () => {
  assert.throws(() => buildOrderShare(input({ snapshot: { revision: 1, lines: [{ id: 'one', quantity: 1 }, { id: 'two', quantity: 1 }] }, resolveProduct: () => product('Test', 50000000000000) })), /overflow/);
});
test('input object is not mutated; frozen inputs remain valid', () => {
  const base = input(); Object.freeze(base.snapshot.lines[0]); Object.freeze(base.snapshot.lines); Object.freeze(base.snapshot); Object.freeze(base.summary); Object.freeze(base);
  const before = JSON.stringify(base); const result = buildOrderShare(base);
  assert.equal(JSON.stringify(base), before); assert(Object.isFrozen(result));
});
test('query and fragment never leak through the menu URL', () => {
  const result = buildOrderShare(input({ menuUrl: 'https://example.test/menu.html?tgWebAppData=PRIVATE&order=secret#token' }));
  assert.equal(result.menuUrl, 'https://example.test/menu.html'); assert(!result.telegramUrl.includes('PRIVATE'));
});
for (const menuUrl of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://user:password@example.test/menu.html', 'not a url']) {
  test(`unsafe menu URL rejected: ${menuUrl.split(':')[0]}`, () => assert.throws(() => buildOrderShare(input({ menuUrl }))));
}
test('development http URL accepted but state still stripped', () => assert.equal(buildOrderShare(input({ menuUrl: 'http://localhost:8080/menu.html?q=secret' })).menuUrl, 'http://localhost:8080/menu.html'));
test('Telegram reserved characters and Unicode preserved without double encoding', () => {
  const name = 'Çay & кофе + lemon = 50% #1 🫖';
  const result = buildOrderShare(input({ resolveProduct: () => product(name, 180) }));
  assert(new URL(result.telegramUrl).searchParams.get('text').includes(name));
});
test('multiline/control product label cannot counterfeit footer layout', () => {
  const result = buildOrderShare(input({ resolveProduct: () => product('Drink\nSpoof\u202e100', 180) }));
  assert(result.text.includes('Drink Spoof 100')); assert(!result.text.includes('\u202e'));
});
test('control-only name rejected after normalization', () => assert.throws(() => buildOrderShare(input({ resolveProduct: () => product('\u202e', 180) })), /Invalid product name/));
test('unsupported language rejected rather than falling back silently', () => assert.throws(() => buildOrderShare(input({ language: 'de' })), /Unsupported language/));
test('prototype names cannot be used as languages', () => assert.throws(() => buildOrderShare(input({ language: 'toString' })), /Unsupported language/));
test('long Telegram URL disabled; complete order preserved for copying', () => {
  const name = 'Ж'.repeat(1400);
  const result = buildOrderShare(input({ resolveProduct: () => product(name, 180) }));
  assert.equal(result.telegramUrl, null); assert(result.text.includes(name)); assert(result.text.endsWith(shareCopy.en.disclaimer));
});
test('all 250 allowed lines retained; 251 rejected', () => {
  const lines = Array.from({ length: 250 }, (_, i) => ({ id: `fixture:${i}`, quantity: 1 }));
  const result = buildOrderShare(input({ snapshot: { revision: 0, lines }, summary: { quantity: 250, totalMinor: 25000 }, resolveProduct: id => product(id, 1) }));
  assert(result.text.includes('fixture:249')); assert.equal(result.telegramUrl, null);
  assert.throws(() => buildOrderShare(input({ snapshot: { revision: 0, lines: [...lines, { id: 'fixture:250', quantity: 1 }] } })), /Invalid order snapshot/);
});
test('ordinary payload fits explicitly documented app budget', () => {
  const result = buildOrderShare(input()); assert(result.telegramUrl.length <= TELEGRAM_LINK_BUDGET);
});
