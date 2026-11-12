// Explicit operator-only HTTPS probe of published GitHub Pages bytes.
// Does not deploy, sign, approve, or activate any release.
import { probeGuestServedCatalog,GUEST_PAGES_BASE } from "./guest-served-catalog-probe.mjs";
try {
  if(process.argv.length!==2)throw Error("No arbitrary URL overrides allowed");
  const result=await probeGuestServedCatalog();
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  process.stderr.write(
    "Guest HTTPS bytes match this local checkout; still unsigned, no full PWA proof, not live owner publish.\n"
  );
} catch(error){
  process.stderr.write("NO-GO: Guest Pages could not be independently verified against local assets.\n");
  process.exitCode=1;
}
