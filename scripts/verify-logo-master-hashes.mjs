import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const config = JSON.parse(readFileSync(path.join(rootDir, "qa/logo-intelligence.json"), "utf8"));
const failures = [];

for (const asset of config.assets) {
  const bytes = readFileSync(path.join(rootDir, asset.path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== asset.sha256) {
    failures.push(`${asset.path}: expected ${asset.sha256}, got ${actual}`);
  } else {
    console.log(`approved logo master: ${asset.id} ${actual}`);
  }
}

if (failures.length) {
  console.error("Approved logo master identity changed. Update the bound SHA only with explicit human design approval.");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
