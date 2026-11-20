import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SMART_CHOICE_CATALOG } from "../smart-choice/catalog.js";
import { MOOD_GRAPH_VERSION, PAIR_RULES, recommendMoodPair } from "../smart-choice/mood-graph-domain.js";

const hot = {color:"green",mood:"fresh",weather:"hot"};
const cool = {color:"amber",mood:"comfort",weather:"rain"};

test("graph recommends eligible menu items and preserves exact menu prices, without discounts", () => {
  for(const input of [hot,cool,{color:"blue",mood:"surprise",weather:"cool"},{color:"coral",mood:"energy",weather:"hot"}]) {
    const offer = recommendMoodPair(input);
    assert.ok(offer,JSON.stringify(input));
    const price = offer.drink.priceMinor + offer.snack.priceMinor;
    assert.equal(offer.totalMinor,price);
    assert.equal(offer.trace.priceMode,"sum-of-public-menu-prices");
    assert.equal(offer.trace.outcome,"suggestion-only");
    assert.equal(offer.trace.graphVersion,MOOD_GRAPH_VERSION);
    assert.equal(offer.trace.catalogVersion,SMART_CHOICE_CATALOG.version);
    for(const part of [offer.drink,offer.snack]) {
      assert.equal(part.availability,"available");
      assert.equal(part.sourceStatus,"confirmed");
      assert.ok(SMART_CHOICE_CATALOG.items.some(item=>item.id===part.id && item.priceMinor===part.priceMinor));
    }
    assert.deepEqual(offer.trace.selectedIds,[offer.drink.id,offer.snack.id]);
  }
});

test("rules remain deterministic, weather and mood affect rank, never use fabricated items", () => {
  const repeat = recommendMoodPair(hot);
  assert.equal(recommendMoodPair(hot).id,repeat.id);
  assert.notEqual(recommendMoodPair(cool).id,repeat.id);
  for(const rule of PAIR_RULES) {
    assert.ok(SMART_CHOICE_CATALOG.items.some(item=>item.id===rule.drink),rule.drink);
    assert.ok(SMART_CHOICE_CATALOG.items.some(item=>item.id===rule.snack),rule.snack);
  }
  const options = [...new Set(Array.from({length:PAIR_RULES.length},(_,i)=>recommendMoodPair({...hot,offset:i})?.id))];
  assert.equal(options.length,PAIR_RULES.length);
});

test("tried combinations are excluded and all-tried is a clean, honest empty state", () => {
  const first = recommendMoodPair(hot);
  assert.notEqual(recommendMoodPair({...hot,tried:[first.id]}).id,first.id);
  assert.equal(recommendMoodPair({...hot,tried:PAIR_RULES.map(r=>r.id)}),null);
});

test("invalid input, unconfirmed and unavailable products are never recommended", () => {
  assert.equal(recommendMoodPair({color:"personality",mood:"fresh",weather:"hot"}),null);
  assert.equal(recommendMoodPair({...hot,offset:-1}),null);
  const unavailable = {...SMART_CHOICE_CATALOG,items:SMART_CHOICE_CATALOG.items.map(item=>({...item,availability:"unavailable"}))};
  assert.equal(recommendMoodPair(hot,unavailable),null);
  const unconfirmed = {...SMART_CHOICE_CATALOG,items:SMART_CHOICE_CATALOG.items.map(item=>({...item,sourceStatus:"provisional"}))};
  assert.equal(recommendMoodPair(hot,unconfirmed),null);
});

test("photo and list menu both expose the same localized mood-picker entry", () => {
  for(const file of ["menu.html","menu-grid.html"]){
    const html=readFileSync(file,"utf8");
    assert.match(html,/class="menu-family-link mood-pair-entry" href="smart-choice\/#quick"/);
    assert.match(html,/<span lang="ru">Цвет \+ настроение<\/span>/);
    assert.match(html,/<span lang="tr">Renk \+ ruh hali<\/span>/);
  }
});
