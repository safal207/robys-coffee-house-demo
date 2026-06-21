import { readFileSync } from "node:fs";

const bundle = readFileSync("app.js", "utf8");
const html = readFileSync("index.html", "utf8");

if (!bundle.trim()) {
  throw new Error("app.js is empty");
}

if (/^\s*(?:import|export)\s/m.test(bundle)) {
  throw new Error("app.js contains ESM import/export syntax but the declared output format is IIFE");
}

const appScript = html.match(/<script\b[^>]*\bsrc=["']app\.js(?:\?[^"']*)?["'][^>]*><\/script>/i)?.[0];
if (!appScript) {
  throw new Error("index.html does not load app.js");
}

if (/\btype=["']module["']/i.test(appScript)) {
  throw new Error("The IIFE app.js must not be loaded as type=module");
}

if (!/\bdefer(?:\s|>|=)/i.test(appScript)) {
  throw new Error("The classic app.js script must use defer to preserve module-like DOM timing");
}

const forbiddenLegacyRuntime = [
  "#experience",
  ".story-section",
  "#my-robys",
  ".mobile-dock",
  "#coffee-matcher"
];

for (const marker of forbiddenLegacyRuntime) {
  if (bundle.includes(marker)) {
    throw new Error(`app.js contains forbidden legacy runtime marker: ${marker}`);
  }
}

console.log("Verified: app.js is a classic deferred IIFE bundle with no live ESM imports or legacy runtime sections.");
