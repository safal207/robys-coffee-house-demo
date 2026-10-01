import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import ts from 'typescript';

// Compare cooked literal values and all AST child kinds, ignoring source offsets
// and raw escape spelling. Do not execute the application or normalize its copy.
function semanticTree(source) {
  const file = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0, 'Emitted bundle must parse');
  function visit(node) {
    const children = [];
    ts.forEachChild(node, child => { children.push(visit(child)); });
    return [node.kind, !ts.isSourceFile(node) && typeof node.text === 'string' ? node.text : null, children];
  }
  return visit(file);
}
const entries = [
  ['page', 'app-v2'], ['cart', 'cart-v2'], ['experiments', 'experiments-v2'],
  ['analytics', 'analytics-v2'], ['decision-trace', 'decision-trace-v2'], ['release-qa', 'release-qa']
];
let asciiBytes = 0;
let utf8Bytes = 0;
for (const [source, output] of entries) {
  const options = {
    entryPoints: [`src/smart-choice/${source}.ts`], bundle: true, minify: true,
    format: 'esm', platform: 'browser', target: 'es2020', write: false, legalComments: 'none'
  };
  const ascii = (await build({ ...options, charset: 'ascii' })).outputFiles[0].text;
  const utf8 = (await build({ ...options, charset: 'utf8' })).outputFiles[0].text;
  assert.deepEqual(semanticTree(utf8), semanticTree(ascii), `${source}: localized literals or AST changed`);
  assert.equal(readFileSync(`smart-choice/${output}.js`, 'utf8'), utf8, `${source}: emitted bytes differ; rebuild from source`);
  asciiBytes += Buffer.byteLength(ascii);
  utf8Bytes += Buffer.byteLength(utf8);
}
assert.ok(utf8Bytes < asciiBytes, 'UTF-8 must remove encoding overhead');
// Keep the independent 300 KB and per-file budgets in verify-smart-choice-release.mjs.
console.log(`PASS SMART-CHOICE-ENCODING: ${entries.length} equivalent ASTs; ${asciiBytes} -> ${utf8Bytes} bytes; saved ${asciiBytes - utf8Bytes}.`);
