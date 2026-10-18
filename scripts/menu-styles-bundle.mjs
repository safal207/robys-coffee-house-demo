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
  { source: "menu-combos.css", delivered: "menu-combos.css" },
  { source: "combo-entry.css", delivered: "combo-entry.css" },
  { source: "choice-help.css", delivered: "choice-help.css" },
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

const htmlSpace = character => character !== undefined && /[\t\n\f\r ]/.test(character);

// Bounded traversal of authored HTML, not sanitization or HTML generation.
// Keep source offsets intact; quoted '>' and text inside other tags must never
// manufacture a stylesheet. Reject malformed/unsupported syntax fail closed.
function readHtmlTag(html, start) {
  let position = start + 1;
  const closing = html[position] === "/";
  if (closing) position += 1;
  if (!/[a-z]/i.test(html[position] ?? "")) return null;
  const nameStart = position;
  while (position < html.length && !htmlSpace(html[position]) && html[position] !== "/" && html[position] !== ">") position += 1;
  const name = html.slice(nameStart, position).toLowerCase();
  const attributes = Object.create(null);
  while (position < html.length) {
    while (htmlSpace(html[position])) position += 1;
    if (html[position] === ">") return { name, closing, attributes, end: position + 1 };
    if (html[position] === "/") {
      position += 1;
      while (htmlSpace(html[position])) position += 1;
      assert.equal(html[position], ">", "Menu HTML self-closing marker must end its tag");
      return { name, closing, attributes, end: position + 1 };
    }
    const attributeStart = position;
    while (position < html.length && !htmlSpace(html[position]) && !/[=/>]/.test(html[position])) position += 1;
    const attribute = html.slice(attributeStart, position).toLowerCase();
    assert.ok(attribute && !/["'`<\0]/.test(attribute), "Menu HTML attributes must have well-formed names");
    assert.ok(!Object.hasOwn(attributes, attribute), `Menu stylesheet attributes must not repeat ${attribute}`);
    while (htmlSpace(html[position])) position += 1;
    let value = "";
    if (html[position] === "=") {
      position += 1;
      while (htmlSpace(html[position])) position += 1;
      const quote = html[position] === '"' || html[position] === "'" ? html[position++] : null;
      const valueStart = position;
      if (quote) {
        while (position < html.length && html[position] !== quote) position += 1;
        assert.ok(position < html.length, "Menu HTML quoted attribute must terminate");
        value = html.slice(valueStart, position++);
      } else {
        while (position < html.length && !htmlSpace(html[position]) && html[position] !== ">") position += 1;
        value = html.slice(valueStart, position);
        assert.ok(value && !/["'`<=\0]/.test(value), "Menu HTML unquoted attribute must be well formed");
      }
    }
    attributes[attribute] = value;
  }
  assert.fail("Menu HTML tag must terminate");
}

function commentEnd(html, start) {
  // HTML permits these two abrupt empty-comment endings as well as --!>.
  if (html[start + 4] === ">") return start + 5;
  if (html.startsWith("->", start + 4)) return start + 6;
  const ordinary = html.indexOf("-->", start + 4);
  const bang = html.indexOf("--!>", start + 4);
  const end = ordinary < 0 ? bang : bang < 0 ? ordinary : Math.min(ordinary, bang);
  assert.ok(end >= 0, "Menu HTML comment must terminate");
  return end + (end === bang ? 4 : 3);
}

function textElementEnd(html, tag) {
  if (tag.name === "plaintext") return html.length;
  let position = tag.end;
  while ((position = html.indexOf("</", position)) >= 0) {
    const boundary = position + tag.name.length + 2;
    if (html.slice(position + 2, boundary).toLowerCase() === tag.name
        && (htmlSpace(html[boundary]) || html[boundary] === ">" || html[boundary] === "/")) {
      // Script escaped/double-escaped tokenization is deliberately outside
      // this authored-page contract; never treat a possibly inert link as real.
      assert.ok(tag.name !== "script" || !html.slice(tag.end, position).includes("<!--"),
        "Menu HTML escaped script syntax is unsupported");
      return readHtmlTag(html, position).end;
    }
    position += 2;
  }
  assert.fail(`Menu HTML ${tag.name} text element must terminate`);
}

function stylesheetLinks(html) {
  const textElements = new Set(["script", "style", "noscript", "title", "textarea", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
  const inertElements = new Set(["template", "select", "frameset"]);
  const inert = [];
  const links = [];
  let position = 0;
  while ((position = html.indexOf("<", position)) >= 0) {
    if (html.startsWith("<!--", position)) { position = commentEnd(html, position); continue; }
    if (html.startsWith("<!", position) || html.startsWith("<?", position)) {
      // Only the normal HTML doctype is needed by this page. Other declarations
      // and processing instructions are rejected rather than approximated.
      const end = html.indexOf(">", position + 2);
      assert.ok(end >= 0 && /^<!doctype\s+html\s*>$/i.test(html.slice(position, end + 1)),
        "Menu HTML declaration is unsupported or unterminated");
      position = end + 1;
      continue;
    }
    const tag = readHtmlTag(html, position);
    if (!tag) { position += 1; continue; }
    position = tag.end;
    if (tag.closing) {
      if (inertElements.has(tag.name) && inert.length) {
        assert.equal(inert[inert.length - 1], tag.name, "Menu HTML inert containers must be properly nested");
        inert.pop();
      }
      continue;
    }
    // Foreign integration points and HTML breakouts need the complete HTML
    // namespace algorithm. This authored page uses external SVG assets only.
    assert.ok(tag.name !== "svg" && tag.name !== "math", "Menu HTML foreign containers are unsupported");
    if (textElements.has(tag.name)) { position = textElementEnd(html, tag); continue; }
    // In HTML a trailing slash does not close a template or raw-text element.
    if (inertElements.has(tag.name)) { inert.push(tag.name); continue; }
    if (tag.name !== "link") continue;
    assert.ok(!tag.attributes.rel?.includes("&"), "Menu stylesheet rel character references are unsupported");
    const relations = (tag.attributes.rel ?? "").toLowerCase().split(/[\t\n\f\r ]+/).filter(Boolean);
    if (!relations.includes("stylesheet")) continue;
    if (inert.length) {
      assert.ok(inert.every(name => name === "template"), "Menu HTML stylesheet context is unsupported");
      continue;
    }
    links.push({ ...tag.attributes, relations });
  }
  assert.equal(inert.length, 0, "Menu HTML inert container must terminate");
  return links;
}

export function verifyMenuStylesheetLink(menuHtml, bundleBytes) {
  const expectedUrl = `${MENU_STYLESHEET_FILE}?v=${menuStylesRevision(bundleBytes)}`;
  const links = stylesheetLinks(menuHtml);
  assert.equal(links.length, 1, "Menu must load exactly one real blocking stylesheet");
  assert.equal(links[0].href, expectedUrl, "Menu must load the exact content revision of its CSS bundle");
  assert.ok(!links[0].relations.includes("alternate"), "Menu CSS bundle must not be an alternate stylesheet");
  const media = (links[0].media ?? "").toLowerCase().split(/[\t\n\f\r ]+/).filter(Boolean);
  assert.ok(!Object.hasOwn(links[0], "disabled") && (media.length === 0 || (media.length === 1 && media[0] === "all")),
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
    "Delivered menu CSS must preserve all current source files in the reviewed cascade order");
  assert.deepEqual(stabilityAliasBytes, sources["menu-stability.css"],
    "Delivered menu stability alias must preserve the approved source bytes");
  verifyMenuStylesheetLink(menuHtml, bundleBytes);
  return verifyMenuStylesCache(serviceWorker, bundleBytes);
}
