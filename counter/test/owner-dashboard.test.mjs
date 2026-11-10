import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCounterServer, provisionOwner } from "../server.mjs";

const secret = () => randomBytes(32).toString("base64url");
const START = Date.parse("2026-11-10T12:00:00Z");

async function fixture(t, options = {}) {
  const dir = mkdtempSync(resolve(tmpdir(),"robys-owner-http-"));
  const rootDir = resolve(dir,"public"), dbPath = resolve(dir,"orders","counter.sqlite");
  mkdirSync(rootDir,{recursive:true});
  writeFileSync(resolve(rootDir,"index.html"),"<!doctype html><title>Roby's</title>");
  writeFileSync(resolve(rootDir,"integrity-manifest.json"),
    JSON.stringify({files:[{path:"index.html"}]}));
  let time = START;
  const server = createCounterServer({dbPath,rootDir,now:()=>time,...options});
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    rmSync(dir,{recursive:true,force:true});
  });
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const get = (path, cookie="", extra={}) => fetch(origin+path,{
    headers:{...(cookie?{Cookie:cookie}:{}),...extra},redirect:"manual"
  });
  const form = (path, data, cookie="", headers={}) => fetch(origin+path,{
    method:"POST",body:new URLSearchParams(data),redirect:"manual",
    headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...headers}
  });
  const ownerPassword=secret();
  await provisionOwner({dbPath,username:"reyhan",password:ownerPassword});
  const login = async () => {
    const res=await form("/owner/login",{username:"reyhan",password:ownerPassword});
    assert.equal(res.status,303);
    const setCookie=res.headers.get("set-cookie");
    assert.match(setCookie,/HttpOnly; SameSite=Strict/);
    return setCookie.split(";")[0];
  };
  return {dir,rootDir,dbPath,server,origin,get,form,login,ownerPassword,setTime:value=>{time=value;}};
}

test("owner pages are no-store, script-free and unauthenticated visitors get no sale amounts",async t=>{
  const f=await fixture(t);
  const res=await f.get("/owner?lang=ru");
  const html=await res.text();
  assert.equal(res.status,200);
  assert.match(html,/Вход владельца/);
  assert.equal(res.headers.get("cache-control"),"no-store");
  assert.match(res.headers.get("content-security-policy"),/default-src 'none'/);
  assert.match(res.headers.get("x-robots-tag"),/noindex/);
  assert.doesNotMatch(html,/<script/i);
  assert.doesNotMatch(html,/Подтверждённая сумма/);
  assert.equal((await f.get("/owner/private")).status,404);
});

test("login requires exact Origin and scoped owner credentials; no staff access",async t=>{
  const f=await fixture(t);
  const bad=await f.form("/owner/login",{username:"reyhan",password:secret()},
    "",{Origin:"https://evil.example"});
  assert.equal(bad.status,403);
  const noOwner=await f.form("/owner/login",{username:"cashier",password:secret()});
  assert.equal(noOwner.status,401);
  const cookie=await f.login();
  assert.match(cookie,/^robys-owner-session=/);
  const res=await f.get("/owner?from=2026-11-10&to=2026-11-11&lang=ru",cookie);
  assert.equal(res.status,200);
  const html=await res.text();
  assert.match(html,/Кабинет хозяйки/);
  assert.match(html,/За период подтверждённых оплат нет/);
  assert.doesNotMatch(html,/<script/i);
  const staff=await f.get("/api/counter/session",cookie);
  assert.equal(staff.status,401,"owner cookie cannot impersonate a cashier or barista");
});

test("renders only cashier-audited paid orders, excluding unpaid and forged totals",async t=>{
  const f=await fixture(t);
  const db=new DatabaseSync(f.dbPath);
  db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)")
    .run("cashier_test","no_login_in_test","cashier");
  const actor=db.prepare("SELECT id FROM users WHERE username=?").get("cashier_test").id;
  const insert=db.prepare("INSERT INTO orders " +
    "(id,client_id,guest_hash,composition_hash,quotes,status,version,created_at,updated_at,paid_at,paid_by,total_minor) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  const paidAt=Date.parse("2026-11-10T08:00:00Z");
  const quote="{}";
  insert.run("paid_id","paid-client","guest","composition",quote,"preparing",2,paidAt,paidAt,paidAt,actor,21500);
  insert.run("unpaid_id","unpaid-client","guest","composition",quote,"awaiting_payment",1,paidAt,paidAt,null,null,83000);
  insert.run("forged_id","forged-client","guest","composition",quote,"preparing",2,paidAt,paidAt,paidAt,actor,999000);
  db.prepare("INSERT INTO audit(order_id,action,from_version,at,actor_id,actor_username,actor_role) VALUES(?,?,?,?,?,?,?)")
    .run("paid_id","pay",1,paidAt,actor,"cashier_test","cashier");
  db.close();
  const cookie=await f.login();
  const response=await f.get("/owner?from=2026-11-10&to=2026-11-11&lang=en",cookie);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Paid orders|Cashier-acknowledged paid orders/);
  assert.match(html,/215/);
  assert.doesNotMatch(html,/9,990|9990|999,000|830/);
  assert.match(html,/Campaign source: unverified/);
  assert.match(html,/2026-11-10/);
});

test("logout is CSRF-gated, invalidates owner session, and prevents stale cookie reads",async t=>{
  const f=await fixture(t), cookie=await f.login();
  const html=await (await f.get("/owner?lang=en",cookie)).text();
  const csrf=html.match(/name="csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
  assert(csrf,"CSRF token is present only in authenticated HTML");
  assert.equal((await f.form("/owner/logout",{csrf:"invalid"},cookie)).status,403);
  assert.equal((await f.form("/owner/logout",{csrf},cookie,{Origin:"https://malicious.test"})).status,403);
  const response=await f.form("/owner/logout",{csrf},cookie);
  assert.equal(response.status,303);
  assert.match(response.headers.get("set-cookie"),/Max-Age=0/);
  assert.match(await (await f.get("/owner?lang=en",cookie)).text(),/Owner sign-in/);
});

test("owner rejects range abuse, duplicate keys, unsupported locales and extra form fields",async t=>{
  const f=await fixture(t),cookie=await f.login();
  for(const path of [
    "/owner?from=2026-01-01&to=2026-11-10",
    "/owner?from=2026-11-30&to=2026-11-10",
    "/owner?from=2026-99-99&to=2026-11-11",
    "/owner?lang=de",
    "/owner?lang=tr&lang=en",
    "/owner?unknown=1"
  ]) assert.equal((await f.get(path,cookie)).status,400,path);
  assert.equal((await f.form("/owner/login",
    {username:"reyhan",password:f.ownerPassword,role:"owner"})).status,400);
});

test("owner session expires and password rotation invalidates existing token",async t=>{
  const f=await fixture(t),cookie=await f.login();
  f.setTime(START+60*60*1000);
  assert.match(await (await f.get("/owner",cookie)).text(),/girişi/);
  f.setTime(START);
  const fresh=await f.login();
  await f.server.provisionOwner({username:"reyhan",password:secret()});
  assert.match(await (await f.get("/owner",fresh)).text(),/girişi/);
});

test("owner password remains isolated from Counter staff permissions",async t=>{
  const f=await fixture(t);
  const loginResponse=await fetch(f.origin+"/api/counter/login",{
    method:"POST",redirect:"manual",headers:{"Content-Type":"application/json",Origin:f.origin},
    body:JSON.stringify({username:"reyhan",password:f.ownerPassword})
  });
  assert.equal(loginResponse.status,401);
  const ownerCookie=await f.login();
  assert.equal((await f.get("/api/counter/queue",ownerCookie)).status,401);
});
