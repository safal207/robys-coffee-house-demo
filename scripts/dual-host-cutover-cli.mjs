// Operator-only assessment. Never sends HTTP requests or activates a release.
// The inputs must be collected by *separate* host-side attesters with pinned keys.
// A positive assessment is not an independently measured live deployment.
import { readFileSync,openSync,closeSync,fstatSync,readSync,constants } from "node:fs";
import { verifyDualCatalogStage } from "./dual-catalog-preflight.mjs";
import { evaluateCutoverClaims } from "./dual-host-cutover-guard.mjs";

function readBounded(path,limit=64*1024) {
  if(!constants.O_NOFOLLOW)throw Error("Symlink-safe input reading unavailable");
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const st=fstatSync(fd);
    if(!st.isFile()||st.size<1||st.size>limit)throw Error("Invalid private assessment input");
    const data=Buffer.alloc(st.size);let offset=0;
    while(offset<st.size){
      const n=readSync(fd,data,offset,st.size-offset,offset);
      if(n<=0)throw Error("Short private assessment input");
      offset+=n;
    }
    if(fstatSync(fd).size!==st.size)throw Error("Assessment input changed");
    return data.toString("utf8");
  }finally{closeSync(fd);}
}
async function main(args) {
  if(args[0]!=="assess"||args.length!==7)throw Error("Invalid cutover assessment arguments");
  const [,bundleDir,ownerPublicKey,stageDir,configPath,guestReceiptPath,counterReceiptPath]=args;
  const config=JSON.parse(readBounded(configPath));
  const expectedKeys=[
    "guestOrigin","counterOrigin","previousReleaseVersion","challenge",
    "guestPublicKeyPath","counterPublicKeyPath"
  ];
  if(!config||typeof config!=="object"||Array.isArray(config)||
     Object.keys(config).sort().join(",")!==expectedKeys.sort().join(","))
    throw Error("Invalid pinned host trust configuration");
  const stage=await verifyDualCatalogStage({bundleDir,publicKeyPath:ownerPublicKey,stageDir});
  const decision=evaluateCutoverClaims({
    stage,guest:JSON.parse(readBounded(guestReceiptPath)),
    counter:JSON.parse(readBounded(counterReceiptPath)),
    guestPublicKeyPem:readBounded(config.guestPublicKeyPath),
    counterPublicKeyPem:readBounded(config.counterPublicKeyPath),
    guestOrigin:config.guestOrigin,counterOrigin:config.counterOrigin,
    previousReleaseVersion:config.previousReleaseVersion,
    challenge:config.challenge,now:Date.now()
  });
  process.stdout.write(JSON.stringify(decision)+"\n");
  if(decision.decision==="NO_GO"||decision.decision==="ROLLBACK_REQUIRED")process.exitCode=1;
}
try{
  await main(process.argv.slice(2));
}catch(error){
  process.stderr.write("NO-GO: Cannot trust host claims or offline stage. No deployment or rollback performed.\n");
  process.exitCode=1;
}
