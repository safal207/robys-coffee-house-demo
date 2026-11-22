// Roby's Chocolate Cake Stories. Source enhancement; keeps existing cart/media actions.
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
const dots = () => {
  const node = document.createElement("div");
  node.className = "dessert-story-dots";
  node.setAttribute("aria-hidden", "true");
  for (let i=0;i<3;i++) node.append(document.createElement("i"));
  return node;
};
function controller(img, progress, afterChange=()=>{}) {
  let index=0, origin=null;
  function show(next) {
    index=Math.max(0,Math.min(2,next));
    const lang=language();
    img.alt=COPY[lang].alt[index];
    img.src=paths(lang)[index];
    progress.querySelectorAll("i").forEach((item,n) => item.classList.toggle("active",n===index));
    afterChange(index);
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
    if(Math.abs(dx)>=36 && Math.abs(dx)>1.25*Math.abs(dy)) show(index+(dx<0?1:-1));
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
const heading=makeNode("strong","");
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
modal.append(top,frame,foot);
document.body.append(modal);
const modalProgress=dots();
$(".dessert-story-progress",modal).append(modalProgress);
const before=$(".dessert-story-prev",modal), after=$(".dessert-story-next",modal), close=$(".dessert-story-close",modal);
const stage=$(".dessert-story-image",modal);
const modalSlide=controller($("img",stage),modalProgress,i=>{before.disabled=i===0;after.disabled=i===2;});
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
  modalSlide.show(0);
  modal.showModal();
  close.focus({preventScroll:true});
}
close.addEventListener("click",()=>modal.close());
before.addEventListener("click",()=>modalSlide.show(modalSlide.index-1));
after.addEventListener("click",()=>modalSlide.show(modalSlide.index+1));
modal.addEventListener("click",e=>{if(e.target===modal) modal.close();});
modal.addEventListener("close",()=>modal._returnFocus?.isConnected&&modal._returnFocus.focus({preventScroll:true}));
modal.addEventListener("keydown",e=>{
  if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();modalSlide.show(modalSlide.index+(e.key==="ArrowLeft"?1:-1));}
});
function injectFeed(card){
  if(card.querySelector(".dessert-story-feed")) return;
  const target=$(".feed-photo",card);
  if(!target) return;
  const layer=document.createElement("div");
  layer.className="dessert-story-feed";layer.tabIndex=0;layer.setAttribute("role","group");layer.setAttribute("aria-label",copy().title+" · "+copy().hint);
  const image=document.createElement("img");
  image.className="dessert-story-frame";image.loading="lazy";image.decoding="async";image.draggable=false;
  const backdrop=document.createElement("img");backdrop.className="dessert-story-backdrop";backdrop.alt="";backdrop.setAttribute("aria-hidden","true");backdrop.decoding="async";backdrop.draggable=false;
  const progress=dots(),hint=document.createElement("span"),next=document.createElement("button");
  hint.className="dessert-story-hint";
  next.type="button";next.className="dessert-story-forward";next.textContent="›";next.setAttribute("aria-label",copy().next);
  layer.append(backdrop,image,progress,hint,next);
  target.append(layer);
  const slider=controller(image,progress,i=>{next.hidden=i===2;hint.textContent=copy().hint;backdrop.src=image.src;});
  layer.addEventListener("pointerdown",slider.start);
  layer.addEventListener("pointerup",slider.end);
  layer.addEventListener("pointercancel",slider.cancel);
  layer.addEventListener("keydown",e=>{if(e.key==="ArrowLeft")slider.show(slider.index+1);else if(e.key==="ArrowRight")slider.show(slider.index-1);});
  layer.addEventListener("dblclick",()=>$(".feed-photo > img",card)?.dispatchEvent(new MouseEvent("dblclick",{bubbles:true})));
  next.addEventListener("click",e=>{e.stopPropagation();slider.show(slider.index+1);});
  image.addEventListener("error",()=>{layer.hidden=true;});
  card._dessertStory=slider;
  slider.show(0);
}
function injectRow(row){
  if(row.querySelector(".dessert-story-open")) return;
  const button=document.createElement("button");
  button.type="button";button.className="dessert-story-open";button.textContent=copy().open;
  button.addEventListener("click",e=>{e.stopPropagation();open(button);});
  ($(".full-menu-item-details",row)||row).append(button);
}
function scan(){
  document.querySelectorAll('.feed-card[data-product-id="'+PRODUCT_ID+'"]').forEach(injectFeed);
  document.querySelectorAll('.full-menu-item[data-product-id="'+PRODUCT_ID+'"]').forEach(injectRow);
}
function relocalize(){
  document.querySelectorAll(".dessert-story-open").forEach(button=>{button.textContent=copy().open});
  document.querySelectorAll(".dessert-story-feed").forEach(layer=>{
    layer.querySelector(".dessert-story-forward")?.setAttribute("aria-label",copy().next);
    layer.closest(".feed-card")?._dessertStory?.show(0);
  });
  if(modal.open) modalSlide.show(modalSlide.index);
}
let scheduled=false;
const observer=new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;scan();});
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
  for(const root of [$("#feed"),$("#menu-root")].filter(Boolean)) observer.observe(root,{subtree:true,childList:true});
  scan();
},{once:true});
document.head.append(loadStyles);
