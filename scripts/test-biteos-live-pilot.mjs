import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,realpathSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createSession} from "./biteos-pilot-contract.mjs";
import {wrapEngagement} from "./biteos-pilot-browser.mjs";
import {createFeedEngagement} from "../src/menu-feed-engagement.js";
import {patchFeed} from "./biteos-pilot-patch.mjs";
import {createPilotServer,readPilotAsset} from "./biteos-live-pilot.mjs";
const id="hot-coffee:espresso";
test("real feed model records only qualified post-opt-in events",()=>{
 const model=createFeedEngagement({validIds:[id],getStorage:()=>{throw Error("blocked")}});
 let current=null;
 const pilot={current:()=>current,record:(action,id,area,stamp)=>{if(stamp&&stamp===current)stamp.record(action,id,area)}};
 const wrapped=wrapEngagement(model,pilot);
 wrapped.setLiked(id,true);
 assert.equal(current,null);
 current=createSession({consent:true,sessionId:"a".repeat(32),href:"https://example.test/?utm_source=instagram&utm_medium=social&utm_campaign=story",catalogIds:[id]});
 wrapped.setLiked(id,true);wrapped.setLiked(id,false);wrapped.setLiked(id,true);
 wrapped.recordView(id);wrapped.recordView(id);wrapped.recordView("no");
 assert.deepEqual(current.export().map(e=>e.action),["landing","product_unlike","product_like","product_view"]);
 current.withdraw();wrapped.setLiked(id,false);assert.deepEqual(current.export(),[]);
});
test("source hooks unique and actual in-memory bundle served only on local origin",{skip:process.platform!=="linux"},async()=>{
 const original=readFileSync("src/menu-feed.js","utf8"),patch=patchFeed(original);
 assert.ok(patch.includes("wrapEngagement"));assert.ok(patch.includes('record("cart_add"'));assert.throws(()=>patchFeed(original.replace("const engagement =","const different =")));
 const server=createPilotServer();await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{
  const base="http://127.0.0.1:"+server.address().port;
  const page=await fetch(base+"/menu-feed.html");assert.equal(page.status,200);
  const bundle=await fetch(base+"/menu-feed.js");assert.equal(bundle.status,200);assert.match(await bundle.text(),/robys.engagement.v1/);
  for(const p of ["/scripts/biteos-pilot-contract.mjs","/counter/data/counter.sqlite","/api/counter/health","/sw.js"])assert.equal((await fetch(base+p)).status,404);
  assert.equal((await fetch(base+"/menu-feed.html",{method:"POST"})).status,403);
  assert.equal((await fetch(base+"/menu-feed.html")).headers.get("cache-control"),"no-store");
  assert.equal(readFileSync("src/menu-feed.js","utf8"),original);
 }finally{await new Promise(ok=>server.close(ok))}
});

test("asset reads use one descriptor and reject links, directories and root escape",{skip:process.platform!=="linux"},async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"robys-pilot-asset-")));
 try{
  const root=join(dir,"public"),outside=join(dir,"private"),inside=join(root,"actual");
  mkdirSync(root);mkdirSync(outside);mkdirSync(inside);
  writeFileSync(join(root,"menu.html"),"public");writeFileSync(join(outside,"secret.txt"),"private");writeFileSync(join(inside,"photo.txt"),"photo");
  symlinkSync(join(outside,"secret.txt"),join(root,"file-link.txt"));
  symlinkSync(outside,join(root,"outside-link"));
  symlinkSync(inside,join(root,"inside-link"));
  assert.equal((await readPilotAsset(root,"menu.html")).toString(),"public");
  for(const name of ["file-link.txt","outside-link/secret.txt","inside-link/photo.txt","actual","../private/secret.txt","missing.txt"]){
   await assert.rejects(()=>readPilotAsset(root,name),name);
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
});
