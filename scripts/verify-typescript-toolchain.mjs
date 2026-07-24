import { spawnSync } from "node:child_process";

const nativeBinary = "tsc";
const compatibilityBinary = "tsc6";

function run(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.error) {
    throw new Error(`Could not run ${binary}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${binary} exited with ${result.status}.\n${output}`);
  }

  return result.stdout.trim();
}

function majorVersion(value) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Could not parse a semantic version from: ${value}`);
  return Number(match[1]);
}

const nativeVersion = run(nativeBinary, ["--version"]);
const compatibilityVersion = run(compatibilityBinary, ["--version"]);
const typescriptModule = await import("typescript");
const typescriptApi = typescriptModule.default ?? typescriptModule;
const apiVersion = typescriptApi.version;

if (majorVersion(nativeVersion) !== 7) {
  throw new Error(`Expected the default tsc binary to be TypeScript 7, received: ${nativeVersion}`);
}

if (majorVersion(compatibilityVersion) !== 6) {
  throw new Error(`Expected tsc6 to be TypeScript 6, received: ${compatibilityVersion}`);
}

if (majorVersion(apiVersion) !== 6) {
  throw new Error(`Expected import(\"typescript\") to expose the TypeScript 6 API, received: ${apiVersion}`);
}

console.log("TypeScript dual-compiler contract verified.");
console.log(`Default type checker: ${nativeVersion}`);
console.log(`Compatibility checker: ${compatibilityVersion}`);
console.log(`Programmatic build API: TypeScript ${apiVersion}`);
