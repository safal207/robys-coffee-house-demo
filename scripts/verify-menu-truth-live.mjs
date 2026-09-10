import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readVerifiedMenuSource } from "./menu-runtime-source.mjs";

const poster = readFileSync("pairing-posters.js", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const menuSource = readVerifiedMenuSource();
const posterRevision = createHash("sha256").update(poster).digest("hex").slice(0, 12);

assert.doesNotMatch(poster, /\boldPrice\b/, "Poster runtime must not carry an unsupported historical price");
assert.doesNotMatch(poster, /PAIR OF THE DAY/i, "Poster runtime must not make an unowned time-sensitive claim");
assert.match(poster, /TASTE JOURNEY/, "Poster kicker must use the existing neutral Taste Journey identity");
assert.match(menuSource, /searchTerm\.trim\(\) && activeCategory !== "all"[\s\S]*activeCategory = "all"[\s\S]*syncCategoryHash\("all"\)[\s\S]*renderCategoryNav\(\)/, "A non-empty search must expand from a selected category to the full menu");
assert.match(menuHtml, new RegExp(`pairing-posters\\.js\\?v=${posterRevision}`), "menu.html must bind the poster runtime to its exact content revision");
assert.match(serviceWorker, new RegExp(`\"\\./pairing-posters\\.js\\?v=${posterRevision}\"`), "Service worker must precache the exact poster revision");
assert.match(serviceWorker, /url\.pathname\.endsWith\("\/pairing-posters\.js"\)/, "Poster runtime must use exact-revision cache matching");
assert.match(serviceWorker, new RegExp(`robys-offline-v64-20260910-menu-truth-${posterRevision}-`), "Cache version must invalidate clients when this repair lands");

console.log(`✅ MENU-TRUTH-LIVE-001: global search, neutral pairing claims, and exact poster cache binding verified at ${posterRevision}.`);
