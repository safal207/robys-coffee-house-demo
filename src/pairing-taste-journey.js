// Progressive enhancement for the existing pairing story. No second cart, public
// popularity counts, automatic likes, background tracking or compulsory sharing.
const tasteJourneyCss = document.createElement("link");
tasteJourneyCss.rel = "stylesheet";
tasteJourneyCss.href = "pairing-taste-journey.css?v=a6929261e393";
document.head.append(tasteJourneyCss);
const COPY = {
  ru: {
    progress:"Вкусов открыто",views:"Твои просмотры",like:"Нравится",
    shareTitle:"С кем бы ты попробовал этот вкус?",
    shareLead:"Можешь отправить сочетание другу — или просто продолжить.",
    share:"Поделиться с другом",skip:"Пропустить",
    orderQuestion:"Хочешь попробовать эту пару?",direct:"Сразу выбрать пару",
    copySuccess:"Ссылка скопирована. Теперь её можно отправить другу.",
    copyError:"Не получилось скопировать. Выдели ссылку или пропусти шаг.",
    link:"Ссылка на сочетание",feedback:"",
    choose:"Выбрать эту пару"
  },
  en: {
    progress:"Tastes discovered",views:"Your views",like:"Like",
    shareTitle:"Who would you try this taste with?",
    shareLead:"Send this pairing to a friend, or simply continue.",
    share:"Share with a friend",skip:"Not now",
    orderQuestion:"Want to try this pairing?",direct:"Choose the pair now",
    copySuccess:"Link copied. You can send it to a friend.",
    copyError:"Could not copy. Select the link or skip this step.",
    link:"Pairing link",feedback:"",
    choose:"Choose this pairing"
  },
  tr: {
    progress:"Keşfedilen lezzet",views:"Kendi görüntülemelerin",like:"Beğen",
    shareTitle:"Bu lezzeti kiminle denemek istersin?",
    shareLead:"Eşleşmeyi arkadaşına gönder veya doğrudan devam et.",
    share:"Arkadaşınla paylaş",skip:"Şimdi değil",
    orderQuestion:"Bu ikiliyi denemek ister misin?",direct:"İkiliyi hemen seç",
    copySuccess:"Bağlantı kopyalandı. Arkadaşına gönderebilirsin.",
    copyError:"Bağlantı kopyalanamadı. Seçip kopyalayabilir veya geçebilirsin.",
    link:"Eşleşme bağlantısı",feedback:"",
    choose:"Bu eşleşmeyi seç"
  }
};
const KNOWN = new Set(["cool-lime-macaron","iced-san-sebastian"]);
const DISCOVERED_KEY = "robys-inline-discovered-pairings";
const LIKE_PREFIX = "robys-taste-liked-v1:";
const VIEW_PREFIX = "robys-taste-views-v1:";
const LOG_KEY = "robys-taste-path-trace.v1";
const localFallback = new Map();
const language = () => ["tr","en","ru"].includes(document.documentElement.lang)
  ? document.documentElement.lang : "tr";
function stored(key) {
  try { return localStorage.getItem(key); }
  catch { return localFallback.get(key) ?? null; }
}
function store(key,value) {
  localFallback.set(key,value);
  try { localStorage.setItem(key,value); } catch { /* memory-only fallback */ }
}
function discovered() {
  try {
    const arr = JSON.parse(stored(DISCOVERED_KEY)||"[]");
    return new Set(Array.isArray(arr) ? arr.filter(id=>KNOWN.has(id)) : []);
  } catch { return new Set(); }
}
function note(event,pair) {
  try {
    const previous = JSON.parse(sessionStorage.getItem(LOG_KEY)||"[]");
    const events = Array.isArray(previous) ? previous.slice(-49) : [];
    events.push({event,pair,at:new Date().toISOString(),origin:"personal-interaction"});
    sessionStorage.setItem(LOG_KEY,JSON.stringify(events));
  } catch { /* diagnostics are optional */ }
}
function views(pair) {
  const count = Number(stored(VIEW_PREFIX+pair));
  return Number.isSafeInteger(count)&&count>=0 ? Math.min(count,999999) : 0;
}
function shareUrl(pair) {
  const url = new URL("menu-grid.html",location.href);
  url.search = "";
  url.searchParams.set("view","grid");
  url.searchParams.set("lang",language());
  url.searchParams.set("pair",pair);
  url.hash = "";
  return url.href;
}
const element=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
function enhance(panel) {
  if(panel.dataset.tasteJourneyReady==="true")return;
  const pair=panel.dataset.pairingId;
  if(!KNOWN.has(pair))return;
  const text=COPY[language()];
  const choose=panel.querySelector(".pairing-discovery-choose");
  const oldMark=panel.querySelector(".pairing-discovery-mark");
  const actions=panel.querySelector(".pairing-discovery-actions");
  if(!choose||!actions)return;
  panel.dataset.tasteJourneyReady="true";
  oldMark?.remove();
  const found=discovered();
  found.add(pair);
  store(DISCOVERED_KEY,JSON.stringify([...found]));
  store(VIEW_PREFIX+pair,String(Math.min(views(pair)+1,999999)));
  note("taste_open",pair);

  const journey=element("section","pairing-journey");
  journey.setAttribute("aria-label",text.shareTitle);
  const stats=element("div","pairing-journey-stats");
  const progress=element("span","",`${text.progress}: ${found.size}/${KNOWN.size}`);
  const viewCount=element("span","",`${text.views}: ${views(pair)}`);
  stats.append(progress,viewCount);
  const like=element("button","pairing-journey-like",`♥  ${text.like}`);
  like.type="button";
  like.dataset.tasteAction="like";
  const updateLike=()=>like.setAttribute("aria-pressed",String(stored(LIKE_PREFIX+pair)==="1"));
  updateLike();
  like.addEventListener("click",()=>{
    const on=like.getAttribute("aria-pressed")!=="true";
    store(LIKE_PREFIX+pair,on?"1":"0");
    updateLike();
    note(on?"taste_like":"taste_unlike",pair);
  });
  const controls=element("div","pairing-journey-controls");
  const h4=element("h4","pairing-journey-question",text.shareTitle);
  const lead=element("p","pairing-journey-lead",text.shareLead);
  const buttons=element("div","pairing-journey-buttons");
  const share=element("button","button pairing-journey-share",text.share);
  share.type="button";share.dataset.tasteAction="share";
  const skip=element("button","button pairing-journey-skip",text.skip);
  skip.type="button";skip.dataset.tasteAction="skip";
  const status=element("p","pairing-journey-status","");
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  const fallback=element("label","pairing-journey-fallback",text.link);
  const input=element("input","pairing-journey-url");
  input.type="text";input.readOnly=true;input.value=shareUrl(pair);
  input.addEventListener("focus",()=>input.select());
  fallback.append(input);
  fallback.hidden=true;
  let stage="share",sharing=false;
  function showOffer(focus=false){
    stage="offer";
    h4.textContent=text.orderQuestion;
    lead.hidden=true;
    buttons.hidden=true;
    fallback.hidden=true;
    choose.textContent=text.choose;
    choose.classList.remove("pairing-journey-direct");
    note("pair_offer_reached",pair);
    if(focus)choose.focus({preventScroll:true});
  }
  choose.textContent=text.direct;
  choose.classList.add("pairing-journey-direct");
  choose.addEventListener("click",()=>note(stage==="share"?"pair_direct_choice":"pair_offer_choice",pair));
  skip.addEventListener("click",()=>{
    note("pair_share_skipped",pair);
    showOffer(true);
  });
  share.addEventListener("click",async()=>{
    if(sharing)return;
    sharing=true;share.disabled=true;
    note("pair_share_requested",pair);
    const url=shareUrl(pair);
    if(typeof navigator.share==="function"){
      try {
        await navigator.share({title:panel.querySelector(".pairing-discovery-heading h3")?.textContent||"Roby's",url});
        note("pair_share_sheet_completed",pair);
        status.textContent="";
        showOffer(true);
        return;
      }catch(error){
        if(error?.name==="AbortError"){
          note("pair_share_cancelled",pair);
          return;
        }
      }finally{sharing=false;share.disabled=false}
    }
    try {
      if(!navigator.clipboard?.writeText)throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(url);
      status.textContent=text.copySuccess;
      note("pair_link_copied",pair);
      showOffer(true);
    }catch{
      status.textContent=text.copyError;
      fallback.hidden=false;
      input.value=url;
      note("pair_link_fallback",pair);
    }finally{sharing=false;share.disabled=false}
  });
  buttons.append(share,skip);
  controls.append(h4,lead,buttons,status,fallback);
  journey.append(stats,like,controls);
  // The existing order action remains clickable from the first moment.
  panel.insertBefore(journey,actions);
}
const root=document.querySelector("#menu-root");
if(root) {
  let queued=false,deepLinkOpened=false;
  const requested=new URLSearchParams(location.search).get("pair");
  function update(){
    queued=false;
    root.querySelectorAll(".pairing-discovery-panel").forEach(enhance);
    if(!deepLinkOpened&&KNOWN.has(requested)) {
      const card=Array.from(root.querySelectorAll(".pairing-poster-card[data-pairing]"))
        .find(node=>node.dataset.pairing===requested);
      const trigger=card?.querySelector(".full-menu-item-media[data-discover-pairing]");
      if(trigger){
        deepLinkOpened=true;
        trigger.click(); // existing click handler owns focus and the order dialog
      }
    }
  }
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(update);
  };
  const observer=new MutationObserver(schedule);
  observer.observe(root,{subtree:true,childList:true});
  schedule();
}
