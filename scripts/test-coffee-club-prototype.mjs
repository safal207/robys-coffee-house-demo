import { test } from "node:test";
import assert from "node:assert/strict";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { createFeedEngagement } from "../src/menu-feed-engagement.js";
import { feedProductUrl } from "../src/menu-feed-navigation.js";
import { createPassport, passportIds, personalSections } from "../docs/prototypes/coffee-club/club-model.mjs";

const products=feedProducts(menuCategories);
const validIds=new Set(products.map(p=>p.id));
const storage=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};};

test("passport uses canonical catalog products and canonical feed links",()=>{
  for(const id of passportIds) {
    assert.ok(validIds.has(id),id);
    const url=new URL(feedProductUrl("https://example.test/site/menu-feed.html",id,"ru"));
    assert.equal(url.searchParams.get("item"),id);
    assert.equal(url.searchParams.get("lang"),"ru");
  }
});
test("reuses existing likes and views; views never award tasting credit",()=>{
  const s=storage(), getStorage=()=>s;
  const menu=createFeedEngagement({validIds,getStorage});
  menu.setLiked(passportIds[0],true);
  menu.recordView(passportIds[1]);
  const club=createFeedEngagement({validIds,getStorage});
  const passport=createPassport(getStorage);
  assert.deepEqual(personalSections(products,club).favorites.map(p=>p.id),[passportIds[0]]);
  assert.deepEqual(personalSections(products,club).seen.map(p=>p.id),[passportIds[1]]);
  assert.equal(passport.count(),0);
  passport.set(passportIds[0],true);
  passport.set(passportIds[0],true);
  assert.equal(createPassport(getStorage).count(),1);
  assert.equal(passport.set("bad",true),false);
  passport.clear();
  assert.equal(createPassport(getStorage).count(),0);
  assert.equal(club.hasLiked(passportIds[0]),true);
  assert.equal(club.hasSeen(passportIds[1]),true);
});
test("blocked storage is session-only, no crash or fake credit",()=>{
  const p=createPassport(()=>{throw new Error("blocked");});
  assert.equal(p.persistent,false);
  assert.equal(p.count(),0);
  p.set(passportIds[0],true);
  assert.equal(p.count(),1);
  p.clear();
  assert.equal(p.count(),0);
});
