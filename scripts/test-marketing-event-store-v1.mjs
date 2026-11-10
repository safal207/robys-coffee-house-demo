import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMarketingEventStore } from "./marketing-event-store-v1.mjs";
import { makeClientFunnelEvent } from "./marketing-attribution-v0.js";

const at=1794310000000;
function fixture(t,options={}) {
 const dir=mkdtempSync(join(tmpdir(),"robys-analytics-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"private","marketing.sqlite");
 const mk=()=>openMarketingEventStore(path,{now:()=>at,...options});
 const store=mk();
 t.after(()=>store.close());
 return {store,mk};
}
function event(name, extra={}, opts={}) {
 return {eventId:"ae_"+randomBytes(16).toString("hex"),
  ...makeClientFunnelEvent(name,extra,{consent:true,campaign:opts.campaign??null,now:opts.now??at})};
}
test("consent must be granted by trusted middleware, not included in payload", t=>{
 const {store}=fixture(t);
 assert.throws(()=>store.append(event("landing_view")),/Consent/);
 assert.deepEqual(store.counts({fromMs:at-1000,toMs:at+1}),[]);
});
test("accepts bounded event once and persists after restart",t=>{
 const {store,mk}=fixture(t);
 const e=event("cart_item_added",{productId:"desserts:cookie",lang:"ru",viewMode:"feed"},
 {campaign:{source:"instagram",campaign:"november",medium:"social"}});
 assert.equal(store.append(e,{authorizedConsent:true}),true);
 assert.equal(store.append(e,{authorizedConsent:true}),false);
 assert.deepEqual(store.counts({fromMs:at-1000,toMs:at+1}),
 [{source:"instagram",event:"cart_item_added",count:1}]);
 const reopened=mk(); t.after(()=>reopened.close());
 assert.deepEqual(reopened.counts({fromMs:at-1000,toMs:at+1}),[
 {source:"instagram",event:"cart_item_added",count:1}]);
});
test("unknown and unaffiliated events remain unknown; payment is backend-only",t=>{
 const {store}=fixture(t);
 store.append(event("checkout_qr_opened"),{authorizedConsent:true});
 assert.deepEqual(store.counts({fromMs:at-1,toMs:at+1}),[
 {source:"unknown",event:"checkout_qr_opened",count:1}]);
 assert.throws(()=>store.append(event("payment_confirmed"),{authorizedConsent:true}),/server-only/);
});
test("refuses oversized, free text, unknown fields and out-of-window events",t=>{
 const {store}=fixture(t);
 const source=event("menu_item_shared",{productId:"desserts:cookie"});
 for(const change of [
  {eventId:"not-an-id"}, {junk:"private@gmail.com"},
  {data:{email:"private@gmail.com"}}, {campaign:{source:"john@example.com"}},
  {occurredAtMs:at-901000}, {occurredAtMs:at+121000},
  {schemaVersion:"wrong"}
 ])assert.throws(()=>store.append({...source,...change},{authorizedConsent:true}));
 assert.deepEqual(store.counts({fromMs:at-1000,toMs:at+1}),[]);
});
test("retention purge removes older records and requires bounded windows",t=>{
 const {store}=fixture(t,{retentionDays:1});
 store.append(event("landing_view",{}, {now:at-5000}),{authorizedConsent:true});
 assert.equal(store.purgeBefore(at-1000),1);
 assert.deepEqual(store.counts({fromMs:at-20000,toMs:at+1}),[]);
 assert.throws(()=>store.counts({fromMs:0,toMs:at}),/Invalid reporting/);
});
