import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import ts from "typescript";

await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "app.js",
  legalComments: "none"
});

const gallerySource = readFileSync("src/featured-gallery.ts", "utf8");
const galleryBundle = ts.transpileModule(gallerySource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    strict: true,
    removeComments: false
  }
}).outputText;
writeFileSync("featured-gallery.js", galleryBundle);

function revisionFor(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
}

function synchronizeScript(html, fileName, revision) {
  const start = html.indexOf(`src="${fileName}`);
  if (start < 0) throw new Error(`index.html does not load ${fileName}`);
  const open = html.lastIndexOf("<" + "script", start);
  const close = html.indexOf("</" + "script>", start);
  if (open < 0 || close < 0) throw new Error(`Cannot locate ${fileName} script element`);
  const tag = "<" + `script defer src="${fileName}?v=${revision}">` + "</" + "script>";
  return html.slice(0, open) + tag + html.slice(close + 9);
}

const appRevision = revisionFor("app.js");
let html = readFileSync("index.html", "utf8");
html = synchronizeScript(html, "app.js", appRevision);
writeFileSync("index.html", html);
console.log(`Built app.js (${appRevision}) and compiled featured-gallery.js from TypeScript.`);
