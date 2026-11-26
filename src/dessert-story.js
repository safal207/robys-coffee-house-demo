// Roby's Chocolate Cake Stories. Source enhancement; delegates to existing cart/media actions.
import { createFeedEngagement } from "./menu-feed-engagement.js";
import { feedShareUrl } from "./menu-feed-navigation.js";
const PRODUCT_ID = "desserts:chocolate-cake";
const COPY = {
  tr: { open:"3 karede lezzet", previous:"Önceki kare", next:"Sonraki kare", close:"Kapat", title:"Çikolatalı Pasta", hint:"Sola kaydır", alt:["Çikolatalı pasta","Kaşık pastaya yaklaşıyor","İster misin?"] },
  en: { open:"3-frame taste story", previous:"Previous frame", next:"Next frame", close:"Close", title:"Chocolate Cake", hint:"Swipe left", alt:["Whole chocolate cake","Spoon approaching cake","Want some?"] },
  ru: { open:"История в 3 кадрах", previous:"Предыдущий кадр", next:"Следующий кадр", close:"Закрыть", title:"Шоколадный торт", hint:"Смахни влево", alt:["Целый шоколадный торт","Ложка приближается","Хочешь?"] }
};
const $ = (selector, root=document) => root.querySelector(selector);
const ASSETS = new URL("./products/stories/chocolate-cake/", import.meta.url);
const language = () => {
  const active = $(".feed-languages [data-lang][aria-pressed='true']") || $(".lang-button.active");
  const value = (active?.dataset.lang || active?.textContent || document.documentElement.lang || "tr").trim().toLowerCase();
  return Object.hasOwn(COPY, value) ? value : "tr";
};
const paths = locale => ["01.jpg", "02.jpg", "03-" + locale + ".jpg"].map(name => new URL(name, ASSETS).href);
const copy = () => COPY[language()];
const ACTIONS = {
  tr:{buy:"Tatmak istiyorum",like:"Beğen",unlike:"Beğeniyi kaldır",share:"Paylaş",copy:"Bağlantıyı kopyala",copied:"Bağlantı kopyalandı",link:"Ürün bağlantısı"},
  en:{buy:"I want to try it",like:"Like",unlike:"Unlike",share:"Share",copy:"Copy link",copied:"Link copied",link:"Product link"},
  ru:{buy:"Хочу попробовать",like:"Нравится",unlike:"Убрать лайк",share:"Поделиться",copy:"Скопировать ссылку",copied:"Ссылка скопирована",link:"Ссылка на десерт"}
};
const words=()=>ACTIONS[language()];
const mode=()=>$("#feed")?"feed":location.pathname.endsWith("/menu-grid.html")||document.body.classList.contains("menu-photo-grid")?"grid":"list";
// Aggregate counters only: no URLs, identifiers, timestamps, customer data,
// network export, cookies or durable cross-visit identity.
const EVENTS=["story_impression","story_swipe","story_advance","story_completed","story_like","story_share","story_buy_intent","story_add_to_cart","story_qr_created"];
const MODES=["feed","list","grid"], LOCALES=["tr","en","ru"], METRICS_KEY="robys-dessert-funnel.v1";
let counts={};
try{
  const raw=JSON.parse(sessionStorage.getItem(METRICS_KEY)||"{}");
  for(const view of MODES)for(const lang of LOCALES)for(const event of EVENTS){
    const key=view+":"+lang+":"+event,value=raw?.[key];
    if(Number.isSafeInteger(value)&&value>0&&value<=999999)counts[key]=value;
  }
}catch{}
function count(event,view=mode(),lang=language()){
  if(!EVENTS.includes(event)||!MODES.includes(view)||!LOCALES.includes(lang))return;
  const key=view+":"+lang+":"+event;
  counts[key]=Math.min(999999,(counts[key]||0)+1);
  try{sessionStorage.setItem(METRICS_KEY,JSON.stringify(counts));}catch{}
}
window.robysDessertStoryAnalytics=Object.freeze({snapshot:()=>({...counts})});
function action(className){const button=document.createElement("button");button.type="button";button.className=className;return button;}
let pending=null, confirmed=null;
function quantity(card){
  if(!card?.isConnected)return 0;
  const media=$(".full-menu-item-media",card);
  return Number.parseInt(media?.dataset.cartQuantity||$(".feed-selected",card)?.textContent||"0",10)||0;
}
function armPurchase(card){
  pending={card,before:quantity(card),view:mode(),lang:language(),until:performance.now()+15000,committed:false};
}
function checkPurchase(){
  if(!pending)return;
  if(performance.now()>pending.until||!pending.card.isConnected){pending=null;return;}
  if(pending.committed&&quantity(pending.card)>pending.before){
    count("story_add_to_cart",pending.view,pending.lang);
    confirmed={view:pending.view,lang:pending.lang};
    pending=null;
  }
}
window.addEventListener("robys:order-change",e=>{
  if(pending&&!e.detail?.remote&&e.detail?.origin){pending.committed=true;queueMicrotask(checkPurchase);}
});
let checkoutWatch=null, checkoutTimer=null;
function watchQr(){
  if(!confirmed)return;
  checkoutWatch?.disconnect();clearTimeout(checkoutTimer);
  const current=confirmed, name=COPY[current.lang].title;
  const check=()=>{
    const dialog=$(".order-checkout-dialog[open]");
    if(!dialog||!$(".order-ticket-qr",dialog)||!$(".order-ticket-lines",dialog)?.textContent.includes(name))return;
    count("story_qr_created",current.view,current.lang);
    confirmed=null;checkoutWatch?.disconnect();clearTimeout(checkoutTimer);
  };
  checkoutWatch=new MutationObserver(check);
  checkoutWatch.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]});
  checkoutTimer=setTimeout(()=>checkoutWatch?.disconnect(),15000);
  check();
}
document.addEventListener("click",e=>{if(e.target.closest("#menu-checkout-trigger"))watchQr();},true);
function exposure(img,index,seen,view){
  if(document.hidden||!img.isConnected||!img.complete||!img.naturalWidth)return;
  if(!seen.impression){seen.impression=true;count("story_impression",view);}
  if(index===2&&!seen.completed){seen.completed=true;count("story_completed",view);}
}
function decodedExposure(img,index,seen,view,isVisible){
  const src=img.src;
  const check=()=>{if(img.src===src&&isVisible())exposure(img,index,seen,view);};
  if(img.complete)check();else img.addEventListener("load",check,{once:true});
}
const dots = () => {
  const node = document.createElement("div");
  node.className = "dessert-story-dots";
  node.setAttribute("aria-hidden", "true");
  for (let i=0;i<3;i++) node.append(document.createElement("i"));
  return node;
};
function controller(img, progress, afterChange=()=>{}) {
  let index=0, origin=null;
  function show(next,via) {
    const previous=index;
    index=Math.max(0,Math.min(2,next));
    const lang=language();
    img.alt=COPY[lang].alt[index];
    img.src=paths(lang)[index];
    progress.querySelectorAll("i").forEach((item,n) => item.classList.toggle("active",n===index));
    afterChange(index,previous,via);
    return index;
  }
  const start = event => {
    if(event.isPrimary===false || (event.pointerType==="mouse" && event.button!==0) || event.target.closest("button,a")) return;
    origin={id:event.pointerId,x:event.clientX,y:event.clientY};
  };
  const end = event => {
    if(!origin || origin.id!==event.pointerId) return;
    const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
    origin=null;
    if(Math.abs(dx)>=36 && Math.abs(dx)>1.25*Math.abs(dy)) show(index+(dx<0?1:-1),"swipe");
  };
  return { show, start, end, cancel:()=>{origin=null}, get index(){return index} };
}
// Modal is shared between cards/grid and list. No nested buttons and no ordering side effects.
const modal=document.createElement("dialog");
modal.className="dessert-story-modal";
modal.id="dessert-story-modal";
// Trusted Types CSP: create real nodes, never assign HTML strings.
const makeNode=(tag,className,label)=>{
  const node=document.createElement(tag);node.className=className;
  if(label!==undefined)node.textContent=label;
  return node;
};
const top=makeNode("div","dessert-story-top");
const heading=makeNode("strong","");heading.id="dessert-story-title";modal.setAttribute("aria-labelledby",heading.id);
const dismiss=makeNode("button","dessert-story-close","×");dismiss.type="button";
top.append(heading,dismiss);
const frame=makeNode("div","dessert-story-image");
const frameImage=document.createElement("img");frameImage.alt="";frameImage.decoding="async";frameImage.draggable=false;
frame.append(frameImage);
const foot=makeNode("div","dessert-story-foot");
const previous=makeNode("button","dessert-story-prev","‹");previous.type="button";
const pagination=makeNode("div","dessert-story-progress");
const following=makeNode("button","dessert-story-next","›");following.type="button";
foot.append(previous,pagination,following);
const finale=makeNode("div","dessert-story-modal-finale");finale.hidden=true;
const buy=action("dessert-story-buy"), like=action("dessert-story-like"), share=action("dessert-story-share");
const price=makeNode("span","dessert-story-price");
const socials=makeNode("div","dessert-story-socials");socials.append(like,share);
const fallback=makeNode("div","dessert-story-share-fallback");fallback.hidden=true;
const link=document.createElement("input");link.type="text";link.readOnly=true;
const copyLink=action("dessert-story-copy"), shareStatus=makeNode("span","dessert-story-share-status");shareStatus.setAttribute("role","status");
fallback.append(link,copyLink,shareStatus);
finale.append(price,buy,socials,fallback);
modal.append(top,frame,foot,finale);
let modalSeen={}, modalRow=null, modalPurchase=null, delegatingModal=false;
const engagement=createFeedEngagement({validIds:[PRODUCT_ID],onChange:syncLike});
function syncLike(){
  const liked=engagement.hasLiked(PRODUCT_ID);
  like.setAttribute("aria-pressed",String(liked));
  like.textContent=liked?"♥ "+words().unlike:"♡ "+words().like;
  like.setAttribute("aria-label",liked?words().unlike:words().like);
}
function localizeActions(){
  buy.textContent=words().buy;share.textContent=words().share;
  link.setAttribute("aria-label",words().link);copyLink.textContent=words().copy;syncLike();
}
like.addEventListener("click",()=>{
  if(!modal.open||modalSlide.index!==2)return;
  engagement.sync();
  const next=!engagement.hasLiked(PRODUCT_ID);
  engagement.setLiked(PRODUCT_ID,next);if(next)count("story_like");
});
window.addEventListener("storage",e=>{if(modal.open)engagement.sync(e.key);});
function shareFallback(url){link.value=url;fallback.hidden=false;shareStatus.textContent="";link.focus();link.select();}
share.addEventListener("click",async()=>{
  if(!modal.open||modalSlide.index!==2||share.disabled)return;
  const url=feedShareUrl(location.href,PRODUCT_ID,language());
  count("story_share");share.disabled=true;
  try{
    if(typeof navigator.share==="function"){
      try{await navigator.share({title:copy().title+" · Roby's Coffee House",url});}
      catch(e){if(e?.name!=="AbortError"&&modal.open&&modalSlide.index===2)shareFallback(url);}
    }else shareFallback(url);
  }finally{share.disabled=false;}
});
copyLink.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(link.value);shareStatus.textContent=words().copied;}
  catch{link.focus();link.select();}
});
buy.addEventListener("click",()=>{
  const media=modalRow&&$(".full-menu-item-media",modalRow);
  if(!modal.open||modalSlide.index!==2||!media||media.disabled||!media.isConnected)return;
  count("story_buy_intent");modalPurchase=modalRow;
  modal._returnFocus=null;modal.close();
  delegatingModal=true;try{media.click();}finally{delegatingModal=false;}
});
document.addEventListener("click",e=>{
  if(e.target.closest(".full-menu-item-media")&&!delegatingModal)modalPurchase=null;
  if(e.target.closest("#menu-add-to-cart")&&modalPurchase){
    if($("#menu-product-dialog[open]")&&$("#menu-product-title")?.textContent.trim()===copy().title)armPurchase(modalPurchase);
    modalPurchase=null;
  }
},true);
document.addEventListener("close",e=>{if(e.target.id==="menu-product-dialog")modalPurchase=null;},true);
document.body.append(modal);
const modalProgress=dots();
$(".dessert-story-progress",modal).append(modalProgress);
const before=$(".dessert-story-prev",modal), after=$(".dessert-story-next",modal), close=$(".dessert-story-close",modal);
const stage=$(".dessert-story-image",modal);
const modalSlide=controller($("img",stage),modalProgress,(i,previous,via)=>{
  before.disabled=i===0;after.disabled=i===2;finale.hidden=i!==2;
  if(i!==2){fallback.hidden=true;shareStatus.textContent="";}
  if(modal.open&&i!==previous&&via){count(via==="swipe"?"story_swipe":"story_advance");}
  decodedExposure(frameImage,i,modalSeen,mode(),()=>modal.open&&modalSlide.index===i);
});
stage.addEventListener("pointerdown",modalSlide.start);
stage.addEventListener("pointerup",modalSlide.end);
stage.addEventListener("pointercancel",modalSlide.cancel);
function open(trigger) {
  if(document.querySelector("dialog[open]")) return;
  const words=copy();
  $(".dessert-story-top strong",modal).textContent=words.title;
  close.setAttribute("aria-label",words.close);
  before.setAttribute("aria-label",words.previous);
  after.setAttribute("aria-label",words.next);
  modal._returnFocus=trigger;
  modalRow=trigger.closest(".full-menu-item");modalPurchase=null;modalSeen={};fallback.hidden=true;
  price.textContent=modalRow?.querySelector(".full-menu-price")?.textContent||"";
  localizeActions();engagement.sync();
  modal.showModal();modalSlide.show(0);
  close.focus({preventScroll:true});
}
close.addEventListener("click",()=>modal.close());
before.addEventListener("click",()=>modalSlide.show(modalSlide.index-1,"button"));
after.addEventListener("click",()=>modalSlide.show(modalSlide.index+1,"button"));
modal.addEventListener("click",e=>{if(e.target===modal) modal.close();});
modal.addEventListener("close",()=>modal._returnFocus?.isConnected&&modal._returnFocus.focus({preventScroll:true}));
modal.addEventListener("keydown",e=>{
  if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();modalSlide.show(modalSlide.index+(e.key==="ArrowLeft"?1:-1),"keyboard");}
});
function injectFeed(card){
  if(card.querySelector(".dessert-story-feed")) return;
  const target=$(".feed-photo",card);
  if(!target) return;
  const layer=document.createElement("div");
  layer.className="dessert-story-feed";layer.tabIndex=0;layer.setAttribute("role","group");layer.setAttribute("aria-label",copy().title+" · "+copy().hint);
  const image=document.createElement("img");
  image.className="dessert-story-frame";image.loading="lazy";image.decoding="async";image.draggable=false;
  const backdrop=document.createElement("img");backdrop.className="dessert-story-backdrop";backdrop.alt="";backdrop.setAttribute("aria-hidden","true");backdrop.decoding="async";backdrop.draggable=false;backdrop.loading="lazy";
  const progress=dots(),hint=document.createElement("span"),next=document.createElement("button");
  hint.className="dessert-story-hint";
  next.type="button";next.className="dessert-story-forward";next.textContent="›";next.setAttribute("aria-label",copy().next);
  layer.append(backdrop,image,progress,hint,next);
  target.append(layer);
  const original=$(".feed-add",card), seen={};
  const cta=action("dessert-story-buy dessert-story-feed-buy");
  const purchase=makeNode("div","dessert-story-feed-finale");purchase.hidden=true;purchase.append(cta);
  if(original){
    target.after(purchase);card.dataset.dessertBuy="true";
    cta.textContent=words().buy;
    cta.addEventListener("click",()=>{
      if(slider.index!==2||original.disabled||!original.isConnected)return;
      count("story_buy_intent","feed");armPurchase(card);original.click();
    });
    const sync=()=>{cta.disabled=original.disabled;};
    new MutationObserver(sync).observe(original,{attributes:true,attributeFilter:["disabled"]});sync();
  }
  function visible(){
    if(document.hidden||document.querySelector("dialog[open]")||!layer.isConnected)return false;
    const b=layer.getBoundingClientRect(),top=Math.max(0,$(".feed-header")?.getBoundingClientRect().bottom||0,$(".feed-tools")?.getBoundingClientRect().bottom||0);
    const bottom=Math.min(innerHeight,$("#menu-cart-trigger")?.getBoundingClientRect().top||innerHeight);
    return b.width>0&&Math.max(0,Math.min(b.bottom,bottom)-Math.max(b.top,top))>=Math.min(b.height,bottom-top)*.5;
  }
  function revealPurchase(){
    if(!original||purchase.hidden)return;
    requestAnimationFrame(()=>{
      if(purchase.hidden||!purchase.isConnected||!visible())return;
      const b=cta.getBoundingClientRect(),cart=$("#menu-cart-trigger"),bottom=Math.min(innerHeight,cart?.getBoundingClientRect().top||innerHeight);
      if(b.bottom+8>bottom)window.scrollBy({top:b.bottom+8-bottom,behavior:"instant"});
    });
  }
  const slider=controller(image,progress,(i,previous,via)=>{
    card.dataset.dessertFrame=String(i+1);next.hidden=i===2;hint.hidden=i===2;hint.textContent=copy().hint;backdrop.src=image.src;
    purchase.hidden=i!==2||!original;cta.textContent=words().buy;
    if(i!==previous&&via){
      if(!seen.impression){seen.impression=true;count("story_impression","feed");}
      count(via==="swipe"?"story_swipe":"story_advance","feed");
    }
    if(i===2&&via)revealPurchase();
    decodedExposure(image,i,seen,"feed",visible);
  });
  const viewObserver=new IntersectionObserver(()=>{
    if(visible())decodedExposure(image,slider.index,seen,"feed",visible);
    if(seen.completed)viewObserver.disconnect();
  },{threshold:[0,.25,.5,1]});
  viewObserver.observe(layer);
  $(".feed-like",card)?.addEventListener("click",()=>{
    if(slider.index===2&&$(".feed-like",card)?.getAttribute("aria-pressed")==="true")count("story_like","feed");
  });
  $(".feed-share",card)?.addEventListener("click",()=>{if(slider.index===2)count("story_share","feed");});
  layer.addEventListener("pointerdown",slider.start);
  layer.addEventListener("pointerup",slider.end);
  layer.addEventListener("pointercancel",slider.cancel);
  layer.addEventListener("keydown",e=>{if(e.key==="ArrowLeft")slider.show(slider.index+1,"keyboard");else if(e.key==="ArrowRight")slider.show(slider.index-1,"keyboard");});
  layer.addEventListener("dblclick",()=>$(".feed-photo > img",card)?.dispatchEvent(new MouseEvent("dblclick",{bubbles:true})));
  next.addEventListener("click",e=>{e.stopPropagation();slider.show(slider.index+1,"button");});
  image.addEventListener("error",()=>{layer.hidden=true;purchase.hidden=true;delete card.dataset.dessertFrame;});
  card._dessertStory=slider;
  slider.show(0);
}
function injectRow(row){
  if(row.querySelector(".dessert-story-open")) return;
  const button=document.createElement("button");
  button.type="button";button.className="dessert-story-open";button.textContent=copy().open;
  button.setAttribute("aria-label",copy().open);button.title=copy().open;
  button.addEventListener("click",e=>{e.stopPropagation();open(button);});
  // Separate sibling to the image button; a positioned overlay will not stretch the card.
  row.append(button);
}
function scan(){
  document.querySelectorAll('.feed-card[data-product-id="'+PRODUCT_ID+'"]').forEach(injectFeed);
  document.querySelectorAll('.full-menu-item[data-product-id="'+PRODUCT_ID+'"]').forEach(injectRow);
}
function relocalize(){
  document.querySelectorAll(".dessert-story-open").forEach(button=>{button.textContent=copy().open;button.setAttribute("aria-label",copy().open);button.title=copy().open;});
  document.querySelectorAll(".dessert-story-feed").forEach(layer=>{
    layer.setAttribute("aria-label",copy().title+" · "+copy().hint);
    layer.querySelector(".dessert-story-forward")?.setAttribute("aria-label",copy().next);
    layer.closest(".feed-card")?._dessertStory?.show(0);
  });
  if(modal.open){localizeActions();modalSlide.show(modalSlide.index);}
}
let scheduled=false;
const observer=new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;scan();checkPurchase();});
});

document.addEventListener("click",e=>{
  if(e.target.closest(".lang-button,.feed-languages [data-lang]")) queueMicrotask(relocalize);
});

// Optional non-blocking stylesheet must load before exposing story controls.
// Keep original menu photography intact if the extra CSS cannot be fetched.
const loadStyles=document.createElement("link");
loadStyles.rel="stylesheet";
loadStyles.href=new URL("../dessert-story.css",import.meta.url).href;
loadStyles.addEventListener("load",()=>{
  for(const root of [$("#feed"),$("#menu-root")].filter(Boolean)) observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["data-cart-quantity"]});
  scan();
},{once:true});
document.head.append(loadStyles);
