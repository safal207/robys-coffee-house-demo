// Optional server-side gate for future version-bound guest checkout.
// Default checkout remains unchanged. Never trust a QR for prices/payment.
import { timingSafeEqual } from "node:crypto";

const DIGEST=/^[a-f0-9]{64}$/;
function digestEquals(a,b){
  if(typeof a!=="string" || typeof b!=="string" ||
     !DIGEST.test(a)||!DIGEST.test(b))return false;
  return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function checkoutCatalogVersionMatches(body,authority){
  if(!body||typeof body!=="object"||Array.isArray(body) ||
     !authority || authority.checkoutAuthority!=="static" ||
     authority.ownerCandidateActivated!==false)
    return false;
  return digestEquals(body.catalogReleaseVersion,authority.releaseVersion) &&
    digestEquals(body.priceAuthoritySha256,authority.priceAuthoritySha256);
}
