import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {menuCategories} from "../menu-catalog.js";
import {feedProducts} from "../src/menu-feed-model.js";
import {moods,languages,resolveMood,providers} from "../docs/prototypes/coffee-club/sounds-model.mjs";
const products=feedProducts(menuCategories);
test("all mood pairings reuse canonical products and available local images",()=>{
 assert.equal(moods.length,5);assert.deepEqual(languages,["tr","en","ru"]);
 for(const mood of moods){const result=resolveMood(mood.id,products);assert.ok(result.product,mood.productId);assert.ok(existsSync(result.product.image),result.product.image);assert.equal(mood.name.length,3);assert.equal(mood.description.length,3);assert.equal(result.stockVerified,false);assert.equal(result.playbackEnabled,false);assert.equal(result.providerLinksEnabled,false);}
 assert.equal(resolveMood("unknown",products),null);assert.equal(resolveMood("morning",[]).product,null);
});
test("static preview has no provider connections or playable media",()=>{
 const html=readFileSync("docs/prototypes/coffee-club/sounds.html","utf8"),js=readFileSync("docs/prototypes/coffee-club/sounds.js","utf8");
 assert.match(html,/media-src 'none'/);assert.match(html,/connect-src 'none'/);assert.match(html,/frame-src 'none'/);
 assert.equal((html.match(/<button type="button" disabled>/g)??[]).length,providers.length);
 assert.doesNotMatch(html,/<(?:audio|video|iframe)\b|autoplay/i);
 assert.doesNotMatch(js,/fetch\s*\(|localStorage|sessionStorage|navigator\.sendBeacon|https?:\/\//);
});
