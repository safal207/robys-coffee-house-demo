import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ownerCatalogProducts, openOwnerCatalog, validateOwnerPhoto } from "../owner-catalog.mjs";
import { menuCategories } from "../../menu-catalog.js";

const now=Date.parse("2026-11-10T13:00:00Z");
function fixture(t) {
 const dir=mkdtempSync(join(tmpdir(),"robys-owner-draft-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const dbPath=join(dir,"private","counter.sqlite");
 const store=openOwnerCatalog(dbPath,{now:()=>now});
 t.after(()=>store.close());
 return {store,dbPath};
}
function form(entry) {return {...entry.draft};}
test("owner catalog resolves canonical IDs from menu without duplicate, changes do not touch source",t=>{
 const {store}=fixture(t);
 assert(ownerCatalogProducts.length>=60);
 assert.equal(new Set(ownerCatalogProducts.map(x=>x.id)).size,ownerCatalogProducts.length);
 const x=store.list()[0];
 assert.equal(x.revision,0);assert.equal(x.modified,false);
 const source=menuCategories[0].items[0].price;
 store.update({id:x.product.id,expectedRevision:0,actor:"reyhan",content:{...form(x),priceTry:source+10}});
 assert.equal(menuCategories[0].items[0].price,source);
 assert.equal(store.get(x.product.id).draft.priceTry,source+10);
});
test("owner catalog validates localized names, integer TRY and staged image references",t=>{
 const {store}=fixture(t),x=store.list()[0],id=x.product.id;
 for(const val of [
  {...form(x),priceTry:0}, {...form(x),priceTry:1.5},
  {...form(x),priceTry:10000}, {...form(x),nameTr:"<script>"},
  {...form(x),nameRu:"x"}, {...form(x),imageId:"../../etc/passwd"},
  {...form(x),imageId:"p_"+randomBytes(16).toString("hex")},
  {...form(x),extra:"x"}
 ]) assert.throws(()=>store.update({id,expectedRevision:0,actor:"reyhan",content:val}));
 assert.equal(store.get(id).revision,0);
 assert.throws(()=>store.get("nonexistent-product"),/Unknown/);
});
test("history is immutable, rollback restores previous content with new revision; stale editor rejected",t=>{
 const {store}=fixture(t),base=store.list()[0],id=base.product.id;
 const first=store.update({id,expectedRevision:0,actor:"reyhan",
   content:{...form(base),nameTr:"Yeni özel lezzet",priceTry:350}});
 assert.equal(first.revision,1);
 const second=store.update({id,expectedRevision:1,actor:"reyhan",
   content:{...first.draft,priceTry:380}});
 assert.equal(second.revision,2);
 assert.throws(()=>store.update({id,expectedRevision:1,actor:"reyhan",content:form(base)}),/Revision conflict/);
 const audit=store.history(id);
 assert.equal(audit.length,2);
 const restored=store.restore({id,expectedRevision:2,auditId:audit[0].id,actor:"reyhan"});
 assert.equal(restored.revision,3);
 assert.equal(restored.draft.priceTry,350);
 const toOriginal=store.restore({id,expectedRevision:3,auditId:audit[1].id,actor:"reyhan"});
 assert.equal(toOriginal.revision,4);
 assert.equal(toOriginal.draft.priceTry,base.product.price);
 assert.equal(store.history(id)[0].action,"restored");
 assert.throws(()=>store.restore({id,expectedRevision:2,auditId:audit[0].id,actor:"reyhan"}),/Revision conflict/);
});
test("staged images are private, integrity-checked and only accepted formats",async t=>{
 const {store}=fixture(t);
 for(const format of ["png","jpeg","webp"]) {
  const bytes=await sharp({create:{width:128,height:96,channels:4,background:"#fa7654"}})
    .toFormat(format).toBuffer();
  const mime=validateOwnerPhoto(bytes).mime;
  const asset=store.stagePhoto({buffer:bytes,actor:"reyhan"});
  assert.equal(asset.mime,mime);
  assert.deepEqual(store.readPhoto(asset.id).buffer,bytes);
 }
 for(const bad of [Buffer.alloc(128),Buffer.from("<svg><script/></svg>"),Buffer.alloc(4*1024*1024+1)])
  assert.throws(()=>store.stagePhoto({buffer:bad,actor:"reyhan"}));
 assert.throws(()=>store.readPhoto("p_bad"),/Invalid/);
});
test("draft and history persist after reopening the private database",t=>{
 const {store,dbPath}=fixture(t),x=store.list()[0];
 store.update({id:x.product.id,expectedRevision:0,actor:"reyhan",
   content:{...x.draft,priceTry:333}});
 const again=openOwnerCatalog(dbPath,{now:()=>now});
 try{
  assert.equal(again.get(x.product.id).draft.priceTry,333);
  assert.equal(again.history(x.product.id).length,1);
 }finally{again.close();}
});
