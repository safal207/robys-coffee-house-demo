// Independent read-only probe of bytes actually served by public GitHub Pages.
// Designed for operator CI, NOT the guest browser. Never deploys or updates prices.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { ORDER_TICKET_CATALOG_REVISION, orderTicketCatalogPricePairs } from "../src/order-ticket.js";

export const GUEST_PAGES_BASE="https://safal207.github.io/robys-coffee-house-demo/";
const FILES=Object.freeze([
  ["menu-catalog.js","javascript"],
  ["menu.html","html"],
  ["menu-grid.html","html"],
  ["menu-feed.html","html"],
  ["menu-app.js","javascript"],
  ["menu-feed.js","javascript"]
]);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const MAX_BYTES=512*1024;
const JS_MIME=/^(?:text|application)\/(?:javascript|x-javascript)(?:;|$)/i;
const HTML_MIME=/^text\/html(?:;|$)/i;

function trustedBase(url){
  if(url!==GUEST_PAGES_BASE)throw Error("Untrusted guest Pages base URL");
  const parsed=new URL(url);
  if(parsed.protocol!=="https:" || parsed.username || parsed.password ||
     parsed.search || parsed.hash || parsed.port || !parsed.pathname.endsWith("/"))
    throw Error("Invalid public base URL");
  return parsed;
}
async function boundedRemoteFetch({url,kind,fetchImpl}){
  // A caller may supply a mock in tests; real HTTPS never follows redirects.
  const response=await fetchImpl(url,{
    redirect:"manual",cache:"no-store",
    headers:{"cache-control":"no-cache"},
    signal:AbortSignal.timeout(7000)
  });
  if(response.status!==200 || response.url!==url)
    throw Error("Guest asset missing, redirected or fetched from a different URL");
  const type=response.headers.get("content-type")??"";
  if(!(kind==="html"?HTML_MIME:JS_MIME).test(type))
    throw Error("Guest asset has unexpected content type");
  const declared=response.headers.get("content-length");
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>MAX_BYTES))
    throw Error("Oversized or malformed content length");
  if(!response.body?.getReader)throw Error("Streaming response required for bounded verification");
  const reader=response.body.getReader();
  let count=0;
  const parts=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))throw Error("Invalid streamed guest bytes");
      count+=value.length;
      if(count>MAX_BYTES)throw Error("Guest asset exceeds bounded response size");
      parts.push(value);
    }
  }finally{reader.releaseLock();}
  if(!count)throw Error("Empty public guest asset");
  return Buffer.concat(parts,count);
}
export async function probeGuestServedCatalog({
  baseUrl=GUEST_PAGES_BASE,
  localRoot=process.cwd(),
  fetchImpl=fetch,
  now=Date.now
}={}){
  const base=trustedBase(baseUrl);
  if(typeof localRoot!=="string" || !localRoot || typeof fetchImpl!=="function")
    throw Error("Invalid guest probe configuration");
  const timestamp=now();
  if(!Number.isSafeInteger(timestamp)||timestamp<1)throw Error("Invalid observation clock");
  const root=resolve(localRoot);
  const verified=[];
  for(const [filename,kind] of FILES){
    const local=resolve(root,filename);
    if(!local.startsWith(root+sep))throw Error("Unsafe local asset path");
    const expected=readFileSync(local);
    if(!expected.length||expected.length>MAX_BYTES)
      throw Error("Unbounded or empty expected guest asset");
    const url=new URL(filename,base).href;
    const remote=await boundedRemoteFetch({url,kind,fetchImpl});
    if(!expected.equals(remote))
      throw Error("Guest Pages served stale or modified asset: "+filename);
    verified.push({path:filename,sha256:hash(remote),bytes:remote.length});
  }
  const sourceCatalogSha256=verified.find(x=>x.path==="menu-catalog.js").sha256;
  const pricePairs=orderTicketCatalogPricePairs();
  const priceAuthoritySha256=hash(Buffer.from(JSON.stringify(pricePairs)));
  const releaseVersion=hash(Buffer.from(JSON.stringify([
    "robys.legacy-static-counter.v1",sourceCatalogSha256,
    ORDER_TICKET_CATALOG_REVISION,priceAuthoritySha256
  ])));
  return {
    schemaVersion:"robys.guest-served-catalog-observation.v1",
    source:"github_pages_https_assets",
    baseUrl:GUEST_PAGES_BASE,sourceCatalogSha256,priceAuthoritySha256,
    ticketCatalogRevision:ORDER_TICKET_CATALOG_REVISION,releaseVersion,
    observedAt:timestamp,observedFiles:verified,
    // A successful response only proves these HTTP bytes at probe time,
    // not all PWA caches, browsers, signed host authority, or order acceptance.
    signed:false,ownerCandidateActivated:false,allClientsVerified:false,
    publishedOwnerRelease:false
  };
}
