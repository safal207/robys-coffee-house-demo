import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMenuRuntime, readVerifiedMenuSource } from './menu-runtime-source.mjs';

// Verify the real shipped bytes before testing rejection in an isolated fixture.
const source = readVerifiedMenuSource();
const emitted = readFileSync('menu-app.js', 'utf8');
assert.ok(Buffer.byteLength(emitted) < Buffer.byteLength(source), 'runtime must remain compact');
const dependency = readFileSync('order-store.js', 'utf8');
const cwd = process.cwd();
const fixture = mkdtempSync(join(tmpdir(), 'robys-runtime-contract-'));
try {
  process.chdir(fixture);
  mkdirSync('src');
  writeFileSync('order-store.js', dependency);
  const original = 'export const count = 1;\n';
  writeFileSync('src/menu-app.js', original);
  writeFileSync('menu-app.js', compileMenuRuntime(original));
  assert.equal(readVerifiedMenuSource(), original);
  writeFileSync('menu-app.js', compileMenuRuntime(original) + '// unexpected runtime edit\n');
  assert.throws(() => readVerifiedMenuSource(), /stale or differs/);
  writeFileSync('menu-app.js', compileMenuRuntime(original));
  writeFileSync('src/menu-app.js', 'export const count = 2;\n');
  assert.throws(() => readVerifiedMenuSource(), /stale or differs/);
  writeFileSync('menu-app.js', compileMenuRuntime());
  assert.equal(readVerifiedMenuSource(), 'export const count = 2;\n');
  // A changed shared dependency must invalidate the emitted import URL.
  const importsOrder = 'import { order } from "./order-store.js"; export const count = () => order.get();\n';
  writeFileSync('src/menu-app.js', importsOrder);
  writeFileSync('menu-app.js', compileMenuRuntime());
  assert.equal(readVerifiedMenuSource(), importsOrder);
  writeFileSync('order-store.js', dependency + '\n// changed dependency fixture\n');
  assert.throws(() => readVerifiedMenuSource(), /stale or differs/);
  writeFileSync('menu-app.js', compileMenuRuntime());
  assert.equal(readVerifiedMenuSource(), importsOrder);

} finally {
  process.chdir(cwd);
  rmSync(fixture, { recursive: true, force: true });
}
assert.equal(readFileSync('menu-app.js', 'utf8'), emitted, 'real runtime was modified by test');
assert.equal(readFileSync('order-store.js', 'utf8'), dependency, 'real dependency was modified by test');
console.log('Menu runtime contract: PASS (source parity, compact output, tamper rejection, stale-source rejection, rebuild recovery)');
