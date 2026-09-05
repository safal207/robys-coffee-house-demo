import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMenuRuntime, readVerifiedMenuSource } from './menu-runtime-source.mjs';

// Verify the real shipped bytes before testing rejection in an isolated fixture.
const source = readVerifiedMenuSource();
const emitted = readFileSync('menu-app.js', 'utf8');
assert.ok(Buffer.byteLength(emitted) < Buffer.byteLength(source), 'runtime must remain compact');
const cwd = process.cwd();
const fixture = mkdtempSync(join(tmpdir(), 'robys-runtime-contract-'));
try {
  process.chdir(fixture);
  mkdirSync('src');
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
} finally {
  process.chdir(cwd);
  rmSync(fixture, { recursive: true, force: true });
}
assert.equal(readFileSync('menu-app.js', 'utf8'), emitted, 'real runtime was modified by test');
console.log('Menu runtime contract: PASS (source parity, compact output, tamper rejection, stale-source rejection, rebuild recovery)');
