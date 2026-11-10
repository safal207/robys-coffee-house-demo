import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_SCHEMA_VERSION, CONSENT_KEY, CONSENT_LIFETIME_MS, consentCopy,
  createConsentManager, readConsent
} from "./marketing-consent-v1.js";
import { CAMPAIGN_SESSION_KEY } from "./marketing-attribution-v0.js";
const storage = () => {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k), map };
};

test("TR/EN/RU have readable opt-in, refusal and withdrawal copy", () => {
  assert.deepEqual(Object.keys(consentCopy), ["tr","en","ru"]);
  for (const lang of Object.values(consentCopy)) for (const field of ["title","description","accept","reject","settings","withdraw"]) assert(lang[field].length > 3);
});
test("consent is explicitly opt-in; feature flag remains off after consent", () => {
  const s=storage(), m=createConsentManager({ preferenceStorage:s, now:()=>1000 });
  assert.equal(m.choice,null); assert.equal(m.canCollect,false); assert.equal(s.map.size,0);
  assert.equal(m.accept(),false); assert.equal(m.choice,"accepted"); assert.equal(m.canCollect,false);
  assert.equal(readConsent(s,2000),"accepted");
});
test("authorized opt-in enables collection; decline/withdraw disables and clears attribution", () => {
  const s=storage(), campaign=storage();
  campaign.setItem(CAMPAIGN_SESSION_KEY,"a-campaign");
  let called=0;
  const m=createConsentManager({ preferenceStorage:s,campaignStorage:campaign, now:()=>1000,collectionEnabled:true,onWithdraw:()=>{called++;} });
  m.accept(); assert.equal(m.canCollect,true);
  m.withdraw(); assert.equal(m.canCollect,false); assert.equal(m.choice,"rejected");
  assert.equal(campaign.map.has(CAMPAIGN_SESSION_KEY),false); assert.equal(called,1);
  m.reject(); assert.equal(called,2);
});
test("expired, unsupported, future-dated and polluted preferences fail closed", () => {
  const s=storage(), now=1000000000;
  const valid={schemaVersion:CONSENT_SCHEMA_VERSION,choice:"accepted",expiresAt:now+1000};
  for (const bad of [
    {...valid,schemaVersion:"older"}, {...valid,choice:"required"},
    {...valid,expiresAt:now}, {...valid,expiresAt:now+CONSENT_LIFETIME_MS+1},
    {...valid,extra:"script"}, "not-json"
  ]) {
    s.setItem(CONSENT_KEY,typeof bad==="string"?bad:JSON.stringify(bad));
    assert.equal(readConsent(s,now),null);
  }
});
test("blocked browser storage must not block consent or withdraw",()=>{
  const denied={getItem(){throw Error("denied")},setItem(){throw Error("denied")},removeItem(){throw Error("denied")}};
  const m=createConsentManager({preferenceStorage:denied,campaignStorage:denied,collectionEnabled:true});
  m.accept(); assert.equal(m.canCollect,true); m.withdraw(); assert.equal(m.canCollect,false);
});
