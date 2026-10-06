import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";
import ts from "typescript";

// Check exact source/runtime parity plus decoded literal preservation.
// Identifier allocation may differ with charset, so don't compare minified
// identifiers or claim that a smaller file alone proves semantic equivalence.
const entries = [
  ["page", "app-v2"], ["cart", "cart-v2"],
  ["experiments", "experiments-v2"], ["analytics", "analytics-v2"],
  ["decision-trace", "decision-trace-v2"], ["release-qa", "release-qa"]
];
const digest = (value) => createHash("sha256").update(value).digest("hex");
function literals(code) {
  const ast = ts.createSourceFile("module.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "generated JavaScript must parse");
  const values = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ||
        ts.isRegularExpressionLiteral(node) || ts.isTemplateLiteralToken(node)) {
      values.push([node.kind, node.text]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return digest(JSON.stringify(values));
}
let baselineBytes = 0;
let outputBytes = 0;
for (const [source, output] of entries) {
  const outfile = `smart-choice/${output}.js`;
  const options = {
    entryPoints: [`src/smart-choice/${source}.ts`],
    outfile, write: false, bundle: true, minify: true,
    format: "esm", platform: "browser", target: "es2020",
    legalComments: "none", logLevel: "silent"
  };
  const ascii = buildSync({ ...options, charset: "ascii" }).outputFiles[0].text;
  const utf8 = buildSync({ ...options, charset: "utf8" }).outputFiles[0].text;
  const actual = readFileSync(outfile, "utf8");
  assert.equal(digest(actual), digest(utf8), `${outfile}: stale or altered UTF-8 runtime`);
  assert.equal(literals(actual), literals(ascii), `${outfile}: literal values changed`);
  assert.ok(Buffer.byteLength(actual) <= Buffer.byteLength(ascii), `${outfile}: unexpected size growth`);
  baselineBytes += Buffer.byteLength(ascii);
  outputBytes += Buffer.byteLength(actual);
}
assert.notEqual(literals('export const currency="TRY";'), literals('export const currency="USD";'));
assert.equal(literals('export const text="İı şğü Русский ₺";'), literals('export const text="\\u0130\\u0131 \\u015f\\u011f\\u00fc \\u0420\\u0443\\u0441\\u0441\\u043a\\u0438\\u0439 \\u20ba";'));
assert.match(readFileSync("smart-choice/index.html", "utf8"), /<meta\s+charset=["']utf-8["']/i);
console.log(`SMART-CHOICE-ENCODING: 6 source/runtime pairs and decoded literals match; ${baselineBytes} B ASCII -> ${outputBytes} B UTF-8; mutated currency rejected.`);
