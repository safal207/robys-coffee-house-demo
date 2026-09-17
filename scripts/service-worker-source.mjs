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
  const imports = ast.statements.filter((statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    statement.expression.expression.text === "importScripts"
  );
  const args = imports[0]?.expression.arguments;
  if (ast.parseDiagnostics.length || imports.length !== 1 || args.length !== 1 ||
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
