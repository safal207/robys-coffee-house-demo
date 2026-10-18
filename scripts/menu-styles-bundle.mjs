import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

export const MENU_STYLESHEET_FILE = "menu-runtime.css";
// This is the existing menu.html cascade, including the approved brand layer.
// Only the stability pathname is an alias of a separately authored input.
export const MENU_STYLE_INPUTS = Object.freeze([
  { source: "styles-v2.css", delivered: "styles-v2.css" },
  { source: "menu-premium.css", delivered: "menu-premium.css" },
  { source: "menu-family.css", delivered: "menu-family.css" },
  { source: "menu-product-reveal.css", delivered: "menu-product-reveal.css" },
  { source: "pairing-posters.css", delivered: "pairing-posters.css" },
  { source: "menu-stability.css", delivered: "menu-stability-v2.css" },
  { source: "menu-security-v2.css", delivered: "menu-security-v2.css" },
  { source: "brand-photo-logo.css", delivered: "brand-photo-logo.css" },
  { source: "order-checkout.css", delivered: "order-checkout.css" }
].map(Object.freeze));

export function readMenuStylesSources(root = process.cwd()) {
  return Object.fromEntries(MENU_STYLE_INPUTS.map(({ source }) => [source, readFileSync(resolve(root, source))]));
}

// Preserve every authored byte. A single LF separates files without trimming,
// rewriting relative URLs, minifying declarations, or adding CSS layers.
export function compileMenuStylesBundle(sources = readMenuStylesSources()) {
  const chunks = [];
  for (const { source } of MENU_STYLE_INPUTS) {
    assert.ok(Object.hasOwn(sources, source), `${source}: menu stylesheet source is missing`);
    const bytes = sources[source];
    assert.ok(Buffer.isBuffer(bytes) || typeof bytes === "string", `${source}: CSS input must be bytes or text`);
    if (chunks.length) chunks.push(Buffer.from("\n"));
    chunks.push(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  }
  return Buffer.concat(chunks);
}

export function menuStylesRevision(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

// Byte offsets exclude the single LF separators. A fault-injection fixture can
// replace one source and prove every other source segment remains verbatim.
export function menuStylesSourceMap(sources = readMenuStylesSources()) {
  let end = 0;
  return MENU_STYLE_INPUTS.map(({ source, delivered }, index) => {
    assert.ok(Object.hasOwn(sources, source), `${source}: menu stylesheet source is missing`);
    const start = end + (index ? 1 : 0);
    end = start + Buffer.byteLength(sources[source]);
    return { source, delivered, start, end };
  });
}

export function readMenuStylesBundleInputs(root = process.cwd()) {
  return {
    sources: readMenuStylesSources(root),
    bundleBytes: readFileSync(resolve(root, MENU_STYLESHEET_FILE)),
    menuHtml: readFileSync(resolve(root, "menu.html"), "utf8"),
    serviceWorker: readFileSync(resolve(root, "sw-core-v64.js"), "utf8"),
    stabilityAliasBytes: readFileSync(resolve(root, "menu-stability-v2.css"))
  };
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1].toLowerCase();
    assert.ok(!Object.hasOwn(result, name), `Menu stylesheet attributes must not repeat ${name}`);
    result[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

export function verifyMenuStylesheetLink(menuHtml, bundleBytes) {
  const expectedUrl = `${MENU_STYLESHEET_FILE}?v=${menuStylesRevision(bundleBytes)}`;
  const markup = menuHtml.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const links = [...markup.matchAll(/<link\b([^>]*?)\/?\s*>/gi)]
    .map(match => attributes(match[1])).filter(attrs => attrs.rel?.toLowerCase().split(/\s+/).includes("stylesheet"));
  assert.equal(links.length, 1, "Menu must load exactly one real blocking stylesheet");
  assert.equal(links[0].href, expectedUrl, "Menu must load the exact content revision of its CSS bundle");
  assert.equal(links[0].rel.toLowerCase(), "stylesheet", "Menu CSS bundle must not be an alternate stylesheet");
  assert.ok(!Object.hasOwn(links[0], "disabled") && (!links[0].media || links[0].media.toLowerCase() === "all"),
    "Menu CSS bundle must apply before the first screen is shown");
  return { expectedUrl };
}

function topLevelVariable(statements, name) {
  for (const statement of statements) if (ts.isVariableStatement(statement)) {
    const declaration = statement.declarationList.declarations.find(node => ts.isIdentifier(node.name) && node.name.text === name);
    if (declaration) return declaration.initializer;
  }
}

function unparenthesized(node) {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function isExactPathTerm(node) {
  node = unparenthesized(node);
  if (node && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    return isExactPathTerm(node.left) || isExactPathTerm(node.right);
  if (!node || !ts.isCallExpression(node) || node.arguments.length !== 1 ||
    !ts.isStringLiteral(node.arguments[0]) || node.arguments[0].text !== `/${MENU_STYLESHEET_FILE}`) return false;
  const method = node.expression;
  return ts.isPropertyAccessExpression(method) && method.name.text === "endsWith" &&
    ts.isPropertyAccessExpression(method.expression) && method.expression.name.text === "pathname" &&
    ts.isIdentifier(method.expression.expression) && method.expression.expression.text === "url";
}

export function verifyMenuStylesCache(serviceWorker, bundleBytes) {
  const revision = menuStylesRevision(bundleBytes);
  const expectedUrl = `./${MENU_STYLESHEET_FILE}?v=${revision}`;
  const ast = ts.createSourceFile("sw-core-v64.js", serviceWorker, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "Service worker must parse before checking menu CSS cache identity");
  const assets = topLevelVariable(ast.statements, "CORE_ASSETS");
  assert.ok(assets && ts.isArrayLiteralExpression(assets), "Service worker needs a real CORE_ASSETS array");
  const bundleUrls = assets.elements.filter(ts.isStringLiteral).map(node => node.text)
    .filter(url => url.split("?")[0] === `./${MENU_STYLESHEET_FILE}`);
  assert.deepEqual(bundleUrls, [expectedUrl], "Service worker must precache only the bundle's exact content revision");
  const version = topLevelVariable(ast.statements, "CACHE_VERSION");
  assert.ok(version && ts.isStringLiteral(version) && version.text.includes(`-menu-css-${revision}-`),
    "Service worker namespace must bind the actual menu CSS bundle bytes");
  const cachedResponse = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "cachedResponse");
  assert.ok(cachedResponse?.body, "Service worker must expose its actual cachedResponse function");
  const statements = cachedResponse.body.statements;
  assert.ok(isExactPathTerm(topLevelVariable(statements, "requiresExactRevision")),
    "Menu CSS bundle must participate in the actual exact-query cache decision");
  const branchIndex = statements.findIndex(node => ts.isIfStatement(node) && ts.isIdentifier(node.expression) && node.expression.text === "requiresExactRevision");
  assert.ok(branchIndex >= 0 && !statements.slice(0, branchIndex).some(ts.isReturnStatement),
    "Exact-revision cache branch must be reachable before a fallback return");
  const branch = statements[branchIndex].thenStatement;
  const body = ts.isBlock(branch) ? branch.statements : [branch];
  const returned = body.length === 1 && ts.isReturnStatement(body[0]) ? unparenthesized(body[0].expression) : null;
  assert.ok(returned && ts.isCallExpression(returned) && returned.arguments.length === 1 &&
    ts.isIdentifier(returned.arguments[0]) && returned.arguments[0].text === "request" &&
    ts.isPropertyAccessExpression(returned.expression) && returned.expression.name.text === "match" &&
    ts.isIdentifier(returned.expression.expression) && returned.expression.expression.text === "cache",
  "Menu CSS cache branch must preserve query-string identity with cache.match(request)");
  return { revision, expectedUrl };
}

export function verifyMenuStylesBundle({ sources, bundleBytes, menuHtml, serviceWorker, stabilityAliasBytes }) {
  assert.deepEqual(bundleBytes, compileMenuStylesBundle(sources),
    "Delivered menu CSS must preserve all nine current source files in the reviewed cascade order");
  assert.deepEqual(stabilityAliasBytes, sources["menu-stability.css"],
    "Delivered menu stability alias must preserve the approved source bytes");
  verifyMenuStylesheetLink(menuHtml, bundleBytes);
  return verifyMenuStylesCache(serviceWorker, bundleBytes);
}
