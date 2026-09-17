import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const SERVICE_WORKER_CORE = "sw-core-v64.js";

// The entry worker retains the media/Android repair handlers. Cache revisions
// live in its imported core; build and contracts must inspect that same pair.
export function readServiceWorkerSources(root = process.cwd()) {
  const directory = root instanceof URL ? fileURLToPath(root) : root;
  const wrapper = readFileSync(resolve(directory, "sw.js"), "utf8");
  const ast = ts.createSourceFile("sw.js", wrapper, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const importReferences = [];
  function visit(node) {
    if ((ts.isIdentifier(node) && node.text === "importScripts") ||
        (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) &&
         node.argumentExpression.text === "importScripts")) {
      importReferences.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const reference = importReferences[0];
  const call = reference?.parent;
  const statement = call?.parent;
  const args = call && ts.isCallExpression(call) ? call.arguments : [];
  // Check the entire AST: a second import in a branch, function, or callback
  // would load a runtime that the fixed wrapper/core source pair cannot scan.
  if (ast.parseDiagnostics.length || importReferences.length !== 1 ||
      !ts.isIdentifier(reference) || !ts.isCallExpression(call) || call.expression !== reference ||
      !ts.isExpressionStatement(statement) || statement.parent !== ast || args.length !== 1 ||
      !ts.isStringLiteral(args[0]) || args[0].text !== `./${SERVICE_WORKER_CORE}`) {
    throw new Error(`Service worker must import exactly the local core ./${SERVICE_WORKER_CORE}`);
  }
  const corePath = resolve(directory, SERVICE_WORKER_CORE);
  return { wrapper, core: readFileSync(corePath, "utf8"), corePath };
}

export function readServiceWorkerSource(root = process.cwd()) {
  const { wrapper, core } = readServiceWorkerSources(root);
  return `${wrapper}\n${core}`;
}
