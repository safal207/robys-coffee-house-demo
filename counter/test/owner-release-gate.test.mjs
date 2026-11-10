import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { openOwnerCatalog } from "../owner-catalog.mjs";
import { openOwnerReleaseGate, previewOwnerRelease, RELEASE_CANDIDATE_SCHEMA } from "../owner-release-gate.mjs";
import { ORDER_TICKET_CATALOG_REVISION, quoteOrderTicket } from "../../src/order-ticket.js";

const timestamp=Date.parse("2026-11-10T13:00:00.000Z");
function fixture(t) {
 const dir=mkdtempSync(join(tmpdir(),"robys-release-gate-")),dbPath=join(dir,"counter.sqlite");
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const catalog=openOwnerCatalog(dbPath,{now:()=>timestamp});
 const gate=openOwnerReleaseGate(dbPath,{catalog,now:()=>timestamp});
 t.after(()=>{gate.close();catalog.close()});
 return {catalog,gate,dbPath};
}
test("release preview is source-catalog complete and excludes guest mutation",t=>{
 const {catalog,gate}=fixture(t);
 const p=gate.preview();
 assert.equal(p.snapshot.schemaVersion,RELEASE_CANDIDATE_SCHEMA);
 assert.equal(p.snapshot.ticketCatalogRevision,ORDER_TICKET_CATALOG_REVISION);
 assert.match(p.hash,/^[a-f0-9]{64}$/);
 assert.equal(p.total,catalog.list().length);
 assert.equal(p.changed,0);assert.equal(p.images,0);
 assert.deepEqual(previewOwnerRelease(catalog),p);
});
test("two explicit steps produce immutable approved candidate, never a live release",t=>{
 const {catalog,gate}=fixture(t);
 const first=gate.preview(),product=catalog.list()[0],id=product.product.id;
 const quoteBefore=quoteOrderTicket({groups:[{quantity:1,items:[{id,quantity:1}]}]}).totalMinor;
 catalog.update({id,expectedRevision:0,actor:"reyhan",content:{...product.draft,priceTry:321}});
 const preview=gate.preview();
 assert.notEqual(preview.hash,first.hash);
 assert.throws(()=>gate.propose({expectedHash:first.hash,actor:"reyhan"}),/conflict/);
 const proposal=gate.propose({expectedHash:preview.hash,actor:"reyhan",rightsAttested:true});
 assert.equal(proposal.status,"proposed");
 assert.throws(()=>gate.approve({id:proposal.id,expectedHash:first.hash,actor:"reyhan",rightsAttested:true}),/mismatch/);
 const approved=gate.approve({id:proposal.id,expectedHash:preview.hash,actor:"reyhan",rightsAttested:true});
 assert.equal(approved.status,"approved");assert.equal(approved.published,false);
 assert.equal(gate.approvedSnapshot(proposal.id).snapshot.entries[0].priceMinor,32100);
 assert.equal(quoteOrderTicket({groups:[{quantity:1,items:[{id,quantity:1}]}]}).totalMinor,quoteBefore);
 assert.throws(()=>gate.approve({id:proposal.id,expectedHash:preview.hash,actor:"reyhan",rightsAttested:true}),/cannot be approved/);
});
test("candidate approval fails closed if drafts changed after proposal",t=>{
 const {catalog,gate}=fixture(t),preview=gate.preview();
 const proposal=gate.propose({expectedHash:preview.hash,actor:"reyhan",rightsAttested:true});
 const product=catalog.list()[1];
 catalog.update({id:product.product.id,expectedRevision:0,actor:"reyhan",
   content:{...product.draft,nameTr:"Değiştirilmiş ürün"}});
 assert.throws(()=>gate.approve({id:proposal.id,expectedHash:preview.hash,actor:"reyhan",rightsAttested:true}),/conflict/);
 assert.equal(gate.list().find(x=>x.id===proposal.id).status,"proposed");
 const rejected=gate.reject({id:proposal.id,actor:"reyhan"});
 assert.equal(rejected.status,"rejected");
 assert.throws(()=>gate.approvedSnapshot(proposal.id),/not been approved/);
 assert.throws(()=>gate.reject({id:proposal.id,actor:"reyhan"}),/Cannot cancel/);
});
test("photo proof includes sanitized WebP digest and rejects corrupt media",async t=>{
 const {catalog,gate,dbPath}=fixture(t);
 const bytes=await sharp({create:{width:240,height:160,channels:3,background:"#dcdcdc"}})
  .jpeg().withExif({IFD0:{Copyright:"Private Test Source"}}).toBuffer();
 const photo=await catalog.stagePhoto({buffer:bytes,actor:"reyhan"});
 const product=catalog.list()[0];
 catalog.update({id:product.product.id,expectedRevision:0,actor:"reyhan",
  content:{...product.draft,imageId:photo.id}});
 const preview=gate.preview();
 const first=preview.snapshot.entries[0];
 assert.equal(first.photo.id,photo.id);
 assert.match(first.photo.sha256,/^[a-f0-9]{64}$/);
 assert.equal(first.photo.bytes,catalog.readPhoto(photo.id).buffer.length);
 const proposed=gate.propose({expectedHash:preview.hash,actor:"reyhan",rightsAttested:true});
 gate.approve({id:proposed.id,expectedHash:preview.hash,actor:"reyhan",rightsAttested:true});
 const db=new DatabaseSync(dbPath);
 db.prepare("UPDATE owner_menu_media SET mime='image/jpeg' WHERE id=?").run(photo.id);
 db.close();
 assert.throws(()=>gate.preview(),/unsafe photo/);
});
test("tampering with persisted proposal invalidates signed-export eligibility",t=>{
 const {dbPath,gate}=fixture(t);
 const p=gate.preview(),candidate=gate.propose({expectedHash:p.hash,actor:"reyhan",rightsAttested:true});
 gate.approve({id:candidate.id,expectedHash:p.hash,actor:"reyhan",rightsAttested:true});
 const db=new DatabaseSync(dbPath);
 db.prepare("UPDATE robys_owner_release_candidates SET snapshot_json=? WHERE id=?")
  .run('{"forged":true}',candidate.id);
 db.close();
 assert.throws(()=>gate.approvedSnapshot(candidate.id),/integrity/);
});
