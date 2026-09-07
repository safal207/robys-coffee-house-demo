import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// Always bundle the repository source; never substitute a passing fixture in CI.
const result = await build({ entryPoints: ['src/order-store.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2020' });
const core = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const { createOrderStore, ORDER_KEY, LEGACY_MENU_KEY } = core;
const espresso = 'hot-coffee:espresso';
const latte = 'hot-coffee:caramel-latte';
const americano = 'hot-coffee:americano';
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const checks = [];
function test(name, fn) {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: String(error.stack) }); }
}
const ids = store => store.get().lines.map(line => line.id);

test('quantity edits preserve visual row order', () => {
  const s = createOrderStore(memory());
  s.add(espresso); s.add(latte); s.add(americano); s.setQuantity(espresso, 2);
  assert.deepEqual(ids(s), [espresso, latte, americano]);
  assert.deepEqual(s.summary(), { quantity: 4, totalMinor: 58000 });
});
test('undo restores a removed row at its original position', () => {
  const s = createOrderStore(memory()); s.add(espresso, 2); s.add(latte); s.add(americano);
  s.setQuantity(latte, 0); s.undoRemoval();
  assert.deepEqual(ids(s), [espresso, latte, americano]); assert.equal(s.status().canUndo, false);
});
test('newer cross-page snapshot invalidates stale undo', () => {
  const storage = memory(); const first = createOrderStore(storage);
  first.add(espresso, 2); first.add(latte); first.setQuantity(espresso, 0);
  assert.equal(first.status().canUndo, true);
  const second = createOrderStore(storage); second.add(americano); first.reload();
  assert.equal(first.status().canUndo, false);
  const current = first.get(); first.undoRemoval(); assert.deepEqual(first.get(), current);
  assert.deepEqual(ids(first), [latte, americano]);
});
test('read denied/write allowed cannot erase the saved order', () => {
  const existing = JSON.stringify({ version: 2, revision: 4, lines: [{ id: espresso, quantity: 2 }], migrationDone: true });
  let saved = existing; let writes = 0;
  const s = createOrderStore({ getItem() { throw new Error('read denied'); }, setItem(_key, value) { saved = value; writes++; } });
  assert.equal(writes, 0); assert.equal(saved, existing); s.add(latte);
  assert.equal(saved, existing); assert.equal(writes, 0);
  assert.equal(s.summary().totalMinor, 20000); assert.equal(s.status().persistent, false);
});
test('a broken view cannot report a committed addition as failed', () => {
  const storage = memory(); const observed = [];
  const s = createOrderStore(storage, error => observed.push(String(error))); let refreshed = 0;
  s.subscribe(() => { throw new Error('fixture view failure'); }); s.subscribe(() => { refreshed++; });
  assert.doesNotThrow(() => s.add(espresso));
  assert.equal(refreshed, 1); assert.equal(observed.length, 1);
  assert.equal(JSON.parse(storage.data.get(ORDER_KEY)).lines[0].quantity, 1);
  assert.deepEqual(s.summary(), { quantity: 1, totalMinor: 11000 });
});
test('a failing error reporter cannot corrupt a completed update', () => {
  const s = createOrderStore(memory(), () => { throw new Error('fixture reporter failure'); }); let refreshed = 0;
  s.subscribe(() => { throw new Error('fixture view failure'); }); s.subscribe(() => { refreshed++; });
  assert.doesNotThrow(() => s.add(latte)); assert.equal(refreshed, 1); assert.equal(s.summary().totalMinor, 20000);
});
test('write failure keeps the current-page order without claiming persistence', () => {
  const s = createOrderStore({ getItem: () => null, setItem() { throw new Error('quota'); } });
  s.add(espresso, 2); assert.equal(s.summary().totalMinor, 22000); assert.equal(s.status().persistent, false);
});
test('failed undo at the quantity limit leaves state and undo usable', () => {
  const s = createOrderStore(memory()); s.add(espresso, 2); s.setQuantity(espresso, 0); s.add(espresso, 99);
  const before = s.get(); assert.throws(() => s.undoRemoval());
  assert.deepEqual(s.get(), before); assert.equal(s.status().canUndo, true);
});
test('listeners added during a notification start with the next update', () => {
  const s = createOrderStore(memory()); let current = 0; let late = 0;
  s.subscribe(() => { current++; if (current === 1) s.subscribe(() => { late++; }); });
  s.add(espresso); assert.equal(late, 0); s.add(latte); assert.equal(late, 1);
});
test('unreadable shared data cannot fall back to and overwrite an old basket', () => {
  const existing = JSON.stringify({ version: 2, revision: 4, lines: [{ id: latte, quantity: 1 }], migrationDone: true }); let saved = existing;
  const s = createOrderStore({
    getItem(key) { if (key === ORDER_KEY) throw new Error('read denied'); return key === LEGACY_MENU_KEY ? JSON.stringify({ version: 1, lines: [{ id: espresso, quantity: 2 }] }) : null; },
    setItem(_key, value) { saved = value; }
  });
  assert.equal(saved, existing); assert.equal(s.summary().quantity, 0); assert.equal(s.status().persistent, false);
});
test('batch removal cannot retain undo for an older removal', () => {
  const s = createOrderStore(memory()); s.add(espresso); s.add(latte); s.add(americano);
  s.setQuantity(espresso, 0); assert.equal(s.status().canUndo, true); s.replace([]);
  assert.equal(s.status().canUndo, false); s.undoRemoval(); assert.equal(s.summary().quantity, 0);
});
test('unchanged persisted revision preserves current-document undo', () => {
  const s = createOrderStore(memory()); s.add(espresso, 2); s.add(latte); s.setQuantity(espresso, 0);
  s.reload(); assert.equal(s.status().canUndo, true); s.undoRemoval(); assert.equal(s.summary().totalMinor, 42000);
});
test('no-op changes cannot move existing rows', () => {
  const s = createOrderStore(memory()); s.add(espresso); s.add(latte); s.setQuantity(espresso, 1);
  assert.deepEqual(ids(s), [espresso, latte]);
});
test('quantities and catalog prices survive a second instance', () => {
  const storage = memory(); const s = createOrderStore(storage); s.add(espresso, 2); s.add(latte); s.setQuantity(espresso, 3);
  const fresh = createOrderStore(storage); assert.deepEqual(fresh.get().lines, s.get().lines);
  assert.deepEqual(fresh.summary(), { quantity: 4, totalMinor: 53000 });
});
test('malformed shared JSON is retained while the page works in memory', () => {
  const storage = memory({ [ORDER_KEY]: '{"version":2,"lines":[' }); const original = storage.data.get(ORDER_KEY);
  const s = createOrderStore(storage); s.add(espresso); assert.equal(storage.data.get(ORDER_KEY), original);
  assert.equal(s.summary().quantity, 1); assert.equal(s.status().persistent, false);
});
test('revision overflow is rejected before changing persisted order', () => {
  const storage = memory({ [ORDER_KEY]: JSON.stringify({ version: 2, revision: Number.MAX_SAFE_INTEGER, lines: [{ id: espresso, quantity: 1 }], migrationDone: true }) });
  const s = createOrderStore(storage), before = s.get(), saved = storage.data.get(ORDER_KEY);
  assert.throws(() => s.add(latte), /revision limit/i); assert.deepEqual(s.get(), before); assert.equal(storage.data.get(ORDER_KEY), saved);
});
const report = { suite: 'order-recovery', sourceSha256: createHash('sha256').update(readFileSync('src/order-store.ts')).digest('hex'), total: checks.length, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, checks };
if (process.env.ORDER_TEST_REPORT) writeFileSync(process.env.ORDER_TEST_REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
