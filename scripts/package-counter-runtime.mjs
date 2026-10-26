import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

if (!process.argv[2]) throw new Error("A runtime output directory is required");
const destination = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync("integrity-manifest.json", "utf8"));
const files = new Set([...manifest.files.map(file => file.path), "integrity-manifest.json", "src/order-ticket.js",
  ...["server.mjs", "store.mjs", "auth.mjs", "provision.mjs", "hosted.mjs"].map(file => `counter/${file}`),
  ...["guest.html", "guest.js", "guest.css", "staff.html", "staff.js", "staff.css"].map(file => `counter/public/${file}`)]);
for (const file of files) {
  if (file.startsWith("/") || file.includes("\\") || file.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Unsafe runtime path");
  const target = resolve(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
}
writeFileSync(resolve(destination, "package.json"), '{"type":"module"}\n');
console.log(`Packaged ${files.size} runtime files; no dependencies, credentials or database included.`);
