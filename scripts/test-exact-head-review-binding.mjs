#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/review-ledger.yml", "utf8");
assert.match(workflow, /Reviewed\\s\+commit[\s\S]*\(\[0-9a-f\]\{40\}\)/, "reviewed commit parser must require a full 40-character SHA");
assert.match(workflow, /candidate\s*===\s*head/, "reviewed commit must equal the exact head");
assert.doesNotMatch(workflow, /\{7,40\}/, "short SHA ranges are forbidden");
assert.doesNotMatch(workflow, /head\.startsWith\(candidate\)/, "prefix matching is forbidden");

const head = "2e1f002f4321683db05f14c99e632052024946b7";
const parse = (body) => /Reviewed\s+commit\s*:\s*[*_]*\s*`?([0-9a-f]{40})(?![0-9a-f])`?/i.exec(body)?.[1]?.toLowerCase() ?? null;
assert.equal(parse(`Reviewed commit: ${head}`), head);
assert.equal(parse("Reviewed commit: 2e1f002"), null);
assert.equal(parse(`Reviewed commit: ${head}suffix`), head, "non-hex prose after the full SHA is allowed");
assert.equal(parse(`Reviewed commit: ${head}a`), null, "a 41-character hex prefix is forbidden");
assert.equal(parse(`Reviewed commit: ${head}`) === head, true);

console.log("✅ EXACT-HEAD-001 passed: review evidence requires full SHA equality.");
