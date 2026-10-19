import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildSync } from "esbuild";

const index = readFileSync("index.html", "utf8");
const heroActions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
const orderCta = heroActions.match(/<a\b[^>]*data-smart-choice-entry[^>]*>[^<]*<\/a>/)?.[0] ?? "";
assert.match(orderCta, /class="button button-primary"/);
assert.match(orderCta, /href="smart-choice\/"/);
assert.match(orderCta, /data-analytics-action="smart_choice_start"/);
assert.match(orderCta, /data-tr="Siparişimi oluştur"/);
assert.match(orderCta, /data-en="Build my order"/);
assert.match(orderCta, /data-ru="Собрать заказ"/);
assert.equal((heroActions.match(/class="button button-primary"/g) ?? []).length, 1);

const primaryCta = heroActions.match(/<a\b[^>]*class="hero-pairing-link"[^>]*>[^<]*<\/a>/)?.[0] ?? "";

assert.match(primaryCta, /href="menu\.html#pairing-offers"/);
assert.match(primaryCta, /data-analytics-action="pairing_click"/);
assert.match(primaryCta, /data-localized/);
assert.match(primaryCta, /data-tr="Kahve \+ tatlı fikirleri →"/);
assert.match(primaryCta, /data-en="Drink \+ dessert ideas →"/);
assert.match(primaryCta, /data-ru="Напиток \+ десерт →"/);
assert.equal(primaryCta.includes("target="), false);
assert.equal(primaryCta.includes("rel="), false);
assert.equal(primaryCta.includes("data-i18n="), false);
// The unchanged analytics input now shares the existing deferred app request.
// Bind the actual delivery bytes and esbuild input graph, not a second script
// tag that would initialize the same handlers twice.
const compiled = buildSync({ entryPoints: ["src/app.ts"], external: ["./choice-help.js*"],
  bundle: true, charset: "utf8", minify: true, format: "iife", target: "es2020", legalComments: "none",
  outfile: "app.js", write: false, metafile: true });
assert.ok(Object.hasOwn(compiled.metafile.inputs, "analytics.js"), "The shipped app must include the analytics source");
const app = readFileSync("app.js");
assert.ok(app.equals(Buffer.from(compiled.outputFiles[0].contents)), "The deferred app must match all current bundled inputs");
const revision = createHash("sha256").update(app).digest("hex").slice(0, 12);
assert.ok(index.includes(`src="app.js?v=${revision}"`));
assert.doesNotMatch(index, /src="analytics\.js(?:\?|\")/, "Analytics must have exactly one delivery path");

console.log("PASS: static pairing CTA and cache revision are bound");
