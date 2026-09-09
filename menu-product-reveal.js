const TARGET="/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp";
const image=document.querySelector("#menu-product-image");
let busy=false;
const target=()=>{try{return new URL(image?.getAttribute("src")||image?.src||"",document.baseURI).pathname.endsWith(TARGET)}catch{return false}};
const load=()=>{if(!target()||busy)return;busy=true;void import("./menu-product-reveal-runtime.js?v=90e757f93063").catch(()=>busy=false)};
if(image){new MutationObserver(load).observe(image,{attributes:true,attributeFilter:["src"]});load()}
const route=new URL(location).searchParams.get("product"),root=document.querySelector("#menu-root");
if(route&&root){
 const open=()=>document.querySelector(`[data-product-id="${CSS.escape(route)}"] .full-menu-item-media`)?.click();
 if(root.dataset.ready==="true")queueMicrotask(open);
 else new MutationObserver((_,o)=>{if(root.dataset.ready==="true"){o.disconnect();open()}}).observe(root,{attributes:true,attributeFilter:["data-ready"]})
}
