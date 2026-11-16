import {menuCategories} from "../../../menu-catalog.js";
import {feedProducts} from "../../../src/menu-feed-model.js";
import {feedProductUrl} from "../../../src/menu-feed-navigation.js";
import {moods,languages,resolveMood} from "./sounds-model.mjs";
const copy={"title":["Kendi anını seç.","Find your moment.","Выбери свой момент"],"notice":["Atmosfer önizlemesi. Müzik çalmaz.","Atmosphere preview. No music playback.","Демо атмосферы. Музыка не воспроизводится."],"pair":["Kahve önerisi","From the menu","Кофейная рекомендация"],"inspect":["Menüde incele","View in menu","Посмотреть в меню"],"pairNote":["Editoryal öneri; stok doğrulanmadı.","Editorial suggestion; stock is not verified.","Подбор по настроению; наличие не подтверждено."],"providers":["Müzik servisleri","Music services","Музыкальные сервисы"],"rights":["Bağlantılar henüz etkin değil. İzinler bekleniyor.","Not connected. Permissions pending.","Пока не подключены. Ожидаем разрешения."],"menu":["Menüyü aç","Open menu","Открыть меню"]};
const products=feedProducts(menuCategories),root=new URL("../../../",location.href),q=id=>document.getElementById(id);
let lang="tr",selected="morning";
const requested=new URL(location.href).searchParams.get("lang");
if(languages.includes(requested))lang=requested;
const text=values=>values[languages.indexOf(lang)];
function render(){
 document.documentElement.lang=lang;
 document.querySelectorAll("[data-copy]").forEach(el=>el.textContent=text(copy[el.dataset.copy]));
 document.querySelectorAll("[data-lang]").forEach(el=>el.setAttribute("aria-pressed",String(el.dataset.lang===lang)));
 const result=resolveMood(selected,products);
 document.body.dataset.mood=result.mood.id;
 q("mood-title").textContent=text(result.mood.name);q("mood-description").textContent=text(result.mood.description);
 for(const btn of q("moods").children){const m=moods.find(x=>x.id===btn.dataset.mood);btn.textContent=text(m.name);btn.setAttribute("aria-pressed",String(m.id===selected));}
 q("pair").hidden=!result.product;
 if(result.product){q("pair-name").textContent=result.product.item.name[lang]??result.product.item.name.tr;q("pair-image").src=new URL(result.product.image,root).href;q("pair-link").href=feedProductUrl(new URL("menu-feed.html",root).href,result.product.id,lang);}
 q("menu").href=new URL("menu.html?lang="+lang,root).href;
}
for(const m of moods){const btn=document.createElement("button");btn.type="button";btn.dataset.mood=m.id;btn.addEventListener("click",()=>{selected=m.id;render()});q("moods").append(btn);}
document.querySelectorAll("[data-lang]").forEach(btn=>btn.addEventListener("click",()=>{lang=btn.dataset.lang;render()}));
render();
