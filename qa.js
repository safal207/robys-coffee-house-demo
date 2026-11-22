const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const HERO_VIDEO="src/robys-ambience-clean.mp4?v=20260711-1";
function ensureHeroBalanceStyles(){
 if(q('link[data-hero-balance="true"]'))return;
 const l=document.createElement("link");l.rel="stylesheet";l.href="hero-balance.css?v=20260622-1";l.dataset.heroBalance="true";document.head.append(l);
}
function requestHeroPlayback(v){
 if(!v||document.hidden)return;
 const p=v.play();
 if(p&&typeof p.then==="function")p.then(()=>{v.classList.add("is-playing");v.dataset.playbackState="playing"}).catch(()=>{v.classList.remove("is-playing");v.dataset.playbackState="blocked"});
}
function enableHeroVideo(){
 if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
 const v=q(".hero-video"),s=v?.querySelector("source");if(!s)return;
 v.autoplay=v.loop=v.muted=v.defaultMuted=v.playsInline=true;
 s.removeAttribute("media");s.src=HERO_VIDEO;
 const retry=()=>requestHeroPlayback(v);
 v.addEventListener("loadeddata",retry,{once:true});v.addEventListener("canplay",retry);
 v.addEventListener("pause",()=>{if(!document.hidden&&!v.ended)window.setTimeout(retry,180)});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)retry()});
 window.addEventListener("pointerdown",retry,{once:true,passive:true});
 v.load();retry();
}
function scheduleHeroPlayback(){enableHeroVideo()}
function applyImmediateA11yFixes(){
 document.documentElement.style.setProperty("--ruby","#b24753");
 qa(".brand").forEach(l=>l.removeAttribute("aria-label"));
 q(".map-live-link")?.removeAttribute("aria-label");
 const top=q(".back-top");if(top)top.setAttribute("aria-label","↑ Back to top");
}
let enhanced=false;
function initQaEnhancements(){
 if(enhanced)return;enhanced=true;
 import("./qa-interactions.js").catch(error=>console.error("Optional QA enhancements failed",error));
}
function initQa(){
 ensureHeroBalanceStyles();scheduleHeroPlayback();applyImmediateA11yFixes();
 window.addEventListener("pointerdown",initQaEnhancements,{once:true,passive:true});
 window.addEventListener("keydown",initQaEnhancements,{once:true});
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",initQa,{once:true}):initQa();
