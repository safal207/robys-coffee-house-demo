import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Local archival of user-imported observations. It is NOT CI attestation.
const HEAD=/^[0-9a-f]{40}$/, DIGEST=/^[0-9a-f]{64}$/, ID=/^[a-z][a-z0-9-]{0,79}$|^[A-Z][A-Z0-9-]{0,39}$/;
const STATUSES=new Set(["PASS","FAIL","INCOMPLETE","STALE","NOT_RUN","NOT_SELECTED","SEE_TIMINGS"]);
const hash=value=>createHash("sha256").update(value).digest("hex");
function rows(value,label,statuses){
  if(!Array.isArray(value)||value.length>120)throw Error("invalid_"+label);
  const seen=new Set(),result=[];
  for(const entry of value){
    if(!entry||Object.keys(entry).sort().join(",")!=="id,status"
      ||typeof entry.id!=="string"||!ID.test(entry.id)||seen.has(entry.id)||!statuses.has(entry.status))
      throw Error("invalid_"+label);
    seen.add(entry.id);result.push({id:entry.id,status:entry.status});
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
export function normalizeHistorySnapshot(input){
  if(!input||typeof input!=="object"||Array.isArray(input)
    ||Object.keys(input).sort().join(",")!=="cases,checks,head,registrySha256"
    ||!HEAD.test(input.head)
    ||!(input.registrySha256===null||DIGEST.test(input.registrySha256)))throw Error("invalid_snapshot");
  const checks=rows(input.checks,"checks",STATUSES),cases=rows(input.cases,"cases",new Set(["PASS","FAIL"]));
  if(checks.length+cases.length===0)throw Error("empty_snapshot");
  return {schemaVersion:1,head:input.head,registrySha256:input.registrySha256,checks,cases};
}
const validFile=/^snapshot-([a-f0-9]{40})-([a-f0-9]{64})\.json$/;
export function createHistoryStore(directory){
  const load=name=>{
    const match=validFile.exec(name);if(!match)throw Error("invalid_history_name");
    const record=JSON.parse(readFileSync(join(directory,name),"utf8"));
    if(record?.schemaVersion!==1||record?.head!==match[1]||record?.id!==match[2]
      ||typeof record.recordedAt!=="string"||!Number.isFinite(Date.parse(record.recordedAt)))
      throw Error("corrupt_history");
    const data=normalizeHistorySnapshot({head:record.head,registrySha256:record.registrySha256,checks:record.checks,cases:record.cases});
    if(hash(JSON.stringify(data))!==record.id)throw Error("history_digest_mismatch");
    return record;
  };
  return {
    save(input){
      const data=normalizeHistorySnapshot(input),id=hash(JSON.stringify(data)),name=`snapshot-${data.head}-${id}.json`;
      mkdirSync(directory,{recursive:true,mode:0o700});
      const record={...data,id,recordedAt:new Date().toISOString(),trust:"LOCAL_UNVERIFIED_IMPORT"};
      try{writeFileSync(join(directory,name),JSON.stringify(record)+"\n",{flag:"wx",mode:0o600})}
      catch(error){if(error.code!=="EEXIST")throw error;return load(name)}
      return record;
    },
    list(){
      mkdirSync(directory,{recursive:true,mode:0o700});
      const names=readdirSync(directory).filter(name=>validFile.test(name));
      if(names.length>200)throw Error("history_limit_exceeded");
      return names.map(load).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.id.localeCompare(b.id));
    }
  };
}
export function compareHistorySnapshots(before,after){
  const output=[];
  for(const kind of ["checks","cases"]){
    const prev=new Map(before[kind].map(x=>[x.id,x.status]));
    const next=new Map(after[kind].map(x=>[x.id,x.status]));
    for(const id of [...new Set([...prev.keys(),...next.keys()])].sort()){
      const from=prev.get(id)??"NOT_RUN",to=next.get(id)??"NOT_RUN";
      const change=from===to?"UNCHANGED":from==="PASS"&&to==="FAIL"?"REGRESSION":
        from==="FAIL"&&to==="PASS"?"RECOVERED":to==="NOT_RUN"||to==="NOT_SELECTED"?"LOST_EVIDENCE":
        from==="NOT_RUN"||from==="NOT_SELECTED"?"NEW_EVIDENCE":"CHANGED";
      output.push({kind,id,from,to,change});
    }
  }
  return {headBefore:before.head,headAfter:after.head,registryChanged:before.registrySha256!==after.registrySha256,
    rows:output,regressions:output.filter(row=>row.change==="REGRESSION").length,
    recovered:output.filter(row=>row.change==="RECOVERED").length,
    evidenceLost:output.filter(row=>row.change==="LOST_EVIDENCE").length};
}
