// Build from the genuine menu source. Fails closed on source-layout drift.
// Only the local pilot's in-memory compiled bundle is changed.
export function patchFeed(source){
 function replace(a,b){if(source.split(a).length!==2)throw Error("Pilot hook no longer unique: "+a.slice(0,55));source=source.replace(a,b)}
 replace('import { createFeedEngagement } from "./src/menu-feed-engagement.js";','import { createFeedEngagement } from "./src/menu-feed-engagement.js";\nimport { installPilot, wrapEngagement } from "./scripts/biteos-pilot-browser.mjs";');
 replace('const engagement = createFeedEngagement({ validIds, onChange: updateEngagement });','const biteosPilot = installPilot({catalogIds:[...validIds],language,href:location.href,referrer:document.referrer});\nconst engagement = wrapEngagement(createFeedEngagement({ validIds, onChange: updateEngagement }),biteosPilot);\nlet pilotShareId=null,pilotShareStamp=null;');
 replace('const result = await order.addProduct(product.id, variant, trigger);','const pilotCartStamp=biteosPilot.current();\n    const result = await order.addProduct(product.id, variant, trigger);\n    if(result.applied)biteosPilot.record("cart_add",product.id,null,pilotCartStamp);');
 replace('function openShareFallback(product, trigger) {','function openShareFallback(product, trigger, stamp) {\n  pilotShareId=product.id;pilotShareStamp=stamp;');
 replace('  if (sharing) return;\n  order.cancelPending();','  if (sharing) return;\n  const pilotStamp=biteosPilot.current();biteosPilot.record("share_intent",product.id,null,pilotStamp);\n  order.cancelPending();');
 replace('url: feedShareUrl(location.href, product.id, language) }); }','url: feedShareUrl(location.href, product.id, language) }); biteosPilot.record("share_completed",product.id,null,pilotStamp); }');
 replace('if (error?.name !== "AbortError") openShareFallback(product, trigger);','if (error?.name !== "AbortError") openShareFallback(product, trigger,pilotStamp);');
 replace('} else openShareFallback(product, trigger);','} else openShareFallback(product, trigger,pilotStamp);');
 replace('    await navigator.clipboard.writeText($("#feed-share-url").value);','    const id=pilotShareId,stamp=pilotShareStamp;\n    await navigator.clipboard.writeText($("#feed-share-url").value);\n    if(id)biteosPilot.record("share_completed",id,null,stamp);');
 return source;
}
