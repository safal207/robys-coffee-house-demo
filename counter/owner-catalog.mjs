// Owner-only menu draft store; never changes the canonical guest menu or Counter quotations.
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync, realpathSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { menuCategories } from "../menu-catalog.js";
import { sanitizeOwnerImage } from "./owner-image-sanitize.mjs";

const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const entryMap = new Map();
for (const category of menuCategories) {
  for (const item of (category.items ?? category.groups?.flatMap(group => group.items) ?? [])) {
    const id = category.id + ":" + (item.id ?? slug(item.name.en));
    if (!/^[a-z0-9][a-z0-9:_-]{1,119}$/.test(id) || entryMap.has(id))
      throw Error("Invalid or duplicated catalogue product id");
    entryMap.set(id, Object.freeze({
      id, category: category.name,
      name: Object.freeze({...item.name}), price: item.price,
      image: item.image ?? "src/products/menu-v1/" + category.id + "--" + slug(item.name.en) + ".webp"
    }));
  }
}
export const ownerCatalogProducts = Object.freeze([...entryMap.values()]);
const imageIdPattern = /^p_[a-f0-9]{32}$/;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 64_000_000;

function validateTitle(v) {
  if (typeof v !== "string") throw Error("Invalid product name");
  const name = v.normalize("NFC").trim();
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f<>]/u.test(name))
    throw Error("Invalid product name");
  return name;
}

export function normalizeOwnerDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "imageId,nameEn,nameRu,nameTr,priceTry")
    throw Error("Invalid draft keys");
  if (!Number.isSafeInteger(value.priceTry) || value.priceTry < 1 || value.priceTry > 9999)
    throw Error("Invalid TRY price");
  if (value.imageId !== null &&
      (typeof value.imageId !== "string" || !imageIdPattern.test(value.imageId)))
    throw Error("Invalid staged image");
  return {
    nameTr:validateTitle(value.nameTr), nameEn:validateTitle(value.nameEn),
    nameRu:validateTitle(value.nameRu), priceTry:value.priceTry, imageId:value.imageId
  };
}
function baseDraft(product) {
  return { nameTr:product.name.tr, nameEn:product.name.en,
    nameRu:product.name.ru, priceTry:product.price, imageId:null };
}
function pngDimensions(buffer) {
  if (buffer.length < 33 || buffer.toString("ascii",12,16) !== "IHDR") return null;
  return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)];
}
function jpegDimensions(buffer) {
  let offset=2;
  while (offset+4<buffer.length) {
    if (buffer[offset++] !== 0xff) return null;
    let marker=buffer[offset++];
    while (marker===0xff && offset<buffer.length) marker=buffer[offset++];
    if (marker===0xd9 || marker===0xda) break;
    if ([0xd8,0x01].includes(marker) || (marker>=0xd0&&marker<=0xd7)) continue;
    if (offset+2>buffer.length) break;
    const length=buffer.readUInt16BE(offset);
    if (length<2 || offset+length>buffer.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length<7) return null;
      return [buffer.readUInt16BE(offset+5),buffer.readUInt16BE(offset+3)];
    }
    offset+=length;
  }
  return null;
}
function webpDimensions(buffer) {
  if (buffer.length<30 || buffer.toString("ascii",0,4)!=="RIFF" ||
      buffer.toString("ascii",8,12)!=="WEBP" ||
      buffer.readUInt32LE(4)+8!==buffer.length) return null;
  const tag=buffer.toString("ascii",12,16);
  if (tag==="VP8X" && buffer.length>=30) {
    return [1+buffer.readUIntLE(24,3),1+buffer.readUIntLE(27,3)];
  }
  if (tag==="VP8 " && buffer.length>=30 &&
      buffer[23]===0x9d && buffer[24]===0x01 && buffer[25]===0x2a)
    return [buffer.readUInt16LE(26)&0x3fff,buffer.readUInt16LE(28)&0x3fff];
  if (tag==="VP8L" && buffer.length>=25 && buffer[20]===0x2f)
    return [1+(((buffer[22]&0x3f)<<8)|buffer[21]),
      1+(((buffer[24]&0x0f)<<10)|(buffer[23]<<2)|((buffer[22]&0xc0)>>6))];
  return null;
}
export function validateOwnerPhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length<40 || buffer.length>MAX_PHOTO_BYTES)
    throw Error("Invalid image size");
  let mime, ext, dimensions;
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    mime="image/png";ext="png";dimensions=pngDimensions(buffer);
    if (!buffer.subarray(-12).toString("ascii").includes("IEND")) throw Error("Truncated PNG");
  } else if (buffer[0]===0xff&&buffer[1]===0xd8&&buffer.at(-2)===0xff&&buffer.at(-1)===0xd9) {
    mime="image/jpeg";ext="jpg";dimensions=jpegDimensions(buffer);
  } else if (buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP") {
    mime="image/webp";ext="webp";dimensions=webpDimensions(buffer);
  } else throw Error("Only JPEG, PNG and WebP photographs are accepted");
  if (!dimensions || dimensions.some(n=>!Number.isSafeInteger(n)||n<64||n>8192) ||
      dimensions[0]*dimensions[1]>MAX_IMAGE_PIXELS) throw Error("Unsupported photo dimensions");
  return {mime,ext,width:dimensions[0],height:dimensions[1],bytes:buffer.length};
}

export function openOwnerCatalog(dbPath,{now=Date.now}={}) {
  if (!dbPath || dbPath===":memory:" || typeof now!=="function")
    throw Error("Private persistent catalogue database required");
  const file=resolve(dbPath),mediaDir=join(dirname(file),"owner-menu-media");
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file);
  db.exec([
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    "CREATE TABLE IF NOT EXISTS owner_menu_drafts (",
    "product_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL,",
    "updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL);",
    "CREATE TABLE IF NOT EXISTS owner_menu_audit (",
    "id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, action TEXT NOT NULL,",
    "previous TEXT, next TEXT NOT NULL, revision INTEGER NOT NULL,",
    "actor TEXT NOT NULL, happened_at INTEGER NOT NULL);",
    "CREATE INDEX IF NOT EXISTS owner_menu_audit_item ON owner_menu_audit(product_id,id DESC);",
    "CREATE TABLE IF NOT EXISTS owner_menu_media (",
    "id TEXT PRIMARY KEY, ext TEXT NOT NULL, mime TEXT NOT NULL, byte_length INTEGER NOT NULL,",
    "sha256 TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL);"
  ].join(" "));
  const getDraft=db.prepare("SELECT * FROM owner_menu_drafts WHERE product_id=?");
  const getMedia=db.prepare("SELECT * FROM owner_menu_media WHERE id=?");
  const audits=db.prepare("SELECT id,action,revision,actor,happened_at FROM owner_menu_audit WHERE product_id=? ORDER BY id DESC LIMIT 30");
  const tx=fn=>{
    db.exec("BEGIN IMMEDIATE");
    try {const result=fn();db.exec("COMMIT");return result;}
    catch(error){db.exec("ROLLBACK");throw error;}
  };
  const product = id => {
    if (typeof id!=="string" || !entryMap.has(id)) throw Error("Unknown catalogue product");
    return entryMap.get(id);
  };
  const ensureActor=actor=>{
    if (typeof actor!=="string" || !/^[a-z0-9_.-]{3,64}$/.test(actor)) throw Error("Invalid owner identity");
  };
  const normalize = value=>{
    const d=normalizeOwnerDraft(value);
    if (d.imageId!==null && !getMedia.get(d.imageId)) throw Error("Unregistered photograph");
    return d;
  };
  const snapshot = (id,row)=>{
    const base=baseDraft(product(id));
    return {
      product:product(id), revision:row?.revision??0,
      draft:row?JSON.parse(row.content):base,
      modified:Boolean(row)
    };
  };
  const writeRevision=({id,expectedRevision,content,actor,action})=>{
    ensureActor(actor);
    if (!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error("Invalid expected revision");
    product(id);
    return tx(()=>{
      const previous=getDraft.get(id),revision=previous?.revision??0;
      if(revision!==expectedRevision)throw Error("Revision conflict");
      const next=normalize(content),version=revision+1;
      db.prepare("INSERT INTO owner_menu_drafts(product_id,revision,content,updated_by,updated_at) VALUES(?,?,?,?,?) " +
        "ON CONFLICT(product_id) DO UPDATE SET revision=excluded.revision, content=excluded.content," +
        "updated_by=excluded.updated_by,updated_at=excluded.updated_at")
        .run(id,version,JSON.stringify(next),actor,now());
      db.prepare("INSERT INTO owner_menu_audit(product_id,action,previous,next,revision,actor,happened_at) VALUES(?,?,?,?,?,?,?)")
        .run(id,action,previous?.content??null,JSON.stringify(next),version,actor,now());
      return snapshot(id,getDraft.get(id));
    });
  };
  return {
    close(){db.close();},
    list(){return ownerCatalogProducts.map(item=>snapshot(item.id,getDraft.get(item.id)));},
    get(id){product(id);return snapshot(id,getDraft.get(id));},
    history(id){product(id);return audits.all(id).map(row=>({...row}));},
    update({id,expectedRevision,content,actor}){
      return writeRevision({id,expectedRevision,content,actor,action:"updated"});
    },
    restore({id,expectedRevision,auditId,actor}){
      product(id);ensureActor(actor);
      if (!Number.isSafeInteger(auditId)||auditId<1)throw Error("Invalid history ID");
      const record=db.prepare("SELECT previous FROM owner_menu_audit WHERE id=? AND product_id=?").get(auditId,id);
      if (!record)throw Error("History entry not found");
      return writeRevision({id,expectedRevision,content:record.previous?JSON.parse(record.previous):baseDraft(product(id)),
        actor,action:"restored"});
    },
    async stagePhoto({buffer,actor}){
      ensureActor(actor);
      // Validate the transport signature before decoding; only the sanitized
      // WebP leaves memory, never the original JPEG/PNG with EXIF/GPS data.
      validateOwnerPhoto(buffer);
      const {buffer:clean, ...photo}=await sanitizeOwnerImage(buffer);
      const imageId="p_"+randomBytes(16).toString("hex");
      mkdirSync(mediaDir,{recursive:true,mode:0o700});
      if (realpathSync(mediaDir)!==mediaDir)throw Error("Unsafe photo storage path");
      const path=join(mediaDir,imageId+"."+photo.ext);
      writeFileSync(path,clean,{flag:"wx",mode:0o600});
      try {
        db.prepare("INSERT INTO owner_menu_media(id,ext,mime,byte_length,sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)")
          .run(imageId,photo.ext,photo.mime,photo.bytes,
            createHash("sha256").update(clean).digest("hex"),actor,now());
        return {id:imageId,...photo};
      } catch(error){unlinkSync(path);throw error;}
    },
    readPhoto(id){
      if (!imageIdPattern.test(id))throw Error("Invalid photo ID");
      const row=getMedia.get(id);
      if(!row)throw Error("Photograph not found");
      const path=join(mediaDir,id+"."+row.ext);
      if(realpathSync(path)!==path)throw Error("Unsafe photo path");
      const data=readFileSync(path);
      if(data.length!==row.byte_length ||
        createHash("sha256").update(data).digest("hex")!==row.sha256)
        throw Error("Staged photograph integrity failure");
      return {buffer:data,mime:row.mime};
    }
  };
}
