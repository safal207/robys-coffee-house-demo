import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { openOwnerCatalog } from "../owner-catalog.mjs";
import { openOwnerReleaseGate } from "../owner-release-gate.mjs";
import { exportSignedOwnerCandidate, verifySignedOwnerCandidate } from "../../scripts/owner-release-bundle.mjs";

async function fixture(t,{withPhoto=true}={}){
 const root=mkdtempSync(join(tmpdir(),"robys-owner-signed-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const dbPath=join(root,"counter.sqlite"),catalog=openOwnerCatalog(dbPath);
 const gate=openOwnerReleaseGate(dbPath,{catalog});
 t.after(()=>{gate.close();catalog.close()});
 const keys=generateKeyPairSync("ed25519");
 const privateKeyPath=join(root,"private-key.pem"),publicKeyPath=join(root,"trusted-key.pem");
 writeFileSync(privateKeyPath,keys.privateKey.export({type:"pkcs8",format:"pem"}),{flag:"wx",mode:0o600});
 writeFileSync(publicKeyPath,keys.publicKey.export({type:"spki",format:"pem"}),{flag:"wx",mode:0o600});
 if(withPhoto){
  const product=catalog.list()[0];
  const raw=await sharp({create:{width:200,height:130,channels:3,background:"#bbaabb"}})
    .jpeg().withExif({IFD0:{Copyright:"Not for public metadata"}}).toBuffer();
  const staged=await catalog.stagePhoto({buffer:raw,actor:"reyhan"});
  catalog.update({id:product.product.id,expectedRevision:0,actor:"reyhan",
    content:{...product.draft,priceTry:product.draft.priceTry+20,imageId:staged.id}});
 }
 const preview=gate.preview();
 const proposal=gate.propose({expectedHash:preview.hash,actor:"reyhan"});
 gate.approve({id:proposal.id,expectedHash:preview.hash,actor:"reyhan"});
 return {root,dbPath,proposal,privateKeyPath,publicKeyPath,catalog,gate};
}
test("exports and verifies an approved signed snapshot without publishing anything",async t=>{
 const f=await fixture(t);
 const out=join(f.root,"candidate-one");
 const result=await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:out});
 assert.equal(result.published,false);
 assert.equal(result.signatureAlgorithm,"Ed25519");
 const verified=await verifySignedOwnerCandidate({bundleDir:out,publicKeyPath:f.publicKeyPath});
 assert.equal(verified.valid,true);
 assert.equal(verified.published,false);
 assert.equal(verified.photos,1);
 assert.equal(verified.products,f.catalog.list().length);
 const media=readdirSync(join(out,"media"))[0];
 assert.match(media,/^p_[a-f0-9]{32}\.webp$/);
 const photo=readFileSync(join(out,"media",media));
 const metadata=await sharp(photo).metadata();
 assert.equal(metadata.exif,undefined);
 assert.equal(metadata.xmp,undefined);
 assert.equal(metadata.icc,undefined);
 assert(!photo.includes(Buffer.from("Not for public metadata")));
 await assert.rejects(exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:out}),/EEXIST/);
});
test("tampered media and forged manifests fail verification",async t=>{
 const f=await fixture(t),out=join(f.root,"signed");
 await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:out});
 const asset=readdirSync(join(out,"media"))[0];
 const file=join(out,"media",asset),original=readFileSync(file);
 writeFileSync(file,Buffer.concat([original,Buffer.from("malicious")]));
 await assert.rejects(verifySignedOwnerCandidate({bundleDir:out,publicKeyPath:f.publicKeyPath}),/hash mismatch/);
 writeFileSync(file,original);
 const manifest=join(out,"manifest.json");
 writeFileSync(manifest,readFileSync(manifest,"utf8").replace("approvedBy","forgedBy"));
 await assert.rejects(verifySignedOwnerCandidate({bundleDir:out,publicKeyPath:f.publicKeyPath}),/signature/);
});
test("an untrusted verification key and an unsigned draft fail closed",async t=>{
 const f=await fixture(t,{withPhoto:false}),out=join(f.root,"signed");
 const other=generateKeyPairSync("ed25519");
 const untrusted=join(f.root,"untrusted.pem");
 writeFileSync(untrusted,other.publicKey.export({type:"spki",format:"pem"}),{mode:0o600});
 await exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:f.proposal.id,
   privateKeyPath:f.privateKeyPath,outputDir:out});
 await assert.rejects(verifySignedOwnerCandidate({bundleDir:out,publicKeyPath:untrusted}),/signature/);
 const newCandidate=f.gate.propose({expectedHash:f.gate.preview().hash,actor:"reyhan"});
 await assert.rejects(exportSignedOwnerCandidate({dbPath:f.dbPath,candidateId:newCandidate.id,
   privateKeyPath:f.privateKeyPath,outputDir:join(f.root,"not-approved")}),/not been approved/);
});
