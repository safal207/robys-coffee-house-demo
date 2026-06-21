import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "app.js",
  legalComments: "none"
});

const bundle = readFileSync("app.js");
const revision = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
const html = readFileSync("index.html", "utf8");
const start = html.indexOf('src="app.js');
if (start < 0) throw new Error("index.html does not load app.js");
const open = html.lastIndexOf("<" + "script", start);
const close = html.indexOf("</" + "script>", start);
if (open < 0 || close < 0) throw new Error("Cannot locate app.js script element");
const tag = "<" + `script defer src="app.js?v=${revision}">` + "</" + "script>";
const nextHtml = html.slice(0, open) + tag + html.slice(close + 9);
writeFileSync("index.html", nextHtml);
console.log(`Built app.js and synchronized index.html (${revision}).`);
