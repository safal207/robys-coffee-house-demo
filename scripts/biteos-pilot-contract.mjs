// Local opt-in measurement contract; no network, browser storage or automatic collection.
const sourceMap=Object.freeze({instagram:"social",whatsapp:"messaging",telegram:"messaging",google_maps:"maps",google:"search",table_qr:"qr",window_qr:"qr",partner:"referral",shared_product:"referral",unknown:"unknown",other_referral:"referral"});
const campaigns=new Set(["menu","profile","story","post","table","window","product_share","pilot"]);
const productActions=new Set(["product_view","product_like","product_unlike","share_intent","share_completed","cart_add"]);
const otherActions=new Set(["landing","last_activity","route_click","checkout_handoff","smart_choice_start","recommendation_selected","bump_shown","bump_accepted"]);
const areas=new Set(["hero","menu","product_card","favorite","cart","share","visit","smart_choice"]);
const langs=new Set(["tr","ru","en"]);
const validProduct=s=>typeof s==="string"&&s.length<=100&&/^[a-z0-9-]+:[a-z0-9-]+$/.test(s);
const validSession=s=>typeof s==="string"&&/^[a-f0-9]{32}$/.test(s);
const own=(o,k)=>Object.hasOwn(o,k);
const at=(source,campaign=null)=>({source,medium:sourceMap[source],campaign});
export function classifyEntry(href,referrer=""){
 const url=new URL(href),s=url.searchParams.get("utm_source"),m=url.searchParams.get("utm_medium"),c=url.searchParams.get("utm_campaign");
 if(own(sourceMap,s)&&!["unknown","other_referral"].includes(s)&&m===sourceMap[s]&&campaigns.has(c))return at(s,c);
 if(!referrer)return at("unknown");
 let ref;try{ref=new URL(referrer)}catch{return at("unknown")}
 if(!["https:","http:"].includes(ref.protocol)||ref.origin===url.origin)return at("unknown");
 const host=ref.hostname.toLowerCase(),is=d=>host===d||host.endsWith("."+d);
 if(is("instagram.com"))return at("instagram");
 if(is("whatsapp.com")||is("wa.me"))return at("whatsapp");
 if(is("telegram.org")||is("t.me"))return at("telegram");
 if(is("maps.google.com")||is("maps.app.goo.gl")||is("google.com")&&/^\/maps(?:\/|$)/.test(ref.pathname))return at("google_maps");
 if(is("google.com")||is("google.com.tr")||is("google.ru"))return at("google");
 return at("other_referral");
}
export function campaignLink({source,campaign,language="tr",productId=null}){
 if(!own(sourceMap,source)||["unknown","other_referral"].includes(source)||!campaigns.has(campaign)||!langs.has(language)||productId!==null&&!validProduct(productId))throw Error("Invalid campaign");
 // Direct product feed link: existing static OG share page drops incoming UTM on redirect.
 const url=new URL("https://safal207.github.io/robys-coffee-house-demo/menu-feed.html");
 url.searchParams.set("lang",language);if(productId)url.searchParams.set("item",productId);
 url.searchParams.set("utm_source",source);url.searchParams.set("utm_medium",sourceMap[source]);url.searchParams.set("utm_campaign",campaign);
 return url.href;
}
export function createSession({consent,sessionId,href,referrer="",language="tr",catalogIds,clock=()=>new Date().toISOString()}){
 if(consent!==true)return null;
 if(!validSession(sessionId)||!langs.has(language)||!Array.isArray(catalogIds)||!catalogIds.every(validProduct))throw Error("Invalid session");
 const catalog=new Set(catalogIds),entry=classifyEntry(href,referrer),events=[];let enabled=true;
 function record(action,productId=null,area=null){
  if(!enabled||events.length>=256||(!productActions.has(action)&&!otherActions.has(action)&&action!=="area_click")||productActions.has(action)!==(productId!==null)||productId!==null&&!catalog.has(productId)||(action==="area_click")!==(area!==null)||area!==null&&!areas.has(area))return false;
  if(action==="landing"&&events.length||action==="product_view"&&events.some(e=>e.action===action&&e.productId===productId))return false;
  events.push({schema:"robys.engagement.v1",sessionId,sequence:events.length+1,occurredAt:clock(),language,...entry,action,productId,area});return true;
 }
 record("landing");
 return {record,export:()=>events.map(e=>({...e})),withdraw:()=>{enabled=false;events.length=0}};
}
