// Operator-only, signed, immutable handoff package. NOT a live deploy command.
// The trusted verification key MUST be supplied out of band, never read from bundle.
import { readFileSync, writeFileSync, mkdirSync, rmSync, openSync, closeSync, readSync, fstatSync, constants } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import sharp from "sharp";
import { openOwnerCatalog } from "../counter/owner-catalog.mjs";
import { openOwnerReleaseGate, RELEASE_CANDIDATE_SCHEMA } from "../counter/owner-release-gate.mjs";
import { ORDER_TICKET_CATALOG_REVISION } from "../src/order-ticket.js";

const sha = data => createHash("sha256").update(data).digest("hex");
const bytes = value => Buffer.from(JSON.stringify(value));
const FILE_SCHEMA = "robys.signed-catalog-candidate.v1";
const RELATIVE = /^media\/p_[a-f0-9]{32}\.webp$/;
const HASH = /^[a-f0-9]{64}$/;

// Avoid check-then-use filesystem races: validate the *opened descriptor*.
// O_NOFOLLOW prevents a replaced symlink from redirecting private key/media reads.
function readOpenedRegular(file,maxSize) {
 const flags=constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW;
 if(!constants.O_NOFOLLOW)throw Error("Symlink-safe filesystem access unavailable");
 let fd;
 try {
   fd=openSync(file,flags);
   const stat=fstatSync(fd);
   if(!stat.isFile()||!Number.isSafeInteger(stat.size)||
       stat.size<1||stat.size>maxSize)throw Error("Unsafe file type or size");
   const data=Buffer.alloc(stat.size);
   let offset=0;
   while(offset<data.length){
     const read=readSync(fd,data,offset,data.length-offset,offset);
     if(read<=0)throw Error("File changed while being read");
     offset+=read;
   }
   if(fstatSync(fd).size!==stat.size)throw Error("File changed during verification");
   return {data,mode:stat.mode};
 } finally {if(fd!==undefined)closeSync(fd);}
}
function trustedKey(path) {
 if(typeof path!=="string"||!path)throw Error("Explicit private key path required");
 const {data,mode}=readOpenedRegular(path,16*1024);
 if(process.platform!=="win32" && (mode&0o077)!==0)
   throw Error("Private signing key must not be accessible by other users");
 const key=createPrivateKey(data);
 if(key.asymmetricKeyType!=="ed25519")throw Error("Ed25519 signing key is required");
 return key;
}
function safelyRead(root,rel) {
 if(!RELATIVE.test(rel))throw Error("Unsafe media file path");
 const file=resolve(root,rel);
 if(!file.startsWith(resolve(root)+"/") && !file.startsWith(resolve(root)+"\\"))
   throw Error("Media path traversal");
 return readOpenedRegular(file,2*1024*1024).data;
}

export async function exportSignedOwnerCandidate({dbPath,candidateId,outputDir,privateKeyPath}) {
 if(typeof outputDir!=="string" || !outputDir)throw Error("Output directory required");
 const key=trustedKey(privateKeyPath);
 const catalog=openOwnerCatalog(dbPath);
 const gate=openOwnerReleaseGate(dbPath,{catalog});
 let folderCreated=false;
 const target=resolve(outputDir);
 try {
   const approved=gate.approvedSnapshot(candidateId);
   if(approved.snapshot.schemaVersion!==RELEASE_CANDIDATE_SCHEMA)
     throw Error("Unsupported release snapshot");
   if(!Number.isSafeInteger(approved.approvedAt)||approved.approvedAt<=0 ||
       typeof approved.approvedBy!=="string" || !approved.approvedBy)
     throw Error("Unverified owner approval");
   const photos=new Map(),entries=[];
   for(const record of approved.snapshot.entries) {
     const photo=record.photo;
     let normalizedPhoto=null;
     if(photo){
       if(!/^p_[a-f0-9]{32}$/.test(photo.id)||!HASH.test(photo.sha256))
         throw Error("Invalid staged photo claim");
       const verified=catalog.readPhoto(photo.id);
       if(verified.mime!=="image/webp"||sha(verified.buffer)!==photo.sha256)
         throw Error("Owner photo integrity violation");
       const meta=await sharp(verified.buffer,{failOn:"error",limitInputPixels:16_000_000}).metadata();
       if(meta.format!=="webp"||meta.exif||meta.xmp||meta.icc||meta.iptc ||
           meta.width>1600||meta.height>1600 || (meta.pages&&meta.pages!==1))
         throw Error("Owner photo must be normalized before signing");
       const path="media/"+photo.id+".webp";
       photos.set(path,verified.buffer);
       normalizedPhoto={path,sha256:photo.sha256,bytes:verified.buffer.length};
     }
     entries.push({...record,photo:normalizedPhoto});
   }
   const manifest={
     schemaVersion:FILE_SCHEMA,
     candidateId:approved.id,
     approvedBy:approved.approvedBy,
     approvedAt:approved.approvedAt,
     snapshotSha256:approved.hash,
     sourceCatalogSha256:approved.snapshot.sourceCatalogSha256,
     ticketCatalogRevision:approved.snapshot.ticketCatalogRevision,
     entries
   };
   const body=bytes(manifest),signature=sign(null,body,key);
   // Fail closed: never overwrite or partially mutate an earlier release package.
   mkdirSync(target,{recursive:false,mode:0o700});
   folderCreated=true;
   if(photos.size)mkdirSync(join(target,"media"),{mode:0o700});
   for(const [path,data] of photos)
     writeFileSync(join(target,path),data,{flag:"wx",mode:0o600});
   writeFileSync(join(target,"manifest.json"),body,{flag:"wx",mode:0o600});
   writeFileSync(join(target,"manifest.sig"),signature.toString("base64url"),{flag:"wx",mode:0o600});
   return {path:target,candidateId:approved.id,files:photos.size+2,
     signatureAlgorithm:"Ed25519",published:false};
 } catch(error){
   if(folderCreated)rmSync(target,{recursive:true,force:true});
   throw error;
 } finally {gate.close();catalog.close();}
}

export async function verifySignedOwnerCandidate({bundleDir,publicKeyPath}) {
 if(typeof bundleDir!=="string" || !bundleDir || typeof publicKeyPath!=="string" || !publicKeyPath)
   throw Error("Explicit bundle and pinned trusted key required");
 const root=resolve(bundleDir);
 const pub=createPublicKey(readOpenedRegular(publicKeyPath,16*1024).data);
 if(pub.asymmetricKeyType!=="ed25519")throw Error("Wrong trusted verification key");
 const manifestFile=join(root,"manifest.json"),signatureFile=join(root,"manifest.sig");
 const body=readOpenedRegular(manifestFile,250000).data;
 const rawSig=readOpenedRegular(signatureFile,512).data.toString("utf8");
 if(!/^[a-zA-Z0-9_-]{86}$/.test(rawSig)||!verify(null,body,pub,Buffer.from(rawSig,"base64url")))
   throw Error("Untrusted or corrupted release signature");
 const manifest=JSON.parse(body);
 if(manifest.schemaVersion!==FILE_SCHEMA || !/^r_[a-f0-9]{32}$/.test(manifest.candidateId) ||
     !HASH.test(manifest.snapshotSha256) || !HASH.test(manifest.sourceCatalogSha256) ||
     manifest.ticketCatalogRevision!==ORDER_TICKET_CATALOG_REVISION ||
     !Array.isArray(manifest.entries) || manifest.entries.length<1 || manifest.entries.length>256)
   throw Error("Invalid signed manifest");
 const items=new Set();
 let count=0;
 for(const item of manifest.entries){
   if(typeof item.id!=="string" || items.has(item.id) || !Number.isSafeInteger(item.priceMinor) ||
       item.priceMinor<100 || item.priceMinor>999900 || !item.names ||
       ["tr","en","ru"].some(l=>typeof item.names[l]!=="string" || item.names[l].length<2))
     throw Error("Invalid signed catalogue entry");
   items.add(item.id);
   if(item.photo){
     if(!RELATIVE.test(item.photo.path)||!HASH.test(item.photo.sha256))throw Error("Bad photo manifest");
     const data=safelyRead(root,item.photo.path);
     if(data.length!==item.photo.bytes||sha(data)!==item.photo.sha256)
       throw Error("Signed photo hash mismatch");
     const meta=await sharp(data,{failOn:"error",limitInputPixels:16_000_000}).metadata();
     if(meta.format!=="webp"||meta.exif||meta.xmp||meta.icc||meta.iptc ||
         meta.width>1600||meta.height>1600)
       throw Error("Unsafe release media");
     count++;
   }
 }
 // Independently verify canonical source parity; never accept a bundle
 // generated against a changed catalogue / ticket ordinal layout.
 const catalogPath=new URL("../menu-catalog.js",import.meta.url);
 if(manifest.sourceCatalogSha256!==sha(readFileSync(catalogPath)))
   throw Error("Source catalogue changed since approval");
 const recreated={
   schemaVersion:RELEASE_CANDIDATE_SCHEMA,
   ticketCatalogRevision:manifest.ticketCatalogRevision,
   sourceCatalogSha256:manifest.sourceCatalogSha256,
   entries:manifest.entries.map(entry=>({
     ...entry,photo:entry.photo?{
       id:entry.photo.path.split("/").at(-1).replace(".webp",""),
       sha256:entry.photo.sha256,bytes:entry.photo.bytes
     }:null
   }))
 };
 if(sha(bytes(recreated))!==manifest.snapshotSha256)
   throw Error("Signed snapshot differs from owner approval");
 return {valid:true,candidateId:manifest.candidateId,products:items.size,photos:count,
   published:false,signatureAlgorithm:"Ed25519",manifest};
}
