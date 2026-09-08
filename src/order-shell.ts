import { installOrderDock } from "./order-dock.js";
import { createOrderSharePanel } from "./order-share.js";
import { order, resolveOrderProduct, suggestOrderAddition, type Language } from '@robys/order';
const words = {
  tr: {cart:'Sepetim',total:'Toplam',empty:'Sepetiniz boş',back:'Seçime devam',remove:'Kaldır',undo:'Geri al',close:'Kapat',add:'Ekle',minus:'Azalt',draft:'Ön hesaplama. Sipariş gönderilmedi, ödeme alınmadı.',storage:'Bu sekmede kayıt kullanılamıyor. Sayfadan ayrılırsanız seçiminiz kaybolabilir.',invalid:'Eski seçim okunamadı. Lütfen sepetinizi kontrol edin.',legacy:'Smart Choice içindeki eski seçimi de eklemek ister misiniz?',keep:'Mevcut sepeti koru',import:'Eski seçimi ekle',error:'İşlem tamamlanamadı. Miktarı ve seçimi kontrol edin.'},
  en: {cart:'My order',total:'Total',empty:'Your order is empty',back:'Keep choosing',remove:'Remove',undo:'Undo removal',close:'Close',add:'Increase',minus:'Decrease',draft:'Local preview. No order sent and no payment taken.',storage:'Storage is unavailable in this tab. Leaving this page may lose your selection.',invalid:'An old selection could not be read. Please check your order.',legacy:'Also add the previous Smart Choice selection?',keep:'Keep current order',import:'Add previous selection',error:'Could not complete this action. Check the quantity and selection.'},
  ru: {cart:'Мой заказ',total:'Итого',empty:'Ваш заказ пока пуст',back:'Продолжить выбор',remove:'Удалить',undo:'Отменить удаление',close:'Закрыть',add:'Увеличить',minus:'Уменьшить',draft:'Предварительный расчёт. Заказ не отправлен, оплата не списана.',storage:'Сохранение недоступно. При уходе со страницы выбор может потеряться.',invalid:'Прежний выбор не удалось прочитать. Проверьте заказ.',legacy:'Добавить также прежний выбор из Smart Choice?',keep:'Оставить текущий заказ',import:'Добавить прежний выбор',error:'Не удалось выполнить действие. Проверьте количество и состав.'}
};
const journeyWords = {
  tr: {show:'Baristaya göster',ready:'Barista için seçiminiz',edit:'Siparişi düzenle',counter:'Bu ekranı baristaya gösterin. Müsaitliği onaylayıp siparişinizi ve ödemenizi kasada alacaktır.',hint:'Hazır olduğunuzda seçiminizi baristaya gösterebilirsiniz.',optional:'Kahvenin yanına?',skip:'Böyle devam',add:'Ekle',withExtra:'Eklemeyle toplam',menu:'Menüden seç',help:'Seçmeme yardım et'},
  en: {show:'Show the barista',ready:'Your selection for the barista',edit:'Edit my order',counter:'Show this screen to the barista. They will confirm availability and take your order and payment at the counter.',hint:'When you are ready, show your selection to the barista.',optional:'Something with your coffee?',skip:'Keep it as is',add:'Add',withExtra:'Total with this extra',menu:'Choose from the menu',help:'Help me choose'},
  ru: {show:'Показать бариста',ready:'Ваш выбор для бариста',edit:'Изменить заказ',counter:'Покажите этот экран бариста. Он подтвердит наличие, примет заказ и оплату на кассе.',hint:'Когда будете готовы, покажите свой выбор бариста.',optional:'Что-нибудь к кофе?',skip:'Оставить как есть',add:'Добавить',withExtra:'Итого с дополнением',menu:'Выбрать из меню',help:'Помочь с выбором'}
};
function lang(): Language { const value = document.documentElement.lang.split('-')[0]; return value === 'ru' || value === 'en' ? value : 'tr'; }
function money(minor: number): string { return new Intl.NumberFormat({tr:'tr-TR',en:'en-US',ru:'ru-RU'}[lang()],{style:'currency',currency:'TRY',currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100); }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node=document.createElement(tag); node.className=className; if(text!==undefined)node.textContent=text; return node;
}
function button(text: string, action: ()=>void, className='order-button'): HTMLButtonElement {
  const node=element('button',className,text); node.type='button';node.addEventListener('click',action);return node;
}
function start(): void {
  if(document.querySelector('#robys-order-trigger')) return;
  const root=element('div','robys-order');
  const bar=button('',()=>open(),'order-bar');bar.id='robys-order-trigger';bar.setAttribute('aria-haspopup','dialog');
  const dialog=element('dialog','order-dialog');dialog.id='robys-order-dialog';dialog.setAttribute('aria-labelledby','robys-order-title');
  const heading=element('h2','order-title');heading.id='robys-order-title';
  const close=button('×',()=>hide(),'order-close');
  const lines=element('div','order-lines'),notice=element('p','order-note'),migration=element('section','order-migration');
  const status=element('p','order-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const total=element('p','order-total'),back=button('',()=>hide());
  const undo=button('',()=>act(()=>order.undoRemoval()));undo.id='robys-order-undo';
  const draft=element('p','order-note');
  const extra=element('section','order-extra');
  const emptyActions=element('div','order-empty-actions');
  const sharing=createOrderSharePanel({
    language:lang,
    snapshot:()=>order.get(),
    summary:()=>order.summary(),
    resolveProduct:resolveOrderProduct,
    menuUrl:new URL('menu.html',import.meta.url).href,
    canShare:()=>dialog.open && order.summary().quantity>0 && !order.status().pendingLegacy
  });
  const handoff=button('',()=>{showingBarista=true;render();heading.tabIndex=-1;heading.focus();window.dispatchEvent(new CustomEvent('robys:order-handoff',{detail:order.summary()}));},'order-button order-primary');
  handoff.id='robys-order-handoff';
  const edit=button('',()=>{showingBarista=false;render();handoff.focus();});
  edit.id='robys-order-edit';
  let showingBarista=false,extraDismissed=false;
  try {extraDismissed=sessionStorage.getItem('robys:order-addon-declined.v1')==='true';} catch { /* Same-page decisions still work. */ }
  function dismissExtra():void {extraDismissed=true;try{sessionStorage.setItem('robys:order-addon-declined.v1','true');}catch{ /* Optional persistence. */ }}
  dialog.append(close,heading,notice,migration,lines,total,extra,emptyActions,status,undo,handoff,edit,back,sharing.element,draft);
  root.append(bar,dialog);document.body.append(root);document.body.classList.add('has-unified-order');
  installOrderDock(bar);
  let returnFocus: HTMLElement|null=null;const inerted: HTMLElement[]=[];
  function act(action:()=>void,message=''):void {try{action();status.textContent=(message ? message+' · ' : '')+words[lang()].total+': '+money(order.summary().totalMinor);}catch{status.textContent=words[lang()].error;}}
  function open():void {
    if (dialog.open) return;
    returnFocus=document.activeElement as HTMLElement; showingBarista=false; render();
    if(typeof dialog.showModal==='function')dialog.showModal();
    else {dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      for(const node of Array.from(document.body.children)) if(node!==root && node instanceof HTMLElement && !node.inert){node.inert=true;inerted.push(node);}}
    sharing.update(true);
    document.body.classList.add('order-is-open');close.focus();
  }
  function hide():void {
    sharing.update(false);
    if(typeof dialog.close==='function' && dialog.open)dialog.close();else dialog.removeAttribute('open');
    inerted.splice(0).forEach(node=>{node.inert=false;});document.body.classList.remove('order-is-open');
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else bar.focus({preventScroll:true});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();hide();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)hide();});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();hide();}
    if(event.key!=='Tab')return;
    const nodes=Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],summary,textarea:not([disabled])')).filter(n=>!n.hidden && n.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  });
  function render(): void {
    const language=lang(),copy=words[language],journey=journeyWords[language],summary=order.summary(),current=order.get(),state=order.status();
    const focus=document.activeElement instanceof HTMLElement ? document.activeElement.dataset.orderFocus : undefined;
    bar.textContent=summary.quantity ? `${copy.cart} · ${summary.quantity} · ${money(summary.totalMinor)} →` : copy.cart;
    bar.classList.toggle('order-bar--filled',summary.quantity>0);
    if (!summary.quantity) showingBarista=false;
    sharing.update(!showingBarista && summary.quantity>0 && !state.pendingLegacy);
    dialog.classList.toggle('order-dialog--handoff',showingBarista);
    heading.textContent=showingBarista ? journey.ready : copy.cart;close.setAttribute('aria-label',copy.close);back.textContent=copy.back;draft.textContent=showingBarista ? journey.counter : journey.hint;
    handoff.textContent=journey.show;handoff.hidden=showingBarista || !summary.quantity || Boolean(state.pendingLegacy);
    edit.textContent=journey.edit;edit.hidden=!showingBarista;back.hidden=showingBarista;
    notice.textContent=!state.persistent ? copy.storage : state.notice ? copy.invalid : '';notice.hidden=!notice.textContent;
    undo.textContent=copy.undo;undo.hidden=showingBarista || !state.canUndo;
    migration.replaceChildren();migration.hidden=!state.pendingLegacy;
    if(state.pendingLegacy){
      migration.append(element('p','',copy.legacy));
      for(const line of state.pendingLegacy) migration.append(element('p','',`${resolveOrderProduct(line.id)?.item.name[language]} × ${line.quantity}`));
      migration.append(button(copy.keep,()=>act(()=>order.resolveMigration('keep'))),button(copy.import,()=>act(()=>order.resolveMigration('import'))));
    }
    lines.replaceChildren();
    if(!current.lines.length)lines.append(element('p','order-empty',copy.empty));
    for(const line of current.lines){
      const product=resolveOrderProduct(line.id);if(!product)continue;
      const row=element('article','order-line');const title=element('strong','',showingBarista ? `${line.quantity} × ${product.item.name[language]}` : product.item.name[language]);
      const image=element('img','order-thumb');image.alt='';image.width=64;image.height=64;
      image.src=new URL(product.image, import.meta.url).href;
      const controls=element('div','order-controls');controls.hidden=showingBarista;
      const minus=button('−',()=>act(()=>order.setQuantity(line.id,line.quantity-1),`${title.textContent} × ${line.quantity-1}`),'order-step');minus.setAttribute('aria-label',`${copy.minus}: ${title.textContent}`);minus.dataset.orderFocus=`${line.id}:minus`;
      const plus=button('+',()=>act(()=>order.setQuantity(line.id,line.quantity+1),`${title.textContent} × ${line.quantity+1}`),'order-step');plus.setAttribute('aria-label',`${copy.add}: ${title.textContent}`);plus.disabled=line.quantity>=99;plus.dataset.orderFocus=`${line.id}:plus`;
      const remove=button(copy.remove,()=>act(()=>order.setQuantity(line.id,0),`${title.textContent} × 0`),'order-remove');remove.dataset.orderFocus=`${line.id}:remove`;
      controls.append(minus,element('span','',String(line.quantity)),plus,remove);
      row.append(image,title,element('span','order-line-price',money(Math.round(product.item.price*100)*line.quantity)),controls);lines.append(row);
    }
    total.textContent=`${copy.total}: ${money(summary.totalMinor)}`;
    emptyActions.replaceChildren();emptyActions.hidden=summary.quantity>0;
    if (!summary.quantity) {
      for (const [title,path] of [[journey.menu,'menu.html'],[journey.help,'smart-choice/']]) {
        const link=element('a','order-button',title);link.href=new URL(path,import.meta.url).href;emptyActions.append(link);
      }
    }
    extra.replaceChildren();
    try {extraDismissed ||= sessionStorage.getItem('robys:order-addon-declined.v1')==='true';}catch{ /* Same-page fallback. */ }
    const suggestion = !showingBarista && !extraDismissed && !state.pendingLegacy ? suggestOrderAddition(current.lines) : undefined;
    extra.hidden=!suggestion;
    if (suggestion) {
      const amount=Math.round(suggestion.item.price*100);
      extra.append(element('h3','',journey.optional),element('p','',`${suggestion.item.name[language]} · +${money(amount)}`),element('p','order-note',`${journey.withExtra}: ${money(summary.totalMinor+amount)}`));
      extra.append(button(journey.add,()=>act(()=>{order.add(suggestion.id);dismissExtra();render();handoff.focus();})),button(journey.skip,()=>{dismissExtra();render();handoff.focus();}));
    }
    if(focus && dialog.open){const target=Array.from(dialog.querySelectorAll<HTMLElement>('[data-order-focus]')).find(node=>node.dataset.orderFocus===focus);(target ?? (undo.hidden ? back : undo)).focus({preventScroll:true});}
  }
  order.subscribe(render);
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  window.addEventListener('robys:order-open',open);
  window.addEventListener('robys:order-added',()=>{bar.classList.add('order-bar--added');setTimeout(()=>bar.classList.remove('order-bar--added'),220);});
  render();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
