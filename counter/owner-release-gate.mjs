// Private, immutable release *candidates*. This module has no public publish path.
// A proposal is NOT deployed and MUST NOT change guest prices or Counter quotes.
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ORDER_TICKET_CATALOG_REVISION } from "../src/order-ticket.js";

export const RELEASE_CANDIDATE_SCHEMA = "robys.owner-release-candidate.v1";
const catalogFile = fileURLToPath(new URL("../menu-catalog.js", import.meta.url));
const SHA = bytes => createHash("sha256").update(bytes).digest("hex");
const actorOk = value => typeof value==="string" && /^[a-z0-9_.-]{3,64}$/.test(value);
const idOk = value => typeof value==="string" && /^r_[a-f0-9]{32}$/.test(value);
const digestOk = value => typeof value==="string" && /^[a-f0-9]{64}$/.test(value);

export function previewOwnerRelease(catalog) {
  if (!catalog || typeof catalog.list!=="function") throw Error("Private owner catalog is required");
  const records=catalog.list();
  if (!records.length || records.length>256) throw Error("Invalid catalogue size");
  const ids=new Set();
  const items=records.map(record=>{
    const {product,draft,revision}=record;
    if (!product?.id || ids.has(product.id) || !Number.isSafeInteger(revision) || revision<0)
      throw Error("Invalid catalog product identity or revision");
    ids.add(product.id);
    if (!Number.isSafeInteger(draft.priceTry) || draft.priceTry<1 || draft.priceTry>9999)
      throw Error("Invalid draft product price");
    if ([draft.nameTr,draft.nameEn,draft.nameRu].some(v=>typeof v!=="string" ||
        v.length<2 || v.length>100))throw Error("Invalid draft product translation");
    let photo=null;
    if (draft.imageId!==null) {
      const staged=catalog.readPhoto(draft.imageId);
      if (staged.mime!=="image/webp" || staged.buffer.length>2*1024*1024 ||
          staged.buffer.toString("ascii",8,12)!=="WEBP")
        throw Error("Legacy or unsafe photo cannot enter release candidate");
      photo={id:draft.imageId,sha256:SHA(staged.buffer),bytes:staged.buffer.length};
    }
    return {
      id:product.id,revision,
      names:{tr:draft.nameTr,en:draft.nameEn,ru:draft.nameRu},
      priceMinor:draft.priceTry*100,photo,
      originalImage:product.image,
      changed:revision>0
    };
  });
  const snapshot={
    schemaVersion:RELEASE_CANDIDATE_SCHEMA,
    ticketCatalogRevision:ORDER_TICKET_CATALOG_REVISION,
    sourceCatalogSha256:SHA(readFileSync(catalogFile)),
    entries:items
  };
  const json=JSON.stringify(snapshot);
  return {
    hash:SHA(Buffer.from(json)),snapshot,
    total:items.length,changed:items.filter(x=>x.changed).length,
    images:items.filter(x=>x.photo).length
  };
}

export function openOwnerReleaseGate(dbPath,{catalog,now=Date.now}={}) {
  if (!dbPath || dbPath===":memory:" || !catalog || typeof now!=="function")
    throw Error("Private release gate configuration required");
  const db=new DatabaseSync(resolve(dbPath));
  db.exec([
    "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    "CREATE TABLE IF NOT EXISTS robys_owner_release_candidates (",
    "id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL,",
    "status TEXT NOT NULL CHECK(status IN ('proposed','approved','rejected')),",
    "created_by TEXT NOT NULL, created_at INTEGER NOT NULL,",
    "approved_by TEXT, approved_at INTEGER, rejected_by TEXT, rejected_at INTEGER);",
    "CREATE INDEX IF NOT EXISTS robys_owner_release_history",
    "ON robys_owner_release_candidates(created_at DESC,id DESC);"
  ].join(" "));
  const lookup=db.prepare("SELECT * FROM robys_owner_release_candidates WHERE id=?");
  const list=db.prepare("SELECT id,snapshot_sha256,status,created_by,created_at,approved_by,approved_at " +
    "FROM robys_owner_release_candidates ORDER BY created_at DESC,id DESC LIMIT 25");
  const fresh = expected => {
    if(!digestOk(expected)) throw Error("Invalid release revision digest");
    const current=previewOwnerRelease(catalog);
    if(current.hash!==expected)throw Error("Release draft conflict");
    return current;
  };
  const transaction=fn=>{
    db.exec("BEGIN IMMEDIATE");
    try{const r=fn();db.exec("COMMIT");return r;}
    catch(e){db.exec("ROLLBACK");throw e;}
  };
  return Object.freeze({
    close(){db.close();},
    preview(){return previewOwnerRelease(catalog);},
    list(){return list.all().map(x=>({...x}));},
    propose({expectedHash,actor}) {
      if(!actorOk(actor))throw Error("Invalid owner identity");
      return transaction(()=>{
        const current=fresh(expectedHash);
        const id="r_"+randomBytes(16).toString("hex");
        const timestamp=now();
        db.prepare("INSERT INTO robys_owner_release_candidates " +
          "(id,snapshot_json,snapshot_sha256,status,created_by,created_at) VALUES (?,?,?,'proposed',?,?)")
          .run(id,JSON.stringify(current.snapshot),current.hash,actor,timestamp);
        return {id,hash:current.hash,status:"proposed"};
      });
    },
    approve({id,actor,expectedHash}) {
      if(!idOk(id)||!actorOk(actor))throw Error("Invalid release approval request");
      return transaction(()=>{
        const record=lookup.get(id);
        if(!record || record.status!=="proposed")throw Error("Release cannot be approved");
        if(expectedHash!==record.snapshot_sha256)throw Error("Release approval digest mismatch");
        fresh(expectedHash);
        if(SHA(Buffer.from(record.snapshot_json))!==record.snapshot_sha256)
          throw Error("Corrupted immutable release candidate");
        db.prepare("UPDATE robys_owner_release_candidates SET status='approved',approved_by=?,approved_at=? WHERE id=?")
          .run(actor,now(),id);
        return {id,hash:record.snapshot_sha256,status:"approved",published:false};
      });
    },
    reject({id,actor}) {
      if(!idOk(id)||!actorOk(actor))throw Error("Invalid release cancellation");
      return transaction(()=>{
        const record=lookup.get(id);
        if(!record || record.status!=="proposed")throw Error("Cannot cancel release");
        db.prepare("UPDATE robys_owner_release_candidates SET status='rejected',rejected_by=?,rejected_at=? WHERE id=?")
          .run(actor,now(),id);
        return {id,status:"rejected"};
      });
    },
    approvedSnapshot(id) {
      if(!idOk(id))throw Error("Invalid release ID");
      const record=lookup.get(id);
      if(!record || record.status!=="approved")throw Error("Release has not been approved");
      if(SHA(Buffer.from(record.snapshot_json))!==record.snapshot_sha256)
        throw Error("Release candidate integrity failure");
      const snapshot=JSON.parse(record.snapshot_json);
      if(snapshot.schemaVersion!==RELEASE_CANDIDATE_SCHEMA ||
          snapshot.ticketCatalogRevision!==ORDER_TICKET_CATALOG_REVISION ||
          snapshot.sourceCatalogSha256!==SHA(readFileSync(catalogFile)))
        throw Error("Release source catalogue has changed");
      return {id,hash:record.snapshot_sha256,snapshot,approvedBy:record.approved_by,approvedAt:record.approved_at};
    }
  });
}
