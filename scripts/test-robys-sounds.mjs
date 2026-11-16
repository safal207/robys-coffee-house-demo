import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {menuCategories} from "../menu-catalog.js";
import {feedProducts} from "../src/menu-feed-model.js";
import {moods,languages,resolveMood,providers,musicStyles,layouts,livingContext} from "../docs/prototypes/coffee-club/sounds-model.mjs";
import {preferenceKey,ttl,defaultLook,readLook,encodeLook,createLookStore} from "../docs/prototypes/coffee-club/sounds-look.mjs";
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
 assert.doesNotMatch(js,/fetch\s*\(|sessionStorage|navigator\.sendBeacon|https?:\/\//);
 assert.equal((js.match(/window\.localStorage/g)??[]).length,1);
 assert.equal((js.match(/lookStore\.save\(/g)??[]).length,1);
 assert.match(js,/q\("save-context"\)\.addEventListener\("click"/);
});

test("explicit music and presentation are independent and all suggestions use catalog IDs",()=>{
 assert.deepEqual(layouts.map(x=>x.id),["classic","reels","gallery","channels"]);
 for(const mood of moods)for(const music of musicStyles)for(const layout of layouts){
  const r=livingContext({mood:mood.id,music:music.id,layout:layout.id},products);
  assert.equal(r.product.id,music.productId??mood.productId);
  assert.ok(existsSync(r.product.image));
  assert.equal(r.shelf.length,5);assert.equal(r.adaptiveMood,mood.adaptive);assert.equal(r.layout,layout.id);
  for(const k of ["retained","deviceAppsRead","musicDataRead","playbackEnabled","providerLinksEnabled","stockVerified"])assert.equal(r[k],false,k);
 }
});
test("unknown choices and unsolicited device data fail closed",()=>{
 const valid={mood:"morning",music:"auto",layout:"classic"};
 for(const patch of [{music:"unknown"},{layout:"unknown"},{mood:"unknown"},{app:"Spotify"},{history:[]},{track:"x"}])assert.equal(livingContext({...valid,...patch},products),null);
 assert.equal(livingContext(valid,[]).product,null);
 assert.equal(livingContext({...valid,music:"rock"},[]).product,null);
});

test("explicit save, reload, reset isolation and forget touch only a dedicated key",()=>{
 const data=new Map([["unrelated","keep"]]);let writes=0;
 const s={getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes++;data.set(k,v)},removeItem:k=>{writes++;data.delete(k)}};
 const now=100000,look={mood:"focus",music:"lofi",layout:"gallery"};
 const store=createLookStore(()=>s,()=>now);
 assert.deepEqual(store.load(),{ok:true,look:null});assert.equal(writes,0);
 assert.equal(store.save(look),true);assert.equal(writes,1);
 assert.deepEqual(createLookStore(()=>s,()=>now+1).load().look,look);
 assert.deepEqual(defaultLook,{mood:"morning",music:"auto",layout:"classic"});
 assert.deepEqual(store.load().look,look);assert.equal(writes,1);
 assert.equal(store.forget(),true);assert.deepEqual(store.load(),{ok:true,look:null});assert.equal(data.get("unrelated"),"keep");
 assert.equal(data.has(preferenceKey),false);assert.equal(writes,2);
});
test("strict saved schema, expiry, clock rollback and denied storage",()=>{
 const now=100000,look={mood:"calm",music:"jazz",layout:"channels"},raw=encodeLook(look,now);
 assert.deepEqual(readLook(raw,now+ttl-1),look);assert.equal(readLook(raw,now+ttl),null);assert.equal(readLook(raw,now-1),null);
 const record=JSON.parse(raw);
 for(const bad of [{...record,email:"x"},{...record,look:{...look,track:"x"}},{...record,look:{...look,layout:"unknown"}},{...record,schema:"future"}])assert.equal(readLook(JSON.stringify(bad),now),null);
 assert.throws(()=>encodeLook({...look,history:[]},now));assert.equal(readLook("{broken",now),null);
 const denied=createLookStore(()=>{throw Error("blocked")},()=>now);
 assert.deepEqual(denied.load(),{ok:false,look:null});assert.equal(denied.save(look),false);assert.equal(denied.forget(),false);
});
