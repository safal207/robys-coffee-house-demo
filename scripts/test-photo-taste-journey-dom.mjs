import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source=readFileSync(new URL("../pairing-taste-journey.js",import.meta.url),"utf8");
class Element {
  constructor(tag="div") {
    this.tag=tag;this.children=[];this.attrs={};this.handlers={};this.dataset={};
    this.className="";this.textContent="";this.hidden=false;
    this.classList={add(){},remove(){}};
  }
  append(...nodes){this.children.push(...nodes);}
  insertBefore(node){this.children.push(node);}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key]??null;}
  addEventListener(key,callback){this.handlers[key]=callback;}
  click(){return this.handlers.click?.();}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  remove(){this.removed=true;}
}
function createScenario({lang="ru",deny=false,share,clipboard}={}){
  const local=new Map(),session=new Map(),shareCalls=[];
  const localStorage={
    getItem(key){if(deny)throw Error("storage denied");return local.get(key)??null;},
    setItem(key,value){if(deny)throw Error("storage denied");local.set(key,String(value));}
  };
  const sessionStorage={
    getItem(key){return session.get(key)??null;},
    setItem(key,value){session.set(key,String(value));}
  };
  const choose=new Element("button"),mark=new Element("button"),actions=new Element();
  const panel=new Element("section");panel.dataset.pairingId="cool-lime-macaron";
  panel.querySelector=selector=>({
    ".pairing-discovery-choose":choose,
    ".pairing-discovery-mark":mark,
    ".pairing-discovery-actions":actions,
    ".pairing-discovery-heading h3":{textContent:"Cool Lime + Macaron"}
  })[selector]??null;
  const root={querySelectorAll(selector){return selector===".pairing-discovery-panel"?[panel]:[];}};
  const document={
    head:{append(){}},
    documentElement:{lang},
    createElement:tag=>new Element(tag),
    querySelector:selector=>selector==="#menu-root"?root:null
  };
  const navigator={};
  if(share)navigator.share=async payload=>{shareCalls.push(payload);return share(payload);};
  if(clipboard)navigator.clipboard={writeText:clipboard};
  runInNewContext(source,{
    document,navigator,localStorage,sessionStorage,
    location:{href:"https://example.test/robys/menu-grid.html",search:""},
    URL,URLSearchParams,Date,
    MutationObserver:class{observe(){}},
    requestAnimationFrame(callback){callback();}
  });
  const journey=panel.children.find(x=>x.className==="pairing-journey");
  assert.ok(journey,"Existing pairing panel must receive progressive enhancement");
  function action(key) {
    const visit=node=>{
      if(node?.dataset?.tasteAction===key)return node;
      for(const child of node?.children??[]) {
        const found=visit(child);if(found)return found;
      }
      return null;
    };
    const found=visit(journey);assert.ok(found,key+" action exists");return found;
  }
  function trace(){
    return JSON.parse(session.get("robys-taste-path-trace.v1")||"[]").map(item=>item.event);
  }
  return {panel,journey,choose,mark,local,trace,action,shareCalls};
}

for(const deny of [false,true])test("personal taste progression, reversible like, skip and order with storage blocked="+deny,()=>{
  const s=createScenario({deny});
  assert.ok(s.journey.children[0].children[0].textContent.includes("1/2"));
  assert.ok(s.journey.children[0].children[1].textContent.endsWith("1"));
  assert.equal(s.mark.removed,true);
  const like=s.action("like");
  assert.equal(like.getAttribute("aria-pressed"),"false");
  like.click();assert.equal(like.getAttribute("aria-pressed"),"true");
  like.click();assert.equal(like.getAttribute("aria-pressed"),"false");
  s.action("skip").click();
  assert.equal(s.journey.children[2].children[0].textContent,"Хочешь попробовать эту пару?");
  s.choose.click();
  assert.deepEqual(s.trace(),["taste_open","taste_like","taste_unlike",
    "pair_share_skipped","pair_offer_reached","pair_offer_choice"]);
  assert.equal(s.local.size,deny?0:3);
});

test("successful native share includes only the whitelisted pairing and moves to offer",async()=>{
  const s=createScenario({lang:"en",share:async()=>{}});
  await s.action("share").click();
  assert.equal(s.shareCalls.length,1);
  const url=new URL(s.shareCalls[0].url);
  assert.equal(url.searchParams.get("pair"),"cool-lime-macaron");
  assert.equal(url.searchParams.get("lang"),"en");
  assert.deepEqual([...url.searchParams.keys()].sort(),["lang","pair","view"]);
  assert.equal(s.journey.children[2].children[0].textContent,"Want to try this pairing?");
  assert.ok(s.trace().includes("pair_share_sheet_completed"));
});

test("cancelled native share stays at the optional share step",async()=>{
  const s=createScenario({share:async()=>{const e=Error("cancel");e.name="AbortError";throw e;}});
  await s.action("share").click();
  assert.equal(s.journey.children[2].children[0].textContent,"С кем бы ты попробовал этот вкус?");
  assert.ok(s.trace().includes("pair_share_cancelled"));
  assert.ok(!s.trace().includes("pair_offer_reached"));
});

test("blocked clipboard displays selectable URL and still permits skip",async()=>{
  const s=createScenario({clipboard:async()=>{throw Error("blocked");}});
  await s.action("share").click();
  const controls=s.journey.children[2];
  const fallback=controls.children.find(n=>n.className==="pairing-journey-fallback");
  assert.equal(fallback.hidden,false);
  assert.equal(fallback.children[0].readOnly,true);
  assert.ok(fallback.children[0].value.includes("pair=cool-lime-macaron"));
  assert.ok(s.trace().includes("pair_link_fallback"));
  s.action("skip").click();
  assert.equal(controls.children[0].textContent,"Хочешь попробовать эту пару?");
});
