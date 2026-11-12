// Read-only observation of the actual static Counter quote authority.
// It does NOT attest or activate an owner release; a future independent
// observer must compare the served evidence under pinned HTTPS.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ORDER_TICKET_CATALOG_REVISION, orderTicketCatalogPricePairs } from "../src/order-ticket.js";

const sha = value => createHash("sha256").update(value).digest("hex");
const sourceCatalogSha256 = sha(readFileSync(new URL("../menu-catalog.js", import.meta.url)));
const pricePairs = orderTicketCatalogPricePairs();
if(!pricePairs.length || pricePairs.length>256 ||
    new Set(pricePairs.map(item=>item[0])).size!==pricePairs.length ||
    pricePairs.some(([id,amount])=>typeof id!=="string" ||
      !Number.isSafeInteger(amount) || amount<=0))
  throw new Error("Invalid live Counter pricing authority");
const priceAuthoritySha256 = sha(Buffer.from(JSON.stringify(pricePairs)));
const releaseVersion = sha(Buffer.from(JSON.stringify([
  "robys.legacy-static-counter.v1",sourceCatalogSha256,
  ORDER_TICKET_CATALOG_REVISION,priceAuthoritySha256
])));

/** Unauthenticated status hash, never evidence of deployment by itself. */
export function observeCounterCatalog(now=Date.now(), checkoutVersionEnforced=false) {
  if(!Number.isSafeInteger(now) || now<=0 || typeof checkoutVersionEnforced!=="boolean")
    throw Error("Invalid observation clock or checkout enforcement mode");
  return {
    schemaVersion:"robys.counter-catalog-observation.v1",
    mode:"legacy_static", checkoutAuthority:"static",checkoutVersionEnforced,
    releaseVersion,sourceCatalogSha256,priceAuthoritySha256,
    ticketCatalogRevision:ORDER_TICKET_CATALOG_REVISION,
    observedAt:now,
    // These flags prevent a static hash from being mistaken for a
    // signed release receipt or production activation.
    signed:false,ownerCandidateActivated:false
  };
}
