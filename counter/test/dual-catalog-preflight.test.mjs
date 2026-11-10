import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openOwnerCatalog } from "../owner-catalog.mjs";
import { openOwnerReleaseGate } from "../owner-release-gate.mjs";
import { exportSignedOwnerCandidate,verifySignedOwnerCandidate } from "../../scripts/owner-release-bundle.mjs";
import { stageDualCatalog,verifyDualCatalogStage,projectSignedCatalog } from "../../scripts/dual-catalog-preflight.mjs";
import { quoteOrderTicket } from "../../src/order-ticket.js";

async function setup(t,{approve=true}={}){
 const root=mkdtempSync(join(tmpdir(),"robys-dual-release-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const dbPath=join(root,"counter.sqlite"),catalog=openOwnerCatalog(dbPath);
 const gate=openOwnerReleaseGate(dbPath,{catalog});
 t.after(()=>{gate.close();catalog.close();});
 const first=catalog.list()[0];
 const originalPriceMinor=first.product.price*100;
 const changedPrice=first.product.price+50;
 catalog.update({id:first.product.id,expectedRevision:0,actor:"reyhan",
   content:{...first.draft,priceTry:changedPrice}});
 const preview=gate.preview(),proposal=gate.propose({expectedHash:preview.hash,actor:"reyhan"});
 if(approve)gate.approve({id:proposal.id,expectedHash:preview.hash,actor:"reyhan",rightsAttested:true});
 const keys=generateKeyPairSync("ed25519");
 const privateKeyPath=join(root,"key.pem"),publicKeyPath=join(root,"pinned-trust.pem");
 writeFileSync(privateKeyPath,keys.privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600});
 writeFileSync(publicKeyPath,keys.publicKey.export({type:"spki",format:"pem"}),{mode:0o600});
 return {root,dbPath,privateKeyPath,publicKeyPath,
   bundleDir:join(root,"signed"),stageDir:join(root,"offline-staged"),
   catalog,gate,proposal,originalPriceMinor,changedPrice,
   productId:first.product.id};
}
test("two staged consumers share byte-identical prices, variants and release version",async t=>{
 const f=await setup(t);
 const bundle=await exportSignedOwnerCandidate({
   dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:f.bundleDir});
 assert.equal(bundle.published,false);
 const staged=await stageDualCatalog({bundleDir:f.bundleDir,
   publicKeyPath:f.publicKeyPath,outputDir:f.stageDir});
 assert.equal(staged.published,false);
 const guest=readFileSync(join(f.stageDir,"guest-catalog-stage.json"));
 const counter=readFileSync(join(f.stageDir,"counter-catalog-stage.json"));
 assert.deepEqual(guest,counter);
 const projection=JSON.parse(guest);
 assert.equal(projection.activated,false);
 assert.equal(projection.items[0].priceMinor,f.changedPrice*100);
 assert.equal(projection.priceAuthoritySha256,staged.priceAuthoritySha256);
 assert.deepEqual(projection.items[0].variants,[]);
 assert.match(projection.releaseVersion,/^[a-f0-9]{64}$/);
 assert.equal(JSON.parse(readFileSync(join(f.stageDir,"preflight.json"))).stageOnly,true);
 const pass=await verifyDualCatalogStage({bundleDir:f.bundleDir,
   publicKeyPath:f.publicKeyPath,stageDir:f.stageDir});
 assert.equal(pass.valid,true);assert.equal(pass.published,false);
 assert.equal(pass.releaseVersion,staged.releaseVersion);
 assert.equal(pass.products,f.catalog.list().length);
 // Critically, the existing (unmodified) Counter quote is still from
 // today's original menu: staged price changes MUST NOT be called live.
 const actualQuote=quoteOrderTicket({
   groups:[{quantity:1,items:[{id:f.productId,quantity:1}]}]
 }).totalMinor;
 assert.equal(actualQuote,f.originalPriceMinor);
 assert.notEqual(actualQuote,projection.items[0].priceMinor);
});
test("edited guest or cashier stage is rejected even with unchanged receipt",async t=>{
 const f=await setup(t);
 await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:f.bundleDir});
 await stageDualCatalog({bundleDir:f.bundleDir,publicKeyPath:f.publicKeyPath,outputDir:f.stageDir});
 const file=join(f.stageDir,"guest-catalog-stage.json");
 const parsed=JSON.parse(readFileSync(file));
 parsed.items[0].priceMinor+=100;
 writeFileSync(file,JSON.stringify(parsed));
 await assert.rejects(verifyDualCatalogStage({bundleDir:f.bundleDir,
   publicKeyPath:f.publicKeyPath,stageDir:f.stageDir}),/projections differ/);
});
test("rejects forged equal projections and a deceptive published receipt",async t=>{
 const f=await setup(t);
 await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:f.bundleDir});
 await stageDualCatalog({bundleDir:f.bundleDir,publicKeyPath:f.publicKeyPath,outputDir:f.stageDir});
 const guest=join(f.stageDir,"guest-catalog-stage.json");
 const counter=join(f.stageDir,"counter-catalog-stage.json");
 const projection=JSON.parse(readFileSync(guest));
 projection.items[0].priceMinor+=100;
 const forged=JSON.stringify(projection);
 writeFileSync(guest,forged);writeFileSync(counter,forged);
 await assert.rejects(verifyDualCatalogStage({bundleDir:f.bundleDir,
   publicKeyPath:f.publicKeyPath,stageDir:f.stageDir}),/projections differ/);
 const trusted=await verifySignedOwnerCandidate({bundleDir:f.bundleDir,publicKeyPath:f.publicKeyPath});
 const restored=projectSignedCatalog(trusted.manifest).projection;
 writeFileSync(guest,JSON.stringify(restored));writeFileSync(counter,JSON.stringify(restored));
 const file=join(f.stageDir,"preflight.json"),receipt=JSON.parse(readFileSync(file));
 receipt.published=true;writeFileSync(file,JSON.stringify(receipt));
 await assert.rejects(verifyDualCatalogStage({bundleDir:f.bundleDir,
   publicKeyPath:f.publicKeyPath,stageDir:f.stageDir}),/misleading/);
});
test("refuses unknown/stale item order, ticket ordinal or changed fallback image",async t=>{
 const f=await setup(t);
 await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:f.bundleDir});
 const result=await verifySignedOwnerCandidate({bundleDir:f.bundleDir,publicKeyPath:f.publicKeyPath});
 const m=result.manifest;
 assert.throws(()=>projectSignedCatalog({...m,entries:m.entries.slice(1)}),/fingerprint mismatch/);
 assert.throws(()=>projectSignedCatalog({...m,entries:[{...m.entries[0],id:"unknown:fake"},...m.entries.slice(1)]}),/drift/);
 assert.throws(()=>projectSignedCatalog({...m,ticketCatalogRevision:"00000000"}),/fingerprint mismatch/);
 assert.throws(()=>projectSignedCatalog({...m,entries:[{...m.entries[0],originalImage:"https://evil.test/x"},...m.entries.slice(1)]}),/drift/);
});
test("non-approved owner draft and existing staging directory fail closed",async t=>{
 const f=await setup(t,{approve:false});
 await assert.rejects(exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:f.bundleDir}),/not been approved/);
 assert.equal(existsSync(f.bundleDir),false);
});
test("an untrusted key cannot be used to stage projections",async t=>{
 const f=await setup(t);
 await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:f.bundleDir});
 const other=generateKeyPairSync("ed25519");
 const fake=join(f.root,"fake-trust.pem");
 writeFileSync(fake,other.publicKey.export({type:"spki",format:"pem"}));
 await assert.rejects(stageDualCatalog({bundleDir:f.bundleDir,
   publicKeyPath:fake,outputDir:f.stageDir}),/signature/);
 assert.equal(existsSync(f.stageDir),false);
});
