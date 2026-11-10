import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import sharp from "sharp";
import { createCounterServer, provisionOwner } from "../server.mjs";
import { ownerCatalogProducts } from "../owner-catalog.mjs";

const randomPassword=()=>randomBytes(32).toString("base64url");
async function fixture(t,options={}) {
 const dir=mkdtempSync(resolve(tmpdir(),"robys-owner-menu-http-"));
 const rootDir=resolve(dir,"public"),dbPath=resolve(dir,"private","counter.sqlite");
 mkdirSync(rootDir,{recursive:true});
 writeFileSync(resolve(rootDir,"index.html"),"<!doctype html><title>Test</title>");
 writeFileSync(resolve(rootDir,"integrity-manifest.json"),JSON.stringify({files:[{path:"index.html"}]}));
 const server=createCounterServer({dbPath,rootDir,...options});
 t.after(async()=>{
   await new Promise(resolveClose=>server.close(resolveClose));
   rmSync(dir,{recursive:true,force:true});
 });
 server.listen(0,"127.0.0.1");
 await once(server,"listening");
 const origin="http://127.0.0.1:"+server.address().port;
 const password=randomPassword();
 await provisionOwner({dbPath,username:"reyhan",password});
 async function post(path,values,cookie="",extra={}) {
  return fetch(origin+path,{method:"POST",redirect:"manual",body:new URLSearchParams(values),
    headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...extra}});
 }
 async function login() {
  const res=await post("/owner/login",{username:"reyhan",password});
  assert.equal(res.status,303);
  return res.headers.get("set-cookie").split(";")[0];
 }
 const get=(path,cookie="")=>fetch(origin+path,{headers:cookie?{Cookie:cookie}:{}});
 const product=ownerCatalogProducts[0];
 const itemPath="/owner/catalog/item?id="+encodeURIComponent(product.id)+"&lang=ru";
 return {origin,post,login,get,product,itemPath};
}
function csrf(html) {
 const token=html.match(/name="csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
 assert(token);return token;
}
test("unauthenticated catalog requests use shared abuse throttling", async t=>{
 const f=await fixture(t,{rateLimits:{api:{max:2}}});
 const path="/owner/catalog?lang=ru";
 assert.equal((await f.get(path)).status,401);
 assert.equal((await f.get(path)).status,401);
 const throttled=await f.get(path);
 assert.equal(throttled.status,429);
 assert.equal(throttled.headers.get("retry-after"),"60");
});

test("owner menu requires isolated login; staff cookies cannot read drafts",async t=>{
 const f=await fixture(t);
 assert.equal((await f.get("/owner/catalog?lang=ru")).status,401);
 assert.equal((await f.get(f.itemPath)).status,401);
 assert.equal((await f.get("/owner/catalog/media/p_"+randomBytes(16).toString("hex"))).status,401);
 const cookie=await f.login();
 const listing=await f.get("/owner/catalog?lang=ru",cookie);
 assert.equal(listing.status,200);
 const page=await listing.text();
 assert.match(page,/Редактор меню/);
 assert.match(page,/не влияют на меню гостей/);
 assert(!page.includes("<script"));
 assert.match(listing.headers.get("content-security-policy"),/img-src 'self'/);
 assert.match(listing.headers.get("content-security-policy"),/default-src 'none'/);
 assert.equal(listing.headers.get("cache-control"),"no-store");
 const item=await (await f.get(f.itemPath,cookie)).text();
 assert.match(item,/Сохранить черновик/);
 assert.match(item,/Загрузить фото/);
});
test("owner edits all translations and price, then restores without touching canonical price",async t=>{
 const f=await fixture(t),cookie=await f.login();
 const first=await (await f.get(f.itemPath,cookie)).text();
 const expected=f.product.price;
 const params={
  csrf:csrf(first),id:f.product.id,revision:"0",lang:"ru",
  nameTr:"Özel Kahve",nameEn:"Special Coffee",nameRu:"Особый кофе",
  priceTry:String(expected+40),imageId:""
 };
 const write=await f.post("/owner/catalog/save",params,cookie);
 assert.equal(write.status,303);
 assert.equal(write.headers.get("location"),f.itemPath);
 const changed=await (await f.get(f.itemPath,cookie)).text();
 assert.match(changed,/Особый кофе/);
 assert.match(changed,RegExp(String(expected+40)));
 assert.match(changed,/v1/);
 assert.equal(f.product.price,expected);
 const conflict=await f.post("/owner/catalog/save",params,cookie);
 assert.equal(conflict.status,409);
 const restore=await f.post("/owner/catalog/restore",{
  csrf:csrf(changed),id:f.product.id,revision:"1",lang:"ru",auditId:"1"
 },cookie);
 assert.equal(restore.status,303);
 const reverted=await (await f.get(f.itemPath,cookie)).text();
 assert.match(reverted,RegExp(String(expected)));
 assert.match(reverted,/v2/);
});
test("photo upload stays private, typed and immutable, rejects fake uploads",async t=>{
 const f=await fixture(t),cookie=await f.login();
 const page=await (await f.get(f.itemPath,cookie)).text();
 const token=csrf(page);
 const image=await sharp({create:{width:128,height:128,channels:4,background:"#cb7564"}})
   .png().toBuffer();
 const form=new FormData();
 for(const [k,v] of Object.entries({csrf:token,id:f.product.id,revision:"0",lang:"ru"}))
  form.set(k,v);
 form.set("photo",new Blob([image],{type:"image/png"}),"coffee.png");
 const upload=await fetch(f.origin+"/owner/catalog/upload",{
  method:"POST",redirect:"manual",headers:{Origin:f.origin,Cookie:cookie},body:form});
 assert.equal(upload.status,303);
 const item=await (await f.get(f.itemPath,cookie)).text();
 const asset=item.match(/\/owner\/catalog\/media\/(p_[a-f0-9]{32})/)?.[1];
 assert(asset);
 assert.equal((await f.get("/owner/catalog/media/"+asset)).status,401);
 const preview=await f.get("/owner/catalog/media/"+asset,cookie);
 assert.equal(preview.status,200);
 assert.equal(preview.headers.get("content-type"),"image/webp");
 assert.equal(preview.headers.get("cache-control"),"no-store");
 const clean=Buffer.from(await preview.arrayBuffer());
 assert.notDeepEqual(clean,image,"raw upload must never be exposed");
 const meta=await sharp(clean).metadata();
 assert.equal(meta.format,"webp");
 assert.equal(meta.exif,undefined);
 assert.equal(meta.xmp,undefined);
 assert.equal(meta.icc,undefined);
 const badForm=new FormData();
 for(const [k,v] of Object.entries({csrf:token,id:f.product.id,revision:"1",lang:"ru"}))
  badForm.set(k,v);
 badForm.set("photo",new Blob([Buffer.from("<script>alert(1)</script>")],
  {type:"image/png"}),"dish.png");
 assert.equal((await fetch(f.origin+"/owner/catalog/upload",{method:"POST",redirect:"manual",
  headers:{Origin:f.origin,Cookie:cookie},body:badForm})).status,400);
});
test("invalid CSRF, origins, duplicate product identifiers, bad prices are rejected",async t=>{
 const f=await fixture(t),cookie=await f.login();
 const html=await (await f.get(f.itemPath,cookie)).text();
 const base={
  csrf:csrf(html),id:f.product.id,revision:"0",lang:"ru",
  nameTr:"Özel Kahve",nameEn:"Special Coffee",nameRu:"Особый кофе",
  priceTry:String(f.product.price+1),imageId:""
 };
 assert.equal((await f.post("/owner/catalog/save",{...base,csrf:"bad"},cookie)).status,403);
 assert.equal((await f.post("/owner/catalog/save",base,cookie,{Origin:"https://attacker.test"})).status,403);
 assert.equal((await f.post("/owner/catalog/save",{...base,priceTry:"-100"},cookie)).status,400);
 assert.equal((await f.post("/owner/catalog/save",{...base,nameEn:"<script>"},cookie)).status,400);
 const duplicated=new URLSearchParams(base);duplicated.append("id",f.product.id);
 assert.equal((await f.post("/owner/catalog/save",duplicated,cookie)).status,400);
 assert.equal((await f.get("/owner/catalog/item?id=bogus&lang=tr",cookie)).status,404);
});


test("owner-only release proposal and approval never publish to the guest catalogue",async t=>{
 const f=await fixture(t);
 assert.equal((await f.get("/owner/releases?lang=ru")).status,401);
 const cookie=await f.login();
 const before=await f.get("/owner/releases?lang=ru",cookie);
 assert.equal(before.status,200);
 const html=await before.text();
 assert.match(html,/Подготовка публикации меню/);
 assert.match(html,/НЕ изменяет меню гостей/);
 assert.equal(before.headers.get("cache-control"),"no-store");
 const token=csrf(html);
 const hash=html.match(/name="hash" value="([a-f0-9]{64})"/)?.[1];
 assert(hash);
 assert.equal((await f.post("/owner/releases/propose",{csrf:"wrong",hash,lang:"ru"},cookie)).status,403);
 assert.equal((await f.post("/owner/releases/propose",{csrf:token,hash,lang:"ru"},cookie,
   {Origin:"https://invalid-origin.test"})).status,403);
 const proposal=await f.post("/owner/releases/propose",{csrf:token,hash,lang:"ru"},cookie);
 assert.equal(proposal.status,303);
 const approvalPage=await (await f.get("/owner/releases?lang=ru",cookie)).text();
 const id=approvalPage.match(/r_[a-f0-9]{32}/)?.[0];
 assert(id);
 assert.match(approvalPage,/Ожидает согласования/);
 const approved=await f.post("/owner/releases/approve",{csrf:token,hash,id,lang:"ru"},cookie);
 assert.equal(approved.status,303);
 const result=await (await f.get("/owner/releases?lang=ru",cookie)).text();
 assert.match(result,/Одобрен · не опубликован/);
 assert.equal((await f.post("/owner/releases/approve",{csrf:token,hash,id,lang:"ru"},cookie)).status,409);
 assert.equal((await f.get("/owner/releases",cookie)).status,200);
});
test("owner release approval detects edited drafts after proposal",async t=>{
 const f=await fixture(t),cookie=await f.login();
 const page=await (await f.get("/owner/releases?lang=en",cookie)).text();
 const token=csrf(page),hash=page.match(/name="hash" value="([a-f0-9]{64})"/)?.[1];
 assert(hash);
 assert.equal((await f.post("/owner/releases/propose",{csrf:token,hash,lang:"en"},cookie)).status,303);
 const after=await (await f.get("/owner/releases?lang=en",cookie)).text();
 const id=after.match(/r_[a-f0-9]{32}/)?.[0];
 assert(id);
 const productPage=await (await f.get(f.itemPath,cookie)).text();
 const edit={
   csrf:csrf(productPage),id:f.product.id,revision:"0",lang:"ru",
   nameTr:"Yeni Ürün",nameEn:"New Product",nameRu:"Новое блюдо",
   priceTry:String(f.product.price+30),imageId:""
 };
 assert.equal((await f.post("/owner/catalog/save",edit,cookie)).status,303);
 const blocked=await f.post("/owner/releases/approve",{csrf:token,hash,id,lang:"en"},cookie);
 assert.equal(blocked.status,409);
 const fresh=(await (await f.get("/owner/releases?lang=en",cookie)).text());
 assert.match(fresh,/Pending approval/);
});
