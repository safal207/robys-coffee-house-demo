import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({entryPoints:['src/order-store.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2020'});
const domain = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {recommendSmartChoice,SMART_CHOICE_CATALOG,createInitialCart,calculateCart,linesFromChoice,createOrderStore,suggestOrderAddition} = domain;
const memory=()=>{const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const parties={one:1,two:2,three:3,four:4};
const coverage={};let selections=0;
for(const [partySize,quantity] of Object.entries(parties)) {
 coverage[partySize]={ok:0,noMatch:0};
 for(const locale of ['tr','en','ru']) for(const intent of ['coffee','breakfast','snack','dessert','refresh'])
 for(const temperature of ['hot','cold','any']) for(const taste of ['sweet','neutral','any']) for(const maxMinor of [25000,40000,60000,120000]) {
  const result=recommendSmartChoice({intent,temperature,taste,partySize,budget:{maxMinor},locale});
  if(result.status==='no-match'){coverage[partySize].noMatch++;continue;}
  assert.equal(result.status,'ok');coverage[partySize].ok++;
  assert.ok(result.top.priceMinor<=maxMinor,'Main recommendation must fit the total group budget');
  for(const recommendation of [result.top,result.economy,result.premium].filter(Boolean)) {
   const candidate=SMART_CHOICE_CATALOG.combos.find(item=>item.id===recommendation.candidateId);
   assert.equal(recommendation.quantity,quantity);
   assert.equal(recommendation.priceMinor,candidate.priceMinor*quantity);
   assert.deepEqual(recommendation.components,candidate.components.map(item=>({...item,quantity:item.quantity*quantity})));
   const state={...createInitialCart(candidate.id),quantity};
   const calculation=calculateCart(state,partySize);
   assert.equal(calculation.totalMinor,recommendation.priceMinor);
   const storage=memory(),order=createOrderStore(storage);
   order.addMany(linesFromChoice(state,partySize));
   assert.equal(order.summary().totalMinor,recommendation.priceMinor,'Recommendation, editor and common order must agree');
   assert.deepEqual(createOrderStore(storage).get().lines,order.get().lines,'Full-page navigation/reload must keep every portion');
   selections++;
  }
 }
 for(const temperature of ['hot','cold']) {
  const result=recommendSmartChoice({intent:'coffee',temperature,taste:'neutral',partySize,budget:{maxMinor:120000},locale:'ru'});
  assert.equal(result.status,'ok',`${partySize} ${temperature} coffee must have a real production-catalog path`);
 }
}
for (const partySize of Object.keys(parties)) {
 const result=recommendSmartChoice({intent:'coffee',temperature:'cold',taste:'neutral',partySize,budget:{maxMinor:120000},locale:'ru'});
 assert.ok(!result.top.components.some(line=>line.itemId.startsWith('desserts--')), 'A coffee need must not lead with an unrequested dessert');
}
const three={...createInitialCart('single-cold-coffee--iced-caffe-latte'),quantity:3};
const order=createOrderStore(memory());order.addMany(linesFromChoice(three,'three'));
assert.deepEqual(order.summary(),{quantity:3,totalMinor:54000});
const extra=suggestOrderAddition(order.get().lines);assert.ok(extra);
const unchanged=order.get(); // Declining is not a cart mutation.
assert.deepEqual(order.get(),unchanged);
order.add(extra.id);assert.deepEqual(order.summary(),{quantity:4,totalMinor:57000});
assert.equal(suggestOrderAddition(order.get().lines),undefined,'Do not offer a second dessert');
order.setQuantity(extra.id,0);assert.equal(order.summary().totalMinor,54000);
order.undoRemoval();assert.equal(order.summary().totalMinor,57000);
const groupSet={...createInitialCart('combo-iced-san-sebastian'),quantity:3,bumpDecision:'accepted'};
assert.equal(calculateCart(groupSet,'three').totalMinor,114000,'One optional macaron is not multiplied by guest count');
const bumped=createOrderStore(memory());bumped.addMany(linesFromChoice(groupSet,'three'));
assert.equal(bumped.summary().totalMinor,114000);
const limited=createOrderStore(memory());limited.add('cold-coffee:iced-caffe-latte',98);
const before=limited.get();assert.throws(()=>limited.addMany(linesFromChoice(groupSet,'three')));
assert.deepEqual(limited.get(),before,'A group addition must succeed completely or leave every line unchanged');
for(const quantity of [0,-1,1.5,100,NaN]) assert.throws(()=>linesFromChoice({...three,quantity},'three'));
console.log(JSON.stringify({suite:'guest-journey-production-catalog',inputCases:2160,verifiedSelections:selections,coverage,exactExamples:['3 iced lattes = 540 TRY','+ 1 optional macaron = 570 TRY'],passed:true},null,2));
