import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import {
  CUTOVER_ATTESTATION_SCHEMA,verifyHostAttestation,
  evaluateCutoverClaims,checkVersionBoundQuote
} from "../../scripts/dual-host-cutover-guard.mjs";

const hash=n=>n.toString(16).padStart(64,"0");
const TODAY=Date.parse("2026-11-11T15:00:00Z");
const CHALLENGE=randomBytes(32).toString("base64url");
const FROM=hash(101),TO=hash(202),PRICES=hash(303),CATALOG=hash(404);
const ticket="a1b2c3d4";
function keyPair(){
 const keys=generateKeyPairSync("ed25519");
 return {
   privateKey:keys.privateKey,
   publicPem:keys.publicKey.export({type:"spki",format:"pem"}).toString()
 };
}
const guestKey=keyPair(),counterKey=keyPair();
const origin={guest:"https://menu.robys.example",counter:"https://counter.robys.example"};
const stage={
 valid:true,staged:true,published:false,releaseVersion:TO,
 priceAuthoritySha256:PRICES,catalogSha256:CATALOG,ticketCatalogRevision:ticket
};
function observation(role,phase="prepared",overrides={},key=role==="guest"?guestKey:counterKey){
 const statement={
   schemaVersion:CUTOVER_ATTESTATION_SCHEMA,
   role,origin:origin[role],phase,
   releaseVersion:TO,catalogSha256:CATALOG,
   priceAuthoritySha256:PRICES,ticketCatalogRevision:ticket,
   checkoutCatalogVersion:TO,previousReleaseVersion:FROM,
   challenge:CHALLENGE,observedAt:TODAY,...overrides
 };
 return {statement,signature:sign(null,Buffer.from(JSON.stringify(statement)),
   key.privateKey).toString("base64url")};
}
const options=({
  stage,guest:observation("guest"),counter:observation("counter"),
  guestPublicKeyPem:guestKey.publicPem,counterPublicKeyPem:counterKey.publicPem,
  guestOrigin:origin.guest,counterOrigin:origin.counter,
  previousReleaseVersion:FROM,challenge:CHALLENGE,now:TODAY
});
test("separate signed prepared claims permit only controlled canary, not publication",()=>{
 const result=evaluateCutoverClaims(options);
 assert.equal(result.decision,"READY_FOR_CONTROLLED_CANARY");
 assert.equal(result.releaseVersion,TO);
 assert.equal(result.published,false);assert.equal(result.activated,false);
 assert.equal(result.liveProbePassed,false);assert.equal(result.rollbackExecuted,false);
});
test("two active host attestations still require an independent live probe",()=>{
 const result=evaluateCutoverClaims({...options,
   guest:observation("guest","active"),counter:observation("counter","active")});
 assert.equal(result.decision,"READY_FOR_INDEPENDENT_LIVE_PROBE");
 assert.equal(result.published,false);assert.equal(result.liveProbePassed,false);
});
test("partial dual-host cutover demands rollback, never successful publication",()=>{
 const result=evaluateCutoverClaims({...options,
   guest:observation("guest","active"),counter:observation("counter","prepared")});
 assert.equal(result.decision,"ROLLBACK_REQUIRED");
 assert.equal(result.reason,"partial_dual_host_activation");
 assert.equal(result.rollbackExecuted,false);
});
test("absent counterpart proof after one active claim triggers rollback assessment",()=>{
 const result=evaluateCutoverClaims({...options,
   guest:observation("guest","active"),counter:null});
 assert.equal(result.decision,"ROLLBACK_REQUIRED");
 assert.equal(result.reason,"missing_or_invalid_independent_host_proof");
 assert.equal(result.rollbackExecuted,false);
});
test("no valid host proof is NO-GO, never a release or completed rollback",()=>{
 const result=evaluateCutoverClaims({...options,guest:null,counter:null});
 assert.equal(result.decision,"NO_GO");
 assert.equal(result.published,false);
});
test("active host with drifted pricing, release or order quote demands rollback",()=>{
 for(const change of [
  {priceAuthoritySha256:hash(305)},
  {catalogSha256:hash(405)},
  {checkoutCatalogVersion:hash(406)},
  {releaseVersion:hash(407)},
  {ticketCatalogRevision:"ffffffff"},
  {previousReleaseVersion:hash(408)}
 ]){
   const result=evaluateCutoverClaims({...options,
     guest:observation("guest","active",change),
     counter:observation("counter","active")});
   assert.equal(result.decision,"ROLLBACK_REQUIRED",JSON.stringify(change));
   assert.equal(result.published,false);
 }
});
test("wrong keys, origin, nonce, role and stale receipts do not authorize release",()=>{
 const invalid=[
  {...options,counterPublicKeyPem:guestKey.publicPem},
  {...options,guestOrigin:origin.counter},
  {...options,guest:observation("guest","prepared",{challenge:randomBytes(32).toString("base64url")})},
  {...options,counter:observation("counter","prepared",{role:"guest"})},
  {...options,counter:observation("counter","prepared",{observedAt:TODAY-6*60*1000})},
  {...options,counter:observation("counter","prepared",{observedAt:TODAY+61000})},
  {...options,stage:{...stage,published:true}},
  {...options,stage:{...stage,catalogSha256:hash(555)}},
  {...options,previousReleaseVersion:TO}
 ];
 for(const attempt of invalid){
   const result=evaluateCutoverClaims(attempt);
   assert(["NO_GO","ROLLBACK_REQUIRED"].includes(result.decision));
   assert.notEqual(result.decision,"READY_FOR_CONTROLLED_CANARY");
   assert.equal(result.published,false);
 }
});
test("signed body does not accept extra claims or arbitrary host statements",()=>{
 const bad=observation("guest","prepared",{published:true});
 assert.throws(()=>verifyHostAttestation({
   receipt:bad,publicKeyPem:guestKey.publicPem,role:"guest",origin:origin.guest,
   challenge:CHALLENGE,now:TODAY
 }),/Invalid observation body/);
 const valid=observation("guest");
 const parsed=verifyHostAttestation({
   receipt:valid,publicKeyPem:guestKey.publicPem,role:"guest",origin:origin.guest,
   challenge:CHALLENGE,now:TODAY
 });
 assert.equal(parsed.role,"guest");
 valid.statement.catalogSha256=hash(999);
 assert.throws(()=>verifyHostAttestation({
   receipt:valid,publicKeyPem:guestKey.publicPem,role:"guest",origin:origin.guest,
   challenge:CHALLENGE,now:TODAY
 }),/signature/);
});
test("stale QR, missing release tag and mismatched quote authority fail closed",()=>{
 const base={
   clientReleaseVersion:TO,counterReleaseVersion:TO,
   guestPriceAuthoritySha256:PRICES,counterPriceAuthoritySha256:PRICES,
   orderTicketCatalogRevision:ticket,counterTicketCatalogRevision:ticket
 };
 assert.equal(checkVersionBoundQuote(base).allowed,true);
 for(const change of [
  {clientReleaseVersion:FROM},
  {clientReleaseVersion:undefined},
  {guestPriceAuthoritySha256:hash(666)},
  {orderTicketCatalogRevision:"fffefefe"}
 ]){
   const result=checkVersionBoundQuote({...base,...change});
   assert.equal(result.allowed,false);
   assert.equal(result.paid,false);
 }
});
