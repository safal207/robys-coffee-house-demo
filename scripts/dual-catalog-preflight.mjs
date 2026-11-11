// Offline, NOT a deploy operation: create equal guest/Counter projections from the
// same owner-approved, Ed25519-verified candidate. No network, runtime switches or passwords.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync, openSync, closeSync, fstatSync, readSync, constants } from "node:fs";
import { resolve, join } from "node:path";
import { menuCategories } from "../menu-catalog.js";
import { ORDER_TICKET_CATALOG_REVISION } from "../src/order-ticket.js";
import { verifySignedOwnerCandidate } from "./owner-release-bundle.mjs";

export const DUAL_STAGE_SCHEMA = "robys.dual-catalog-stage.v1";
const sha = value => createHash("sha256").update(value).digest("hex");
const encode = value => Buffer.from(JSON.stringify(value));
const idSlug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const supported = new Set(["tr","en","ru"]);

const canonicalItems = menuCategories.flatMap(category =>
  (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item=>({
    id:category.id+":"+(item.id ?? idSlug(item.name.en)),
    originalImage:item.image ?? "src/products/menu-v1/"+category.id+"--"+idSlug(item.name.en)+".webp",
    variants:(item.variants ?? []).map(variant=>({
      id:variant.id,
      names:{tr:variant.name.tr,en:variant.name.en,ru:variant.name.ru}
    }))
  }))
);

export function projectSignedCatalog(manifest) {
  if(!manifest || !Array.isArray(manifest.entries) ||
      manifest.entries.length!==canonicalItems.length ||
      manifest.ticketCatalogRevision!==ORDER_TICKET_CATALOG_REVISION)
    throw Error("Catalog item/order fingerprint mismatch");
  if(!/^r_[a-f0-9]{32}$/.test(manifest.candidateId) ||
      !/^[a-f0-9]{64}$/.test(manifest.snapshotSha256) ||
      !/^[a-f0-9]{64}$/.test(manifest.sourceCatalogSha256))
    throw Error("Invalid signed snapshot identity");

  const items=manifest.entries.map((item,index)=>{
    const source=canonicalItems[index];
    if(item.id!==source.id || item.originalImage!==source.originalImage ||
       !Number.isSafeInteger(item.priceMinor) || item.priceMinor<100 ||
       item.priceMinor>999900 || !item.names ||
       [...supported].some(lang=>typeof item.names[lang]!=="string" ||
         item.names[lang].trim().length<2 || item.names[lang].length>100) ||
       !Number.isSafeInteger(item.revision) || item.revision<0)
      throw Error("Catalog product, translation, image or price drift");
    const photo=item.photo;
    if(photo && (!/^media\/p_[a-f0-9]{32}\.webp$/.test(photo.path) ||
      !/^[a-f0-9]{64}$/.test(photo.sha256) ||
      !Number.isSafeInteger(photo.bytes) || photo.bytes<1 || photo.bytes>2*1024*1024))
      throw Error("Unverified staged photo path or content");
    return {
      id:item.id,
      names:{tr:item.names.tr,en:item.names.en,ru:item.names.ru},
      priceMinor:item.priceMinor,
      variants:source.variants,
      image:photo ? {path:photo.path,sha256:photo.sha256} :
        {path:source.originalImage,sha256:null}
    };
  });

  const priceAuthoritySha256=sha(encode(items.map(x=>[x.id,x.priceMinor])));
  const catalogBody=encode(items);
  const catalogSha256=sha(catalogBody);
  const releaseVersion=sha(encode([
    DUAL_STAGE_SCHEMA,manifest.candidateId,manifest.snapshotSha256,
    manifest.ticketCatalogRevision,catalogSha256
  ]));
  const projection={
    schemaVersion:DUAL_STAGE_SCHEMA,
    releaseVersion,candidateId:manifest.candidateId,
    snapshotSha256:manifest.snapshotSha256,
    sourceCatalogSha256:manifest.sourceCatalogSha256,
    ticketCatalogRevision:manifest.ticketCatalogRevision,
    priceAuthoritySha256,catalogSha256,
    activated:false, items
  };
  return {projection,releaseVersion,priceAuthoritySha256,catalogSha256};
}

const names=["guest-catalog-stage.json","counter-catalog-stage.json","preflight.json"];
function readRegular(path,max=2*1024*1024){
  if(!constants.O_NOFOLLOW)throw Error("Secure descriptor reads not supported");
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size<1||stat.size>max)throw Error("Unsafe staged file");
    const data=Buffer.alloc(stat.size);
    let cursor=0;
    while(cursor<data.length){
      const n=readSync(fd,data,cursor,data.length-cursor,cursor);
      if(n<=0)throw Error("Staged file changed");
      cursor+=n;
    }
    if(fstatSync(fd).size!==stat.size)throw Error("Staged file changed");
    return data;
  }finally{closeSync(fd);}
}

export async function stageDualCatalog({bundleDir,publicKeyPath,outputDir}) {
  if(typeof outputDir!=="string" || !outputDir)throw Error("Explicit private staging directory required");
  const verified=await verifySignedOwnerCandidate({bundleDir,publicKeyPath});
  const {projection,releaseVersion,priceAuthoritySha256,catalogSha256}=projectSignedCatalog(verified.manifest);
  const body=encode(projection);
  const digest=sha(body);
  const preflight={
    schemaVersion:DUAL_STAGE_SCHEMA,
    candidateId:verified.candidateId,releaseVersion,
    snapshotSha256:verified.manifest.snapshotSha256,
    priceAuthoritySha256,catalogSha256,
    guestFileSha256:digest,counterFileSha256:digest,
    guestFile:"guest-catalog-stage.json",counterFile:"counter-catalog-stage.json",
    // No two-host atomic switch is possible without a runtime activation protocol.
    stageOnly:true,liveGuestObserved:false,liveCounterObserved:false,
    published:false
  };
  const root=resolve(outputDir);
  let created=false;
  try {
    mkdirSync(root,{recursive:false,mode:0o700});
    created=true;
    writeFileSync(join(root,names[0]),body,{flag:"wx",mode:0o600});
    writeFileSync(join(root,names[1]),body,{flag:"wx",mode:0o600});
    writeFileSync(join(root,names[2]),encode(preflight),{flag:"wx",mode:0o600});
  }catch(error){
    if(created)rmSync(root,{recursive:true,force:true});
    throw error;
  }
  return {path:root,candidateId:verified.candidateId,releaseVersion,
    priceAuthoritySha256,products:projection.items.length,published:false};
}

export async function verifyDualCatalogStage({bundleDir,publicKeyPath,stageDir}){
  if(typeof stageDir!=="string"||!stageDir)throw Error("Explicit staging directory required");
  const verified=await verifySignedOwnerCandidate({bundleDir,publicKeyPath});
  const expected=projectSignedCatalog(verified.manifest);
  const root=resolve(stageDir);
  const [guest,counter,preflight]=names.map(name=>readRegular(join(root,name)));
  const expectedData=encode(expected.projection);
  // Byte equality is mandatory even if both documents claim the same hash.
  if(!guest.equals(counter) || !guest.equals(expectedData))
    throw Error("Guest and Counter catalogue projections differ");
  let receipt;
  try{receipt=JSON.parse(preflight.toString("utf8"));}catch{throw Error("Invalid staging receipt");}
  if(receipt.schemaVersion!==DUAL_STAGE_SCHEMA ||
      receipt.releaseVersion!==expected.releaseVersion ||
      receipt.candidateId!==verified.candidateId ||
      receipt.snapshotSha256!==verified.manifest.snapshotSha256 ||
      receipt.catalogSha256!==expected.catalogSha256 ||
      receipt.priceAuthoritySha256!==expected.priceAuthoritySha256 ||
      receipt.guestFileSha256!==sha(guest) ||
      receipt.counterFileSha256!==sha(counter) ||
      receipt.guestFile!=="guest-catalog-stage.json" ||
      receipt.counterFile!=="counter-catalog-stage.json" ||
      receipt.stageOnly!==true ||
      receipt.liveGuestObserved!==false || receipt.liveCounterObserved!==false ||
      receipt.published!==false)
    throw Error("Invalid or misleading dual-catalog receipt");
  return {valid:true,candidateId:verified.candidateId,
    releaseVersion:expected.releaseVersion,products:expected.projection.items.length,
    priceAuthoritySha256:expected.priceAuthoritySha256,
    staged:true,published:false};
}
