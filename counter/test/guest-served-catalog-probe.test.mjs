import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { probeGuestServedCatalog,GUEST_PAGES_BASE } from "../../scripts/guest-served-catalog-probe.mjs";
import { observeCounterCatalog } from "../catalog-observation.mjs";
const timestamp=Date.parse("2026-11-12T10:12:00Z");
function mockFetch(changes={}){
  const requests=[];
  const fn=async (url,opts)=>{
    requests.push({url,opts});
    const name=basename(new URL(url).pathname);
    let bytes=readFileSync(name);
    if(changes.tamper===name)bytes=Buffer.concat([bytes,Buffer.from("\n/* unexpected */")]);
    if(changes.empty===name)bytes=Buffer.alloc(0);
    if(changes.huge===name)bytes=Buffer.alloc(512*1024+5);
    const type=name.endsWith(".html")?"text/html; charset=utf-8":"text/javascript; charset=utf-8";
    return {
      status:changes.status??200,
      url:changes.redirect ? "https://untrusted.test/redirect" : url,
      headers:new Headers({"content-type":changes.mime??type}),
      body:new ReadableStream({start(controller){
        controller.enqueue(bytes);
        controller.close();
      }})
    };
  };
  return {fn,requests};
}
test("independently fetched guest files agree with actual static cashier price hash",async()=>{
  const mock=mockFetch();
  const guest=await probeGuestServedCatalog({fetchImpl:mock.fn,now:()=>timestamp});
  const counter=observeCounterCatalog(timestamp);
  assert.equal(guest.source,"github_pages_https_assets");
  assert.equal(guest.baseUrl,GUEST_PAGES_BASE);
  assert.equal(guest.observedFiles.length,6);
  assert.equal(guest.observedAt,timestamp);
  assert.equal(guest.priceAuthoritySha256,counter.priceAuthoritySha256);
  assert.equal(guest.sourceCatalogSha256,counter.sourceCatalogSha256);
  assert.equal(guest.ticketCatalogRevision,counter.ticketCatalogRevision);
  assert.equal(guest.releaseVersion,counter.releaseVersion);
  assert.equal(guest.ownerCandidateActivated,false);
  assert.equal(guest.allClientsVerified,false);
  assert.equal(guest.publishedOwnerRelease,false);
  assert.equal(guest.signed,false);
  const catalog=guest.observedFiles.find(f=>f.path==="menu-catalog.js");
  assert.equal(catalog.sha256,createHash("sha256").update(readFileSync("menu-catalog.js")).digest("hex"));
  assert.equal(mock.requests.length,6);
  for(const {url,opts} of mock.requests){
    assert(url.startsWith(GUEST_PAGES_BASE));
    assert.equal(opts.redirect,"manual");
    assert.equal(opts.cache,"no-store");
  }
});
test("fail closed on stale guest catalogue, injected script or old browser entry",async()=>{
  for(const file of ["menu-catalog.js","menu.html","menu-grid.html","menu-feed.html","menu-app.js","menu-feed.js"]){
    const mock=mockFetch({tamper:file});
    await assert.rejects(probeGuestServedCatalog({fetchImpl:mock.fn}),/stale or modified/);
  }
});
test("reject wrong base URL, redirect, content type, empty and oversized assets",async()=>{
  const good=mockFetch();
  await assert.rejects(probeGuestServedCatalog({
    baseUrl:"http://127.0.0.1/robys-coffee-house-demo/",fetchImpl:good.fn
  }),/Untrusted/);
  await assert.rejects(probeGuestServedCatalog({
    baseUrl:"https://safal207.github.io/other/",fetchImpl:good.fn
  }),/Untrusted/);
  for(const changes of [{redirect:true},{mime:"text/html"},{status:404},
    {empty:"menu-catalog.js"},{huge:"menu-catalog.js"}]){
    await assert.rejects(probeGuestServedCatalog({
      fetchImpl:mockFetch(changes).fn
    }),/Guest asset|Empty|exceeds|Unexpected|Oversized/i);
  }
});
