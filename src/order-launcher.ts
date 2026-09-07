import { installOrderDock } from "./order-dock.js";
/** Empty browsing routes load the order model only for a saved order or order intent. */
const copy: Record<string,string> = {tr:'Sepetim',en:'My order',ru:'Мой заказ'};
const holder=document.createElement('div');holder.className='robys-order';
const link=document.createElement('a');link.className='order-bar';link.id='robys-order-launcher';
link.href=new URL('menu.html?order=open',import.meta.url).href;
function label():void {link.textContent=copy[document.documentElement.lang.split('-')[0]]??copy.tr;}
label();holder.append(link);document.body.append(holder);document.body.classList.add('has-unified-order');
const stopDock = installOrderDock(link);
new MutationObserver(label).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
let loading:Promise<unknown>|null=null;
let openIntent=0;
const cancelOpen=():void=>{openIntent+=1;};
window.addEventListener('robys:order-open-cancel',cancelOpen);
window.addEventListener('pagehide',cancelOpen);
window.addEventListener('keydown',event=>{if(event.key==='Escape')cancelOpen();});
function load():Promise<unknown> {
  const shellPath='./order-shell.js?v=000000000000'; loading??=import(shellPath).then(()=>{stopDock();holder.remove();window.dispatchEvent(new Event("robys:order-ready"));}).catch(error=>{loading=null;throw error;});
  return loading;
}
link.addEventListener('click',event=>{
  event.preventDefault();window.dispatchEvent(new Event('robys:order-open-cancel'));
  const requested=openIntent;link.setAttribute('aria-busy','true');
  void load().then(()=>{if(requested===openIntent)window.dispatchEvent(new Event('robys:order-open'));})
    .catch(()=>{if(requested===openIntent)window.location.href=link.href;})
    .finally(()=>link.removeAttribute('aria-busy'));
});
let saved=false;
try {saved=['robys:coffee-house:order.v2','robys-menu-order.v1','robys-smart-choice-cart.v1'].some(key=>sessionStorage.getItem(key)!==null);} catch { /* Loading on click still supplies the in-memory order. */ }
window.addEventListener("robys:order-load",()=>{void load().catch(()=>{});});
if(saved)void load().catch(()=>{});
