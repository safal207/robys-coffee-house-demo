const TARGET="/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp";
const image=document.querySelector("#menu-product-image");
let loading=false;
function load(){
 const src=image?.getAttribute("src")||"";
 if(loading||!src.split(/[?#]/,1)[0].endsWith(TARGET))return;
 loading=true;
 void import("./menu-product-reveal-runtime.js?v=20260909-reveal-v2").catch(()=>loading=false);
}
if(image){
 new MutationObserver(load).observe(image,{attributes:true,attributeFilter:["src"]});
 load();
}
const requested=new URLSearchParams(location.search).get("product");
function open(){
 const button=requested&&document.querySelector(`[data-product-id="${CSS.escape(requested)}"] .full-menu-item-media`);
 if(!button)return false;
 button.click();return true;
}
if(requested&&!open()){
 const root=document.querySelector("#menu-root");
 if(root){
  const observer=new MutationObserver(()=>{if(open())observer.disconnect()});
  observer.observe(root,{childList:true,subtree:true});
 }
}
