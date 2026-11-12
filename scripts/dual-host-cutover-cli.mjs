// Operator-only assessment. Never sends HTTP requests or activates a release.
// The inputs must be collected by *separate* host-side attesters with pinned keys.
// A positive assessment is not an independently measured live deployment.
import { readBounded, readHostReceipt } from "./dual-host-read-receipt.mjs";
import { verifyDualCatalogStage } from "./dual-catalog-preflight.mjs";
import { evaluateCutoverClaims } from "./dual-host-cutover-guard.mjs";

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
    stage,guest:readHostReceipt(guestReceiptPath),
    counter:readHostReceipt(counterReceiptPath),
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
