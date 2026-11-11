// Fail-closed, offline assessment of separately signed guest + Counter observations.
// IMPORTANT: No host is queried here, no switch/rollback is executed, and
// a matching pair of claims is NOT independent proof of live customer behavior.
import { createPublicKey, verify, timingSafeEqual } from "node:crypto";

export const CUTOVER_ATTESTATION_SCHEMA="robys.dual-host-attestation.v1";
const HASH=/^[a-f0-9]{64}$/;
const NONCE=/^[A-Za-z0-9_-]{43}$/;
const ROLES=["guest","counter"];
const PHASES=["prepared","active"];
const MAX_AGE_MS=5*60*1000;
const MAX_FUTURE_MS=30*1000;
const FIELDS=["schemaVersion","role","origin","phase","releaseVersion",
  "catalogSha256","priceAuthoritySha256","ticketCatalogRevision",
  "checkoutCatalogVersion","previousReleaseVersion","challenge","observedAt"];
const blocked=(reason,{rollback=false,releaseVersion=null}={})=>Object.freeze({
  decision:rollback?"ROLLBACK_REQUIRED":"NO_GO",
  reason,releaseVersion,published:false,activated:false,
  rollbackExecuted:false,liveProbePassed:false
});
const equalHash=(a,b)=>{
  if(typeof a!=="string"||typeof b!=="string"||!HASH.test(a)||!HASH.test(b))return false;
  return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
};
function keyFromPinned(pem) {
  if(typeof pem!=="string"||!pem.includes("BEGIN PUBLIC KEY"))
    throw Error("Pinned Ed25519 public key required");
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=="ed25519")
    throw Error("Pinned key must be Ed25519");
  return key;
}
function checkedOrigin(value) {
  if(typeof value!=="string")throw Error("Explicit HTTPS origin required");
  let url;
  try{url=new URL(value);}catch{throw Error("Invalid HTTPS origin");}
  if(url.protocol!=="https:" || url.username || url.password ||
     url.pathname!=="/" || url.search || url.hash || url.origin!==value)
    throw Error("Origin must be exact HTTPS origin");
  return value;
}
function validObservationShape(o) {
  return o && typeof o==="object" && !Array.isArray(o) &&
    Object.keys(o).sort().join(",")===FIELDS.slice().sort().join(",") &&
    o.schemaVersion===CUTOVER_ATTESTATION_SCHEMA && ROLES.includes(o.role) &&
    PHASES.includes(o.phase) && typeof o.origin==="string" &&
    [o.releaseVersion,o.catalogSha256,o.priceAuthoritySha256,
      o.previousReleaseVersion].every(x=>typeof x==="string"&&HASH.test(x)) &&
    typeof o.ticketCatalogRevision==="string" &&
    /^[a-f0-9]{8}$/.test(o.ticketCatalogRevision) &&
    typeof o.checkoutCatalogVersion==="string" && HASH.test(o.checkoutCatalogVersion) &&
    typeof o.challenge==="string" && NONCE.test(o.challenge) &&
    Number.isSafeInteger(o.observedAt);
}

/** Produces an authenticated *claim*, not a proof that a browser loaded it. */
export function verifyHostAttestation({receipt,publicKeyPem,role,origin,challenge,now}) {
  if(!ROLES.includes(role)||!NONCE.test(challenge)||
     !Number.isSafeInteger(now)||now<1)throw Error("Invalid verifier configuration");
  const expectedOrigin=checkedOrigin(origin);
  const key=keyFromPinned(publicKeyPem);
  if(!receipt || typeof receipt!=="object" || Array.isArray(receipt) ||
     Object.keys(receipt).sort().join(",")!=="signature,statement")
    throw Error("Malformed observation receipt");
  const body=receipt.statement;
  if(!validObservationShape(body))throw Error("Invalid observation body");
  if(body.role!==role || body.origin!==expectedOrigin || body.challenge!==challenge)
    throw Error("Observation role, origin or nonce mismatch");
  if(body.observedAt>now+MAX_FUTURE_MS || now-body.observedAt>MAX_AGE_MS)
    throw Error("Observation expired or from future");
  if(typeof receipt.signature!=="string" || !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature))
    throw Error("Unsigned or malformed observation");
  if(!verify(null,Buffer.from(JSON.stringify(body)),key,Buffer.from(receipt.signature,"base64url")))
    throw Error("Invalid host observation signature");
  return Object.freeze({...body});
}

export function evaluateCutoverClaims({stage,guest,counter,guestPublicKeyPem,
  counterPublicKeyPem,guestOrigin,counterOrigin,previousReleaseVersion,challenge,now}) {
  if(!stage || stage.valid!==true || stage.staged!==true || stage.published!==false ||
     !HASH.test(stage.releaseVersion) || !HASH.test(stage.priceAuthoritySha256) ||
     !HASH.test(stage.catalogSha256) ||
     !HASH.test(previousReleaseVersion) || previousReleaseVersion===stage.releaseVersion ||
     !NONCE.test(challenge) || !Number.isSafeInteger(now))
    return blocked("invalid_offline_stage_or_baseline");
  try{
    const guestKey=keyFromPinned(guestPublicKeyPem),counterKey=keyFromPinned(counterPublicKeyPem);
    if(guestKey.export({type:"spki",format:"der"}).equals(counterKey.export({type:"spki",format:"der"})))
      return blocked("same_key_cannot_attest_both_hosts");
    if(checkedOrigin(guestOrigin)===checkedOrigin(counterOrigin))
      return blocked("host_origins_must_differ");
    const individual=[
      {receipt:guest,publicKeyPem:guestPublicKeyPem,role:"guest",origin:guestOrigin},
      {receipt:counter,publicKeyPem:counterPublicKeyPem,role:"counter",origin:counterOrigin}
    ].map(args=>{
      try{return {valid:true,claim:verifyHostAttestation({...args,challenge,now})};}
      catch{return {valid:false,claim:null};}
    });
    if(individual.some(x=>!x.valid))
      return blocked("missing_or_invalid_independent_host_proof",{
        rollback:individual.some(x=>x.valid&&x.claim.phase==="active"),
        releaseVersion:stage.releaseVersion
      });
    const observed=individual.map(x=>x.claim);
    if(observed.some(x=>!equalHash(x.releaseVersion,stage.releaseVersion) ||
       !equalHash(x.catalogSha256,stage.catalogSha256) ||
       !equalHash(x.priceAuthoritySha256,stage.priceAuthoritySha256) ||
       !equalHash(x.checkoutCatalogVersion,stage.releaseVersion) ||
       !equalHash(x.previousReleaseVersion,previousReleaseVersion) ||
       x.ticketCatalogRevision!==stage.ticketCatalogRevision))
      return blocked("guest_counter_catalog_or_quote_drift",
        {rollback:observed.some(x=>x.phase==="active"),releaseVersion:stage.releaseVersion});
    if(observed[0].phase!==observed[1].phase)
      return blocked("partial_dual_host_activation",
        {rollback:observed.some(x=>x.phase==="active"),releaseVersion:stage.releaseVersion});
    return Object.freeze({
      decision:observed[0].phase==="prepared"?"READY_FOR_CONTROLLED_CANARY":
        "READY_FOR_INDEPENDENT_LIVE_PROBE",
      reason:"matching_separately_signed_host_claims",
      releaseVersion:stage.releaseVersion,
      priceAuthoritySha256:stage.priceAuthoritySha256,
      previousReleaseVersion,
      published:false,activated:false,rollbackExecuted:false,liveProbePassed:false
    });
  }catch(error){
    return blocked("invalid_or_stale_signed_observation");
  }
}

/** Contract for future runtime integration; not active in guest checkout today. */
export function checkVersionBoundQuote({clientReleaseVersion,counterReleaseVersion,
  guestPriceAuthoritySha256,counterPriceAuthoritySha256,orderTicketCatalogRevision,
  counterTicketCatalogRevision}) {
  if(!equalHash(clientReleaseVersion,counterReleaseVersion) ||
     !equalHash(guestPriceAuthoritySha256,counterPriceAuthoritySha256) ||
     typeof orderTicketCatalogRevision!=="string" ||
     orderTicketCatalogRevision!==counterTicketCatalogRevision)
    return Object.freeze({allowed:false,reason:"stale_or_diverged_checkout",paid:false});
  return Object.freeze({allowed:true,reason:"version_and_price_authority_match",paid:false});
}
