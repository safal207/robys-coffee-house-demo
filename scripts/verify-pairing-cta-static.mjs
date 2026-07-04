import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync("index.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}(?:="([^"]*)")?`))?.[1] ?? null;
}

function hasClass(tag, token) {
  const classes = attribute(tag, "class")?.split(/\s+/) ?? [];
  return classes.includes(token);
}

const heroActions = index.match(/<div\b[^>]*class="[^"]*\bhero-actions\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
const anchors = [...heroActions.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
const primaryCta = anchors.find((tag) => hasClass(tag, "button-primary")) ?? "";

assert.ok(primaryCta, "Hero primary CTA is missing");
assert.equal(attribute(primaryCta, "href"), "menu.html#pairing-offers");
assert.equal(attribute(primaryCta, "data-analytics-action"), "pairing_click");
assert.match(primaryCta, /\bdata-localized(?:\s|>)/);
assert.equal(attribute(primaryCta, "data-tr"), "Bugünün Eşleşmesini Gör");
assert.equal(attribute(primaryCta, "data-en"), "See Today's Pairing");
assert.equal(attribute(primaryCta, "data-ru"), "Смотреть сочетание дня");
assert.equal(attribute(primaryCta, "target"), null);
assert.equal(attribute(primaryCta, "rel"), null);
assert.equal(attribute(primaryCta, "data-i18n"), null);

const analyticsSrc = index.match(/<script\b[^>]*src="(analytics\.js\?v=[^"]+)"[^>]*><\/script>/)?.[1];
assert.ok(analyticsSrc, "Versioned analytics script is missing");
assert.match(analyticsSrc, /^analytics\.js\?v=pairing-cta-[a-z0-9-]+$/i);
assert.ok(serviceWorker.includes(`"./${analyticsSrc}"`), "Service worker must precache the exact analytics revision");
assert.match(serviceWorker, /url\.pathname\.endsWith\("\/analytics\.js"\)/);

console.log("PASS: static pairing CTA, localization metadata, and exact analytics cache revision are bound");
