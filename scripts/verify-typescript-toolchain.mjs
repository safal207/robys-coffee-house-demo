import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
assert.equal(pkg.devDependencies["@typescript/native"], "npm:typescript@7.0.2");
assert.equal(pkg.devDependencies.typescript, "npm:@typescript/typescript6@6.0.2");
assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
assert.equal(lock.packages["node_modules/@typescript/native"].version, "7.0.2");
assert.equal(lock.packages["node_modules/typescript"].version, "6.0.2");
assert.equal(lock.packages["node_modules/typescript"].name, "@typescript/typescript6");

const bin = name => resolve(root, "node_modules", ".bin", process.platform === "win32" ? name + ".cmd" : name);
function invoke(name) {
  const result = spawnSync(bin(name), ["--version"], {
    cwd: root, encoding: "utf8", shell: process.platform === "win32"
  });
  if (result.error || result.status !== 0) throw new Error(
    `${name} did not execute: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout.trim();
}
assert.equal(invoke("tsc"), "Version 7.0.2", "Native TS7 must own the primary CLI");
assert.match(invoke("tsc6"), /^Version 6\./, "Compatibility TS6 must have an independent CLI");

const module = await import("typescript");
const ts = module.default ?? module;
assert.match(ts.version, /^6\./, "Programmatic compiler API must remain on TypeScript 6");
assert.equal(typeof ts.transpileModule, "function");
assert.equal(typeof ts.createSourceFile, "function");
const output = ts.transpileModule("export const value: number = 2;", { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
assert.ok(output.outputText.includes("export const value = 2"), "Build API must actually transpile TypeScript");
console.log(JSON.stringify({ checker: "7.0.2", compatCli: invoke("tsc6"), buildApi: ts.version, preservedEmit: true }));
