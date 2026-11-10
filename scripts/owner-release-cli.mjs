// Explicit private operator CLI; never used by the public website or Counter route.
import { exportSignedOwnerCandidate, verifySignedOwnerCandidate } from "./owner-release-bundle.mjs";

try {
  const args=process.argv.slice(2);
  if(args[0]==="export" && args.length===5) {
    const [,dbPath,candidateId,privateKeyPath,outputDir]=args;
    const r=await exportSignedOwnerCandidate({dbPath,candidateId,privateKeyPath,outputDir});
    process.stdout.write("Signed candidate prepared privately: "+r.candidateId+
      ", files="+r.files+", published=false\n");
  } else if(args[0]==="verify" && args.length===3) {
    const [,bundleDir,publicKeyPath]=args;
    const r=await verifySignedOwnerCandidate({bundleDir,publicKeyPath});
    process.stdout.write("Trusted signature and package verified: "+r.candidateId+
      ", products="+r.products+", published=false\n");
  } else throw new Error("Invalid operator invocation");
} catch {
  process.stderr.write(
    "Release candidate gate failed. Check private paths, independent signing key and approved snapshot.\n");
  process.exitCode=1;
}
