import {createSession} from "./biteos-pilot-contract.mjs";

// Invoked only by the loopback pilot bundle. Explicit opt-in per page.
export function installPilot({catalogIds,language,href,referrer,doc=document,random=()=>crypto.randomUUID().replaceAll("-",""),clock=()=>new Date().toISOString()}){
 let session=null;
 const labels={
  tr:["Yerel analiz testi","Anonim test olaylarını kaydet","Kaydı durdur ve sil","JSON dışa aktar","Yalnızca bu sekme. Sunucuya gönderilmez."],
  ru:["Локальный тест аналитики","Включить запись тестовых событий","Остановить и удалить","Экспорт JSON","Только эта вкладка. Данные не отправляются на сервер."],
  en:["Local analytics test","Enable test-event recording","Stop and erase","Export JSON","This tab only. No server transmission."]
 };
 const l=labels[language]??labels.tr;
 const panel=doc.createElement("section");panel.setAttribute("aria-label",l[0]);
 const title=doc.createElement("strong");title.textContent=l[0];
 const note=doc.createElement("p");note.textContent=l[4];
 const make=text=>{const b=doc.createElement("button");b.type="button";b.textContent=text;return b};
 const enable=make(l[1]),disable=make(l[2]),download=make(l[3]);disable.disabled=true;download.disabled=true;
 panel.append(title,note,enable,disable,download);doc.body.prepend(panel);
 enable.addEventListener("click",()=>{if(session)return;try{session=createSession({consent:true,sessionId:random(),href,referrer,language,catalogIds,clock});enable.disabled=true;disable.disabled=false;download.disabled=false}catch{}});
 disable.addEventListener("click",()=>{session?.withdraw();session=null;enable.disabled=false;disable.disabled=true;download.disabled=true});
 download.addEventListener("click",()=>{
  if(!session)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(session.export(),null,2)],{type:"application/json"}));
  const a=doc.createElement("a");a.href=url;a.download="robys-pilot-events.json";doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 return {current:()=>session,record(action,id=null,area=null,stamp=session){try{return !!stamp&&stamp===session&&stamp.record(action,id,area)}catch{return false}}};
}
export function wrapEngagement(model,pilot){
 return {...model,
  recordView(id){const before=model.hasViewedThisVisit(id);const stamp=pilot.current();const result=model.recordView(id);if(!before&&model.hasViewedThisVisit(id))pilot.record("product_view",id,null,stamp);return result},
  setLiked(id,selected){const stamp=pilot.current();const changed=model.setLiked(id,selected);if(changed)pilot.record(selected?"product_like":"product_unlike",id,null,stamp);return changed}
 };
}
