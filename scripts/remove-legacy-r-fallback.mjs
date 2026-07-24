#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const files = ["index.html", "menu.html", "discover.html"];
const legacy = '<span class="brand-mark">R</span>';
let removed = 0;

for (const path of files) {
  const before = readFileSync(path, "utf8");
  const occurrences = before.split(legacy).length - 1;
  const after = before.replaceAll(legacy, "");
  if (occurrences > 0) {
    writeFileSync(path, after, "utf8");
    removed += occurrences;
  }
}

if (removed < 4) {
  throw new Error(`[LEGACY-R-001] Expected at least 4 hidden R fallbacks, removed ${removed}`);
}

for (const path of files) {
  const source = readFileSync(path, "utf8");
  if (source.includes(legacy)) {
    throw new Error(`[LEGACY-R-001] ${path} still contains the legacy R fallback`);
  }
}

console.log(`✅ LEGACY-R-001 removed ${removed} hidden R fallbacks from production HTML.`);
