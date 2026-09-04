import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

await build({
  entryPoints: ["src/smart-choice/revenue-simulator.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/simulator-v2.js",
  legalComments: "none"
});

function revisionFor(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
}

function synchronizeModuleScript(html, fileName, revision) {
  const pattern = new RegExp(`src="${fileName.replaceAll(".", "\\.")}(?:\\?v=[^"]*)?"`);
  if (!pattern.test(html)) throw new Error(`Simulator HTML does not load ${fileName}`);
  return html.replace(pattern, `src="${fileName}?v=${revision}"`);
}

function synchronizeStylesheet(html, fileName, revision) {
  const pattern = new RegExp(`href="${fileName.replaceAll(".", "\\.")}(?:\\?v=[^"]*)?"`);
  if (!pattern.test(html)) throw new Error(`Simulator HTML does not load ${fileName}`);
  return html.replace(pattern, `href="${fileName}?v=${revision}"`);
}

const scriptRevision = revisionFor("smart-choice/simulator-v2.js");
const cssRevision = revisionFor("smart-choice/simulator.css");
let html = readFileSync("smart-choice/simulator.html", "utf8");
html = synchronizeModuleScript(html, "simulator-v2.js", scriptRevision);
html = synchronizeStylesheet(html, "simulator.css", cssRevision);
writeFileSync("smart-choice/simulator.html", html);

console.log(`Built Smart Choice revenue simulator (${scriptRevision}) and synchronized CSS (${cssRevision}).`);
