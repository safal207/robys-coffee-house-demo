import { readFileSync } from "node:fs";
import ts from "typescript";

function fail(message) {
  throw new Error(`[CSP-001] ${message}`);
}

function parse(file, source) {
  const kind = file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function bindings(sourceFile) {
  const initializers = new Map();
  walk(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, node.initializer);
    }
  });
  return { initializers };
}

function literal(node, context, seen = new Set()) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (!ts.isIdentifier(node) || seen.has(node.text)) return undefined;
  const initializer = context.initializers.get(node.text);
  if (!initializer) return undefined;
  const next = new Set(seen);
  next.add(node.text);
  return literal(initializer, context, next);
}

function resolve(node, context, seen = new Set()) {
  if (!node || !ts.isIdentifier(node) || seen.has(node.text)) return node;
  const initializer = context.initializers.get(node.text);
  if (!initializer) return node;
  const next = new Set(seen);
  next.add(node.text);
  return resolve(initializer, context, next);
}

function name(node, context) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression, context) ?? null;
  return null;
}

function object(node, context) {
  const resolved = resolve(node, context);
  return resolved && ts.isObjectLiteralExpression(resolved) ? resolved : null;
}

function fn(node, context) {
  const resolved = resolve(node, context);
  return resolved && (ts.isArrowFunction(resolved) || ts.isFunctionExpression(resolved)) ? resolved : null;
}

function property(objectNode, propertyName, context) {
  return objectNode.properties.find((item) => {
    if (!ts.isPropertyAssignment(item) && !ts.isShorthandPropertyAssignment(item) && !ts.isMethodDeclaration(item)) return false;
    return name(item.name, context) === propertyName;
  });
}

function propertyValue(objectNode, propertyName, context) {
  const item = property(objectNode, propertyName, context);
  if (!item) return undefined;
  if (ts.isPropertyAssignment(item)) return literal(item.initializer, context);
  if (ts.isShorthandPropertyAssignment(item)) return literal(item.name, context);
  return undefined;
}

function contains(root, predicate) {
  let found = false;
  walk(root, (node) => {
    if (!found && predicate(node)) found = true;
  });
  return found;
}

function isTrustedTypes(node, context) {
  const resolved = resolve(node, context);
  return Boolean(
    resolved
    && (ts.isPropertyAccessExpression(resolved) || ts.isElementAccessExpression(resolved))
    && ts.isIdentifier(resolved.expression)
    && resolved.expression.text === "globalThis"
    && name(resolved, context) === "trustedTypes"
  );
}

function isPolicyCall(node, context) {
  if (!ts.isCallExpression(node) || name(node.expression, context) !== "createPolicy") return false;
  if (!ts.isPropertyAccessExpression(node.expression) && !ts.isElementAccessExpression(node.expression)) return false;
  if (!isTrustedTypes(node.expression.expression, context)) return false;
  if (literal(node.arguments[0], context) !== "robys-pwa") return false;
  const policy = object(node.arguments[1], context);
  if (!policy || policy.properties.some(ts.isSpreadAssignment)) return false;
  const creator = property(policy, "createScriptURL", context);
  return Boolean(
    creator
    && (
      ts.isMethodDeclaration(creator)
      || (ts.isPropertyAssignment(creator)
        && (ts.isArrowFunction(creator.initializer) || ts.isFunctionExpression(creator.initializer)))
    )
  );
}

function isTrustedUrlWrapper(node, context) {
  const wrapper = fn(node, context);
  if (!wrapper || wrapper.parameters.length !== 1 || !ts.isIdentifier(wrapper.parameters[0].name)) return false;
  if (!ts.isConditionalExpression(wrapper.body)) return false;
  const parameter = wrapper.parameters[0].name.text;
  if (!isTrustedTypes(wrapper.body.condition, context)) return false;
  if (!ts.isIdentifier(wrapper.body.whenFalse) || wrapper.body.whenFalse.text !== parameter) return false;
  return contains(wrapper.body.whenTrue, (candidate) => {
    if (!ts.isCallExpression(candidate) || name(candidate.expression, context) !== "createScriptURL") return false;
    if (!ts.isPropertyAccessExpression(candidate.expression) && !ts.isElementAccessExpression(candidate.expression)) return false;
    if (candidate.arguments.length !== 1 || !ts.isIdentifier(candidate.arguments[0]) || candidate.arguments[0].text !== parameter) return false;
    return contains(candidate.expression.expression, (inner) => isPolicyCall(inner, context));
  });
}

function isRegister(node, context) {
  if (!ts.isCallExpression(node) || name(node.expression, context) !== "register") return false;
  if (!ts.isPropertyAccessExpression(node.expression) && !ts.isElementAccessExpression(node.expression)) return false;
  const serviceWorker = node.expression.expression;
  return Boolean(
    (ts.isPropertyAccessExpression(serviceWorker) || ts.isElementAccessExpression(serviceWorker))
    && name(serviceWorker, context) === "serviceWorker"
    && ts.isIdentifier(serviceWorker.expression)
    && serviceWorker.expression.text === "navigator"
  );
}

function isCallableReference(node, expectedName, context) {
  const resolved = resolve(node, context);
  if (!resolved) return false;
  if (name(resolved, context) === expectedName) return true;
  if (
    ts.isCallExpression(resolved)
    && (ts.isPropertyAccessExpression(resolved.expression) || ts.isElementAccessExpression(resolved.expression))
    && name(resolved.expression, context) === "bind"
  ) return isCallableReference(resolved.expression.expression, expectedName, context);
  return false;
}

function isOnloadAssignment(node, context) {
  return Boolean(
    ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    && name(node.left, context) === "onload"
  );
}

function analyzeRuntime(file, source) {
  const sourceFile = parse(file, source);
  const context = bindings(sourceFile);
  let registerCalls = 0;
  let validRegisterCalls = 0;
  let pointerCalls = 0;
  let retryablePointerCalls = 0;
  let loadCalls = 0;

  walk(sourceFile, (node) => {
    if (isOnloadAssignment(node, context)) loadCalls += 1;
    if (!ts.isCallExpression(node)) return;
    if (isRegister(node, context)) {
      registerCalls += 1;
      const wrappedUrl = node.arguments[0];
      const options = object(node.arguments[1], context);
      const expectedUrl = literal(ts.factory.createIdentifier("SERVICE_WORKER_URL"), context);
      if (
        ts.isCallExpression(wrappedUrl)
        && isTrustedUrlWrapper(wrappedUrl.expression, context)
        && literal(wrappedUrl.arguments[0], context) === expectedUrl
        && typeof expectedUrl === "string"
        && expectedUrl.startsWith("sw.js?")
        && options
        && !options.properties.some(ts.isSpreadAssignment)
        && propertyValue(options, "scope", context) === "./"
      ) validRegisterCalls += 1;
    }

    if (!isCallableReference(node.expression, "addEventListener", context)) return;
    const event = literal(node.arguments[0], context);
    if (event === "load") loadCalls += 1;
    if (event !== "pointerdown") return;
    pointerCalls += 1;
    const options = object(node.arguments[2], context);
    if (!options || options.properties.some(ts.isSpreadAssignment)) return;
    const once = propertyValue(options, "once", context);
    const passive = propertyValue(options, "passive", context);
    if (once !== true && once !== 1 && (passive === true || passive === 1)) retryablePointerCalls += 1;
  });

  return { registerCalls, validRegisterCalls, pointerCalls, retryablePointerCalls, loadCalls };
}

function isReflectInvocation(node, context) {
  const resolved = resolve(node, context);
  return Boolean(
    resolved
    && (ts.isPropertyAccessExpression(resolved) || ts.isElementAccessExpression(resolved))
    && ts.isIdentifier(resolved.expression)
    && resolved.expression.text === "Reflect"
    && ["apply", "call"].includes(name(resolved, context))
  );
}

function isUnregisterReference(node, context) {
  const resolved = resolve(node, context);
  if (!resolved) return false;
  if (ts.isParenthesizedExpression(resolved)) return isUnregisterReference(resolved.expression, context);
  if (
    ts.isBinaryExpression(resolved)
    && resolved.operatorToken.kind === ts.SyntaxKind.CommaToken
  ) return isUnregisterReference(resolved.right, context);
  if (ts.isIdentifier(resolved)) return resolved.text === "unregister";
  if (ts.isPropertyAccessExpression(resolved) || ts.isElementAccessExpression(resolved)) {
    const memberName = name(resolved, context);
    if (memberName === "unregister") return true;
    if (["call", "apply", "bind"].includes(memberName)) return isUnregisterReference(resolved.expression, context);
    return false;
  }
  if (ts.isCallExpression(resolved)) {
    if (isReflectInvocation(resolved.expression, context)) {
      return isUnregisterReference(resolved.arguments[0], context);
    }
    return isUnregisterReference(resolved.expression, context);
  }
  return false;
}

function hasUnregisterCall(file, source) {
  const sourceFile = parse(file, source);
  const context = bindings(sourceFile);
  let found = false;
  walk(sourceFile, (node) => {
    if (found || !ts.isCallExpression(node)) return;
    if (isReflectInvocation(node.expression, context)) {
      if (isUnregisterReference(node.arguments[0], context)) found = true;
      return;
    }
    if (isUnregisterReference(node.expression, context)) found = true;
  });
  return found;
}

function regressionTests() {
  const cases = [
    [!hasUnregisterCall("lure.js", 'const lure = "registration.unregister()"; // unregister()'), "strings/comments must not look like unregister calls"],
    [hasUnregisterCall("computed.js", 'registration["unregister"]();'), "computed unregister access must be rejected"],
    [hasUnregisterCall("aliased.js", 'const method = "unregister"; registration[method]();'), "aliased computed unregister access must be rejected"],
    [hasUnregisterCall("bare.js", 'const { unregister } = registration; unregister ();'), "destructured bare unregister calls must be rejected"],
    [hasUnregisterCall("call.js", "registration.unregister.call(registration);"), "unregister.call invocations must be rejected"],
    [hasUnregisterCall("apply.js", 'registration["unregister"].apply(registration, []);'), "unregister.apply invocations must be rejected"],
    [hasUnregisterCall("bind.js", "const stop = registration.unregister.bind(registration); stop();"), "bound unregister invocations must be rejected"],
    [hasUnregisterCall("sequence.js", "(0, registration.unregister)();"), "comma-sequence unregister invocations must be rejected"],
    [hasUnregisterCall("reflect-apply.js", "Reflect.apply(registration.unregister, registration, []);"), "Reflect.apply unregister invocations must be rejected"],
    [hasUnregisterCall("reflect-call.js", "Reflect.call(registration.unregister, registration);"), "Reflect.call unregister invocations must be rejected"],
    [!hasUnregisterCall("safe-sequence.js", "(0, registration.register)();"), "safe comma-sequence calls must not be rejected"],
    [!hasUnregisterCall("safe-reflect.js", "Reflect.apply(registration.register, registration, []);"), "safe Reflect.apply calls must not be rejected"],
    [analyzeRuntime("lure-load.js", 'const lure = "addEventListener(\\"load\\", fn)";').loadCalls === 0, "strings must not look like load listeners"],
    [analyzeRuntime("real-load.js", "globalThis.addEventListener ('load', fn);").loadCalls === 1, "formatted load listeners must be detected"],
    [analyzeRuntime("onload.js", "window.onload = fn;").loadCalls === 1, "onload assignments must be detected"],
    [analyzeRuntime("aliased-load.js", "const on = addEventListener; on('load', fn);").loadCalls === 1, "aliased load listeners must be detected"],
    [analyzeRuntime("bound-load.js", "const on = addEventListener.bind(globalThis); on('load', fn);").loadCalls === 1, "bound load listeners must be detected"],
    [analyzeRuntime("retryable.js", 'addEventListener("pointerdown", fn, { passive: true });').retryablePointerCalls === 1, "persistent pointer listeners must pass"],
    [analyzeRuntime("one-shot.js", 'const options = { passive: true, once: true }; addEventListener("pointerdown", fn, options);').retryablePointerCalls === 0, "aliased once:true options must be rejected"]
  ];
  for (const [passed, message] of cases) if (!passed) fail(`AST regression failed: ${message}`);
}

regressionTests();
const landing = analyzeRuntime("pwa.js", readFileSync("pwa.js", "utf8"));
const menu = analyzeRuntime("menu-pwa.js", readFileSync("menu-pwa.js", "utf8"));
const app = readFileSync("src/app.ts", "utf8");

if (landing.registerCalls !== 1 || landing.validRegisterCalls !== 1) fail("Landing must contain one valid Trusted Types service-worker registration chain");
if (menu.registerCalls !== 1 || menu.validRegisterCalls !== 1) fail("Menu must contain one valid Trusted Types service-worker registration chain");
if (landing.loadCalls !== 0 || menu.loadCalls !== 0) fail("PWA registration must not wait for the full load event");
if (landing.pointerCalls !== 1 || landing.retryablePointerCalls !== 1) fail("Install pointer trigger must remain persistent and retryable");
if (hasUnregisterCall("src/app.ts", app)) fail("Landing source must not call unregister in direct, computed, aliased, bare, call, apply, bind, sequence, or Reflect invocation form");

console.log("✅ CSP-001 AST contract passed: Trusted Types registration, retry semantics and unregister prohibition verified.");
