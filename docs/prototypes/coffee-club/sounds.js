import {menuCategories} from "../../../menu-catalog.js";
import {feedProducts} from "../../../src/menu-feed-model.js";
import {feedProductUrl} from "../../../src/menu-feed-navigation.js";
import {moods,languages,musicStyles,layouts,livingContext} from "./sounds-model.mjs";
import {createLookStore,defaultLook} from "./sounds-look.mjs";
const copy={"title":["Kendi anını seç.","Find your moment.","Выбери свой момент"],"notice":["Atmosfer önizlemesi. Müzik çalmaz.","Atmosphere preview. No music playback.","Демо атмосферы. Музыка не воспроизводится."],"pair":["Kahve önerisi","From the menu","Кофейная рекомендация"],"inspect":["Menüde incele","View in menu","Посмотреть в меню"],"pairNote":["Editoryal öneri; stok doğrulanmadı.","Editorial suggestion; stock is not verified.","Подбор по настроению; наличие не подтверждено."],"providers":["Müzik servisleri","Music services","Музыкальные сервисы"],"rights":["Bağlantılar henüz etkin değil. İzinler bekleniyor.","Not connected. Permissions pending.","Пока не подключены. Ожидаем разрешения."],"menu":["Menüyü aç","Open menu","Открыть меню"]};
Object.assign(copy,{"musicTaste":["Müzik tarzın","Your music style","Музыкальный вкус"],"explicit":["Sadece kendi seçimin kullanılır; telefon uygulamaları okunmaz.","Only your choice is used; phone apps are not read.","Только твой выбор. Запущенные приложения не считываются."],"layout":["Menü görünümü","Menu presentation","Стиль просмотра"],"shelf":["Diğer anlar","Other coffee moments","Другие кофейные моменты"],"reset":["Seçimleri sıfırla","Reset choices","Сбросить настройки"]});
Object.assign(copy,{"myLook":["Benim Roby’s görünümüm","My Roby’s look","Мой стиль Roby’s"],"lookPrivacy":["İstersen yalnızca seçtiğin üç ayarı bu tarayıcıda 30 gün kullanmak üzere kaydet. Ortak cihazlarda kaydetmeyebilirsin. Sıfırlama yalnızca ekrandaki seçimleri değiştirir.","Optionally save only your three choices for 30 days in this browser. Avoid saving on shared devices. Reset changes current choices only.","По желанию сохрани только три выбранные настройки в этом браузере на 30 дней. На общем устройстве лучше не сохранять. Сброс меняет только текущий вид."],"saveLook":["Bu cihazda kaydet","Save on this device","Запомнить на устройстве"],"forgetLook":["Kayıtlı görünümü sil","Forget saved look","Забыть сохранённый стиль"],"saved":["Görünüm kaydedildi.","Look saved.","Стиль сохранён."],"restored":["Kayıtlı görünüm yüklendi.","Saved look restored.","Твой стиль восстановлен."],"forgotten":["Kayıtlı görünüm silindi.","Saved look removed.","Сохранённый стиль удалён."],"currentReset":["Geçerli seçimler sıfırlandı; kayıt değişmedi.","Current choices reset; saved look unchanged.","Текущий вид сброшен, сохранённый стиль не изменён."],"storageError":["Cihaz depolamasına erişilemedi.","Device storage unavailable.","Хранилище устройства недоступно."]});
const products=feedProducts(menuCategories),root=new URL("../../../",location.href),q=id=>document.getElementById(id);
const lookStore=createLookStore(()=>window.localStorage);
const initial=lookStore.load(),look=initial.look??defaultLook;
let lang="tr",selected=look.mood,music=look.music,layout=look.layout;
let lookStatus=initial.ok?(initial.look?"restored":null):"storageError";
function resetCurrent(){selected=defaultLook.mood;music=defaultLook.music;layout=defaultLook.layout;}
const requested=new URL(location.href).searchParams.get("lang");
if(languages.includes(requested))lang=requested;
const text=values=>values[languages.indexOf(lang)];
function render(){
 document.documentElement.lang=lang;
 q("look-status").textContent=lookStatus?text(copy[lookStatus]):"";
 document.querySelectorAll("[data-copy]").forEach(el=>el.textContent=text(copy[el.dataset.copy]));
 document.querySelectorAll("[data-lang]").forEach(el=>el.setAttribute("aria-pressed",String(el.dataset.lang===lang)));
 const result=livingContext({mood:selected,music,layout},products);
 document.body.dataset.mood=result.mood.id;
 document.body.dataset.music=music;
 document.body.dataset.layout=layout;
 q("mood-title").textContent=text(result.mood.name);q("mood-description").textContent=music==="auto"?text(result.mood.description):text(result.style.name);
 for(const btn of q("moods").children){const m=moods.find(x=>x.id===btn.dataset.mood);btn.textContent=text(m.name);btn.setAttribute("aria-pressed",String(m.id===selected));}
 for(const [id,options,active] of [["music-styles",musicStyles,music],["layouts",layouts,layout]]){
  for(const btn of q(id).children){btn.textContent=text(options.find(x=>x.id===btn.dataset.choice).name);btn.setAttribute("aria-pressed",String(btn.dataset.choice===active));}
 }
 const cards=result.shelf.map(({mood,product})=>{
  const a=document.createElement("a");a.className="shelf-card";a.href=feedProductUrl(new URL("menu-feed.html",root).href,product.id,lang);
  const img=document.createElement("img");img.alt="";img.loading="lazy";img.width=180;img.height=180;img.src=new URL(product.image,root).href;
  const label=document.createElement("span");label.className="shelf-label";label.textContent=text(mood.name);
  const name=document.createElement("strong");name.textContent=product.item.name[lang]??product.item.name.tr;
  const detail=document.createElement("div");detail.append(label,name);a.append(img,detail);return a;
 });
 q("shelf").replaceChildren(...cards);
 q("pair").hidden=!result.product;
 if(result.product){q("pair-name").textContent=result.product.item.name[lang]??result.product.item.name.tr;q("pair-image").src=new URL(result.product.image,root).href;q("pair-link").href=feedProductUrl(new URL("menu-feed.html",root).href,result.product.id,lang);}
 q("menu").href=new URL("menu.html?lang="+lang,root).href;
}
for(const m of moods){const btn=document.createElement("button");btn.type="button";btn.dataset.mood=m.id;btn.addEventListener("click",()=>{selected=m.id;render()});q("moods").append(btn);}
for(const [id,options,set] of [["music-styles",musicStyles,v=>{music=v}],["layouts",layouts,v=>{layout=v}]]){
 for(const option of options){const btn=document.createElement("button");btn.type="button";btn.dataset.choice=option.id;btn.addEventListener("click",()=>{set(option.id);render()});q(id).append(btn);}
}
q("save-context").addEventListener("click",()=>{lookStatus=lookStore.save({mood:selected,music,layout})?"saved":"storageError";render()});
q("reset-context").addEventListener("click",()=>{resetCurrent();lookStatus="currentReset";render()});
q("forget-context").addEventListener("click",()=>{const ok=lookStore.forget();resetCurrent();lookStatus=ok?"forgotten":"storageError";render()});
document.querySelectorAll("[data-lang]").forEach(btn=>btn.addEventListener("click",()=>{lang=btn.dataset.lang;render()}));
render();
