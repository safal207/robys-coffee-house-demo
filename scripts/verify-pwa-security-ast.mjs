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

function isFunctionScope(node) {
  return Boolean(
    node
    && (
      ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node)
      || ts.isGetAccessorDeclaration(node)
      || ts.isSetAccessorDeclaration(node)
      || ts.isConstructorDeclaration(node)
    )
  );
}

function isLexicalScope(node) {
  return Boolean(
    node
    && (
      ts.isSourceFile(node)
      || ts.isBlock(node)
      || ts.isCaseBlock(node)
      || ts.isModuleBlock(node)
      || isFunctionScope(node)
    )
  );
}

function enclosingScope(node) {
  let current = node;
  while (current && !isLexicalScope(current)) current = current.parent;
  return current ?? null;
}

function scopeDepth(node) {
  let depth = 0;
  for (let current = node; current; current = current.parent) depth += 1;
  return depth;
}

function isInside(node, scope) {
  for (let current = node; current; current = current.parent) {
    if (current === scope) return true;
  }
  return false;
}

function addBinding(context, name, declaration, initializer, scope, immutable) {
  if (!scope) return;
  const record = {
    name,
    declaration,
    initializer,
    scope,
    immutable,
    mutated: false,
    depth: scopeDepth(scope)
  };
  const records = context.records.get(name) ?? [];
  records.push(record);
  context.records.set(name, records);
}

function nearestBinding(node, context) {
  if (!node || !ts.isIdentifier(node)) return null;
  const candidates = (context.records.get(node.text) ?? [])
    .filter((record) => isInside(node, record.scope));
  if (!candidates.length) return null;
  const deepest = Math.max(...candidates.map((record) => record.depth));
  const matches = candidates.filter((record) => record.depth === deepest);
  return matches.length === 1 ? matches[0] : { ambiguous: true };
}

function rootIdentifier(node) {
  let current = node;
  while (
    current
    && (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
    )
  ) current = current.expression;
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return rootIdentifier(current.expression);
  }
  return ts.isIdentifier(current) ? current : null;
}

function markMutation(node, context) {
  const identifier = rootIdentifier(node);
  const record = nearestBinding(identifier, context);
  if (record && !record.ambiguous) record.mutated = true;
}

function isKnownMutationCall(node, context) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return false;
  if (!ts.isIdentifier(expression.expression)) return false;
  const owner = expression.expression.text;
  const member = name(expression, context);
  return (
    (owner === "Object" && ["assign", "defineProperty", "defineProperties"].includes(member))
    || (owner === "Reflect" && ["set", "defineProperty", "deleteProperty"].includes(member))
  );
}

function bindings(sourceFile) {
  const context = { records: new Map(), sourceFile };

  walk(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const list = node.parent;
      const immutable = ts.isVariableDeclarationList(list)
        && (list.flags & ts.NodeFlags.Const) !== 0;
      addBinding(
        context,
        node.name.text,
        node,
        node.initializer ?? null,
        enclosingScope(list),
        immutable
      );
      return;
    }

    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      addBinding(context, node.name.text, node, null, enclosingScope(node.parent), false);
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      addBinding(context, node.name.text, node, null, enclosingScope(node.parent), false);
      return;
    }

    if (ts.isFunctionExpression(node) && node.name) {
      addBinding(context, node.name.text, node, null, node, false);
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      addBinding(context, node.name.text, node, null, enclosingScope(node.parent), false);
    }
  });

  walk(sourceFile, (node) => {
    if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      markMutation(node.left, context);
      return;
    }

    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
    ) {
      markMutation(node.operand, context);
      return;
    }

    if (ts.isDeleteExpression(node)) {
      markMutation(node.expression, context);
      return;
    }

    if (isKnownMutationCall(node, context) && node.arguments[0]) {
      markMutation(node.arguments[0], context);
    }
  });

  return context;
}

function safeBinding(node, context) {
  const record = nearestBinding(node, context);
  if (
    !record
    || record.ambiguous
    || !record.immutable
    || record.mutated
    || !record.initializer
  ) return null;
  return record;
}

function constantLiteral(identifierName, context) {
  const records = (context.records.get(identifierName) ?? [])
    .filter((record) => record.scope === context.sourceFile);
  if (records.length !== 1) return undefined;
  const [record] = records;
  if (!record.immutable || record.mutated || !record.initializer) return undefined;
  return literal(record.initializer, context, new Set([record]));
}

function literal(node, context, seen = new Set()) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (!ts.isIdentifier(node)) return undefined;
  const record = safeBinding(node, context);
  if (!record || seen.has(record)) return undefined;
  const next = new Set(seen);
  next.add(record);
  return literal(record.initializer, context, next);
}

function stringValues(node, context, seen = new Set()) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return new Set([node.text]);
  }
  if (!ts.isIdentifier(node)) return null;
  const record = nearestBinding(node, context);
  if (
    !record
    || record.ambiguous
    || !record.immutable
    || record.mutated
    || seen.has(record)
  ) return null;
  const next = new Set(seen);
  next.add(record);
  if (record.initializer) return stringValues(record.initializer, context, next);

  const declarationList = record.declaration.parent;
  const forOf = declarationList?.parent;
  if (
    ts.isVariableDeclarationList(declarationList)
    && ts.isForOfStatement(forOf)
    && forOf.initializer === declarationList
  ) {
    const iterable = resolve(forOf.expression, context);
    if (!iterable || !ts.isArrayLiteralExpression(iterable)) return null;
    const values = new Set();
    for (const element of iterable.elements) {
      const value = literal(element, context, next);
      if (typeof value !== "string") return null;
      values.add(value);
    }
    return values;
  }
  return null;
}

function resolve(node, context, seen = new Set()) {
  if (!node || !ts.isIdentifier(node)) return node;
  const record = nearestBinding(node, context);
  if (!record) return node;
  if (
    record.ambiguous
    || !record.immutable
    || record.mutated
    || !record.initializer
    || seen.has(record)
  ) return null;
  const next = new Set(seen);
  next.add(record);
  return resolve(record.initializer, context, next);
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

function possiblyCallableReference(node, expectedName, context, seen = new Set()) {
  if (!node) return false;
  if (ts.isIdentifier(node)) {
    const record = nearestBinding(node, context);
    if (!record) return node.text === expectedName;
    if (record.ambiguous) {
      return (context.records.get(node.text) ?? []).some((candidate) => (
        candidate.initializer
        && !seen.has(candidate)
        && possiblyCallableReference(
          candidate.initializer,
          expectedName,
          context,
          new Set([...seen, candidate])
        )
      ));
    }
    if (!record.initializer || seen.has(record)) return false;
    const next = new Set(seen);
    next.add(record);
    return possiblyCallableReference(record.initializer, expectedName, context, next);
  }
  if (
    ts.isCallExpression(node)
    && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
    && name(node.expression, context) === "bind"
  ) return possiblyCallableReference(node.expression.expression, expectedName, context, seen);
  return name(node, context) === expectedName;
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
  let ambiguousEventCalls = 0;

  walk(sourceFile, (node) => {
    if (isOnloadAssignment(node, context)) loadCalls += 1;
    if (!ts.isCallExpression(node)) return;
    if (isRegister(node, context)) {
      registerCalls += 1;
      const wrappedUrl = node.arguments[0];
      const options = object(node.arguments[1], context);
      const expectedUrl = constantLiteral("SERVICE_WORKER_URL", context);
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

    const exactEventListener = isCallableReference(node.expression, "addEventListener", context);
    if (!exactEventListener) {
      if (possiblyCallableReference(node.expression, "addEventListener", context)) ambiguousEventCalls += 1;
      return;
    }
    const events = stringValues(node.arguments[0], context);
    if (!events || events.size === 0) {
      ambiguousEventCalls += 1;
      return;
    }
    if (events.has("load")) loadCalls += 1;
    if (!events.has("pointerdown")) return;
    if (events.size !== 1) {
      ambiguousEventCalls += 1;
      return;
    }
    pointerCalls += 1;
    const options = object(node.arguments[2], context);
    if (!options || options.properties.some(ts.isSpreadAssignment)) return;
    const once = propertyValue(options, "once", context);
    const passive = propertyValue(options, "passive", context);
    if (once !== true && once !== 1 && (passive === true || passive === 1)) retryablePointerCalls += 1;
  });

  return {
    registerCalls,
    validRegisterCalls,
    pointerCalls,
    retryablePointerCalls,
    loadCalls,
    ambiguousEventCalls
  };
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
    [analyzeRuntime("mutated-event.js", 'let event = "pointerdown"; event = "load"; addEventListener(event, fn, { passive: true });').ambiguousEventCalls === 1, "mutated event aliases must fail closed"],
    [analyzeRuntime("shadowed-event.js", 'const event = "pointerdown"; { const event = "load"; addEventListener(event, fn); }').loadCalls === 1, "shadowed event aliases must resolve lexically"],
    [analyzeRuntime("mutated-options.js", 'const options = { passive: true }; options.once = true; addEventListener("pointerdown", fn, options);').retryablePointerCalls === 0, "mutated listener options must fail closed"],
    [analyzeRuntime("mutable-callee.js", 'let on = addEventListener; on("load", fn);').ambiguousEventCalls === 1, "mutable listener aliases must fail closed"],
    [analyzeRuntime("shadowed-callee.js", 'const on = addEventListener; { const on = fn; on("load", fn); }').ambiguousEventCalls === 0, "shadowed callee aliases must not resolve to outer bindings"],
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
if (landing.ambiguousEventCalls !== 0 || menu.ambiguousEventCalls !== 0) fail("PWA event-listener aliases and event names must be provably immutable");
if (landing.pointerCalls !== 1 || landing.retryablePointerCalls !== 1) fail("Install pointer trigger must remain persistent and retryable");
if (hasUnregisterCall("src/app.ts", app)) fail("Landing source must not call unregister in direct, computed, aliased, bare, call, apply, bind, sequence, or Reflect invocation form");

console.log("✅ CSP-001 AST contract passed: Trusted Types registration, retry semantics and unregister prohibition verified.");
