// Planning-only registry. No browser hook, storage, network or collection.
import { classifyEntry } from "./biteos-pilot-contract.mjs";

const base = "https://safal207.github.io/robys-coffee-house-demo/menu-feed.html";
const rows = [
  ["google-profile", "google", "search", "profile", "business_profile", "tr", true, "acquisition"],
  ["yandex-profile", "yandex", "organic", "profile", "business_profile", "ru", false, "acquisition"],
  ["tg-gazipasa-live", "telegram", "messaging", "post", "gazipasa_live", "ru", true, "acquisition"],
  ["tg-gazipasa-online", "telegram", "messaging", "post", "gazipasa_online", "ru", true, "acquisition"],
  ["tg-gazipasa-chat", "telegram", "messaging", "post", "gazipasa_chat", "ru", true, "acquisition"],
  ["tg-alanya-region", "telegram", "messaging", "post", "alanya_region", "ru", true, "acquisition"],
  ["instagram-bio", "instagram", "social", "profile", "bio", "tr", true, "acquisition"],
  ["partner-qr-01", "partner", "referral", "pilot", "partner_01", "en", true, "acquisition"],
  ["table-qr-01", "table_qr", "qr", "table", "table_01", "tr", true, "on-premise"]
];
export const placements = Object.freeze(rows.map(([id,source,medium,campaign,content,language,v1Compatible,purpose]) =>
  Object.freeze({id,source,medium,campaign,content,language,v1Compatible,purpose})));
export function planningLinks() {
  return placements.map(p => {
    const url = new URL(base);
    for (const [key,value] of Object.entries({lang:p.language,utm_source:p.source,utm_medium:p.medium,
      utm_campaign:p.campaign,utm_content:p.content})) url.searchParams.set(key,value);
    const legacy = classifyEntry(url.href);
    if (p.v1Compatible && (legacy.source!==p.source || legacy.medium!==p.medium || legacy.campaign!==p.campaign))
      throw Error("Campaign contract drift");
    return {...p,url:url.href,legacySource:legacy.source,legacyPlacementSupported:false,
      status:"planned-not-published",collectionEnabled:false};
  });
}
// Local QA only: an exact registry match; not a verified referral or visit.
export function matchPlannedLink(href) {
  let u; try { u = new URL(href); } catch { return null; }
  const canonical = new URL(base);
  if (u.origin!==canonical.origin || u.pathname!==canonical.pathname || u.username || u.password || u.hash) return null;
  const keys = ["lang","utm_source","utm_medium","utm_campaign","utm_content"];
  if ([...u.searchParams.keys()].length!==keys.length || keys.some(k=>u.searchParams.getAll(k).length!==1)) return null;
  const match = placements.find(p=>u.searchParams.get("lang")===p.language &&
    u.searchParams.get("utm_source")===p.source && u.searchParams.get("utm_medium")===p.medium &&
    u.searchParams.get("utm_campaign")===p.campaign && u.searchParams.get("utm_content")===p.content);
  return match ? {...match,verifiedReferrer:false,collectionEnabled:false} : null;
}
