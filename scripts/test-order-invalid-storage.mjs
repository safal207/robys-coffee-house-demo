import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

let core;
let scope;
if (process.env.ORDER_TEST_MODULE) {
  if (process.env.GITHUB_ACTIONS === 'true') throw new Error('CI must test repository source, not a module override');
  const modulePath = path.resolve(process.env.ORDER_TEST_MODULE);
  core = await import(pathToFileURL(modulePath));
  scope = { mode: 'isolated-source-functions', moduleSha256: createHash('sha256').update(readFileSync(modulePath)).digest('hex') };
} else {
  const { build } = await import('esbuild');
  const result = await build({ entryPoints: ['src/order-store.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2020' });
  core = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  scope = { mode: 'repository-source-bundle', sourceSha256: createHash('sha256').update(readFileSync('src/order-store.ts')).digest('hex') };
}
const { createOrderStore, ORDER_KEY, LEGACY_MENU_KEY } = core;
const espresso = 'hot-coffee:espresso';
const latte = 'hot-coffee:caramel-latte';
const valid = { version: 2, revision: 4, lines: [{ id: espresso, quantity: 2 }], migrationDone: true };
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  let writes = 0;
  return { data, get writes() { return writes; }, getItem: key => data.get(key) ?? null,
    setItem(key, value) { writes++; data.set(key, value); } };
}
const checks = [];
function test(name, fn) {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: String(error.stack) }); }
}
const invalidRecords = [
  ['newer schema', JSON.stringify({ ...valid, version: 3 }), 'invalid-order'],
  ['negative quantity', JSON.stringify({ ...valid, lines: [{ id: espresso, quantity: -2 }] }), 'invalid-order'],
  ['negative revision', JSON.stringify({ ...valid, revision: -1 }), 'invalid-order'],
  ['fractional revision', JSON.stringify({ ...valid, revision: 1.5 }), 'invalid-order'],
  ['unsafe revision', JSON.stringify({ ...valid, revision: Number.MAX_SAFE_INTEGER + 1 }), 'invalid-order'],
  ['unknown product', JSON.stringify({ ...valid, lines: [{ id: 'missing:item', quantity: 1 }] }), 'invalid-order'],
  ['duplicate product', JSON.stringify({ ...valid, lines: [...valid.lines, ...valid.lines] }), 'invalid-order'],
  ['missing lines', JSON.stringify({ version: 2, revision: 4 }), 'invalid-order'],
  ['JSON null', 'null', 'invalid-order'],
  ['JSON false', 'false', 'invalid-order'],
  ['JSON zero', '0', 'invalid-order'],
  ['JSON empty string', '""', 'invalid-order'],
  ['JSON array', '[]', 'invalid-order'],
  ['empty stored bytes', '', 'storage'],
  ['malformed JSON', '{"version":', 'storage']
];
for (const [name, raw, notice] of invalidRecords) {
  test(`initialization preserves ${name}`, () => {
    const storage = memory({ [ORDER_KEY]: raw, [LEGACY_MENU_KEY]: JSON.stringify({ version: 1, lines: valid.lines }) });
    const s = createOrderStore(storage);
    assert.equal(storage.writes, 0);
    assert.equal(storage.data.get(ORDER_KEY), raw);
    assert.equal(s.status().persistent, false);
    assert.equal(s.status().notice, notice);
    assert.deepEqual(s.get().lines, []);
    s.add(latte);
    assert.deepEqual(s.summary(), { quantity: 1, totalMinor: 20000 });
    s.reload();
    assert.equal(storage.writes, 0);
    assert.equal(storage.data.get(ORDER_KEY), raw);
    assert.equal(s.status().persistent, false);
  });
  test(`restored page preserves ${name} and its in-memory order`, () => {
    const storage = memory();
    const s = createOrderStore(storage);
    s.add(espresso, 2);
    const before = s.get();
    storage.data.set(ORDER_KEY, raw);
    const writes = storage.writes;
    let notifications = 0;
    s.subscribe(() => { notifications++; });
    s.reload();
    assert.equal(notifications, 1);
    assert.deepEqual(s.get(), before);
    assert.equal(s.status().persistent, false);
    assert.equal(s.status().notice, notice);
    s.add(latte);
    assert.deepEqual(s.summary(), { quantity: 3, totalMinor: 42000 });
    assert.equal(storage.writes, writes);
    assert.equal(storage.data.get(ORDER_KEY), raw);
  });
}
test('absent record still permits a persistent first order', () => {
  const storage = memory(); const s = createOrderStore(storage); s.add(latte);
  assert.equal(s.status().persistent, true);
  assert.deepEqual(JSON.parse(storage.data.get(ORDER_KEY)).lines, [{ id: latte, quantity: 1 }]);
});
test('valid existing order is read and remains editable', () => {
  const storage = memory({ [ORDER_KEY]: JSON.stringify(valid) }); const s = createOrderStore(storage); s.add(latte);
  assert.equal(s.status().persistent, true);
  assert.deepEqual(s.summary(), { quantity: 3, totalMinor: 42000 });
  assert.deepEqual(createOrderStore(storage).get(), s.get());
});
test('valid newer revision still reloads', () => {
  const storage = memory(); const first = createOrderStore(storage); first.add(espresso);
  const second = createOrderStore(storage); second.add(latte);
  first.reload(); assert.deepEqual(first.get(), second.get()); assert.equal(first.status().persistent, true);
});
test('valid older revision is ignored without disabling persistence', () => {
  const storage = memory({ [ORDER_KEY]: JSON.stringify(valid) }); const s = createOrderStore(storage); s.add(latte);
  const before = s.get(); storage.data.set(ORDER_KEY, JSON.stringify({ ...valid, revision: 0 }));
  s.reload(); assert.deepEqual(s.get(), before); assert.equal(s.status().persistent, true);
});
test('even an older invalid revision cannot authorize overwriting stored bytes', () => {
  const storage = memory({ [ORDER_KEY]: JSON.stringify(valid) }); const s = createOrderStore(storage);
  const raw = JSON.stringify({ ...valid, revision: 0, lines: [{ id: espresso, quantity: -1 }] });
  storage.data.set(ORDER_KEY, raw); s.reload(); s.add(latte);
  assert.equal(s.status().persistent, false); assert.equal(storage.data.get(ORDER_KEY), raw);
});
const report = { suite: 'order-invalid-storage-preservation', scope, total: checks.length,
  passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, checks };
if (process.env.ORDER_TEST_REPORT) writeFileSync(process.env.ORDER_TEST_REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
