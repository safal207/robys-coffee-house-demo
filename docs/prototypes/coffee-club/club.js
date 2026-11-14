import { menuCategories } from "../../../menu-catalog.js";
import { feedProducts } from "../../../src/menu-feed-model.js";
import { createFeedEngagement } from "../../../src/menu-feed-engagement.js";
import { feedProductUrl } from "../../../src/menu-feed-navigation.js";
import { createPassport, passportIds, personalSections } from "./club-model.mjs";

const copy = {
  "demo": [
    "Demo · Hesap, ödeme, abonelik ve gerçek ödül yok.",
    "Demo · No account, payment, subscription or real rewards.",
    "Демо · Без аккаунта, оплаты, подписки и реальных бонусов."
  ],
  "hello": [
    "Kahveyle güzel anlar.",
    "Good moments, good coffee.",
    "Твои моменты с Roby’s."
  ],
  "intro": [
    "Favorilerine dön, yeni tatlar keşfet.",
    "Return to your favorites and discover new flavors.",
    "Возвращайся к любимым вкусам и открывай новые."
  ],
  "menu": [
    "Menüyü gör",
    "Explore menu",
    "Посмотреть меню"
  ],
  "favorites": [
    "Favorilerim",
    "My favorites",
    "Избранное"
  ],
  "favoriteNote": [
    "Menüdeki beğenilerin, bu tarayıcıda.",
    "Your menu likes, on this browser.",
    "Твои лайки из меню в этом браузере."
  ],
  "emptyFavorites": [
    "Henüz favorin yok.",
    "No favorites yet.",
    "Пока нет избранного."
  ],
  "feed": [
    "Fotoğraflı menüyü aç",
    "Open photo feed",
    "Открыть фотоленту"
  ],
  "passport": [
    "Kahve pasaportum",
    "My coffee passport",
    "Кофейный паспорт"
  ],
  "passportNote": [
    "Kendi tadım işaretlerin; satın alma veya ödül kanıtı değildir.",
    "Personal tasting marks, not proof of purchases or rewards.",
    "Личные отметки о дегустациях, не подтверждение покупок или бонусов."
  ],
  "milestone": [
    "Beş tadı keşfettin!",
    "Five flavors explored!",
    "Пять вкусов открыты!"
  ],
  "reset": [
    "Tadım işaretlerini temizle",
    "Clear tasting marks",
    "Очистить отметки дегустаций"
  ],
  "seen": [
    "Daha önce baktıklarım",
    "Previously viewed",
    "Ты уже смотрел"
  ],
  "seenNote": [
    "Bu liste görüntülemeleri gösterir, sipariş geçmişi değildir.",
    "This is browsing activity, not purchase history.",
    "Это просмотры, не история покупок."
  ],
  "emptySeen": [
    "Henüz görüntüleme yok.",
    "Nothing viewed yet.",
    "Пока нет просмотренных позиций."
  ],
  "choice": [
    "Seçmeme yardım et",
    "Help me choose",
    "Помочь выбрать"
  ],
  "stories": [
    "Kahve hikâyeleri",
    "Coffee stories",
    "Кофейные истории"
  ],
  "storyTitle": [
    "Kahve ve tatlı molası",
    "A coffee and dessert break",
    "Пауза для кофе и десерта"
  ],
  "story": [
    "Menüdeki eşleşmeleri keşfet.",
    "Discover pairings from the menu.",
    "Открой готовые сочетания из нашего меню."
  ],
  "pairings": [
    "Kahve + tatlı fikirleri",
    "Coffee + dessert ideas",
    "Кофе + десерт"
  ],
  "membership": [
    "Kulüp üyeliği",
    "Club membership",
    "Участие в клубе"
  ],
  "future": [
    "E-posta, bildirimler ve ödüller daha sonra, kafe onayı ile.",
    "Email, push and rewards are future features, subject to café approval.",
    "Email, push и бонусы — следующий этап после согласования с кафе."
  ],
  "noConsent": [
    "Bu demo kişisel veri toplamaz veya mesaj göndermez.",
    "This demo collects no personal data or sends messages.",
    "Демо не собирает персональные данные и не отправляет сообщения."
  ],
  "taste": [
    "Denedim",
    "Tasted",
    "Попробовал"
  ],
  "storage": [
    "Tarayıcı kaydı kullanılamıyor; bazı seçimler yalnızca bu oturum için geçerli.",
    "Browser storage unavailable; some choices are session-only.",
    "Хранилище браузера недоступно; некоторые отметки сохраняются только в сессии."
  ]
};
const products = feedProducts(menuCategories);
const byId = new Map(products.map(p => [p.id,p]));
const validIds = new Set(byId.keys());
const q = id => document.getElementById(id);
const root = new URL("../../../", location.href);
let lang = "tr";
try { const stored = localStorage.getItem("robys-language"); if (["tr","en","ru"].includes(stored)) lang = stored; } catch {}
const passport = createPassport(() => localStorage);
const engagement = createFeedEngagement({validIds, onChange: () => renderPersonal()});
const t = key => copy[key][["tr","en","ru"].indexOf(lang)];
const link = id => feedProductUrl(new URL("menu-feed.html",root).href,id,lang);
function renderCard(product, tasting = false) {
  const card = document.createElement("article");
  card.className = "product";
  const img = document.createElement("img");
  img.alt = ""; img.loading = "lazy"; img.width=72; img.height=72;
  img.src = new URL(product.image,root).href;
  const detail = document.createElement("div");
  const a = document.createElement("a");
  a.href=link(product.id); a.textContent=product.item.name[lang] ?? product.item.name.tr;
  detail.append(a);
  if (tasting) {
    const button = document.createElement("button"); button.type="button";
    button.textContent=t("taste"); button.setAttribute("aria-label", t("taste")+": "+a.textContent);
    const refresh=()=>button.setAttribute("aria-pressed",String(passport.has(product.id)));
    refresh();
    button.addEventListener("click",()=>{passport.set(product.id,!passport.has(product.id));refresh();renderProgress();});
    detail.append(button);
  }
  card.append(img,detail); return card;
}
function renderPersonal() {
  const sections=personalSections(products,engagement);
  for (const key of ["favorites","seen"]) {
    q(key).replaceChildren(...sections[key].map(item=>renderCard(item)));
    q("empty-"+key).hidden=sections[key].length>0;
  }
  renderProgress();
}
function renderProgress() {
  q("count").textContent=passport.count()+" / "+passportIds.length;
  q("progress").value=passport.count();
  q("milestone").hidden=passport.count()!==passportIds.length;
  q("status").textContent=passport.persistent&&engagement.persistent?"":t("storage");
}
function renderPassport() {
  q("passport").replaceChildren(...passportIds.map(id=>byId.get(id)).filter(Boolean).map(p=>renderCard(p,true)));
  renderProgress();
}
function render() {
  document.documentElement.lang=lang;
  document.querySelectorAll("[data-copy]").forEach(el=>el.textContent=t(el.dataset.copy));
  document.querySelectorAll("[data-lang]").forEach(el=>el.setAttribute("aria-pressed",String(el.dataset.lang===lang)));
  q("menu").href=new URL("menu.html?lang="+lang,root).href;
  q("feed").href=new URL("menu-feed.html?lang="+lang,root).href;
  q("choice").href=new URL("smart-choice/?lang="+lang,root).href;
  q("pairings").href=new URL("menu.html?lang="+lang+"#pairing-offers",root).href;
  renderPersonal(); renderPassport();
}
document.querySelectorAll("[data-lang]").forEach(btn=>btn.addEventListener("click",()=>{lang=btn.dataset.lang;render();}));
q("reset").addEventListener("click",()=>{passport.clear();renderPassport();});
window.addEventListener("storage",event=>{
  if (event.key===null||event.key.startsWith("robys-feed-")) engagement.sync(event.key);
  if (event.key===null||event.key.startsWith("robys-club-demo-tasted-v1:")) {passport.sync();renderPassport();}
});
window.addEventListener("pageshow",()=>{engagement.sync();passport.sync();renderPassport();});
render();
