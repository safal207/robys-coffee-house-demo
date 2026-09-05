import { order, resolveOrderProduct, type Language } from '@robys/order';
const words = {
  tr: {cart:'Sepetim',total:'Toplam',empty:'Sepetiniz boş',back:'Seçime devam',remove:'Kaldır',undo:'Geri al',close:'Kapat',add:'Ekle',minus:'Azalt',draft:'Ön hesaplama. Sipariş gönderilmedi, ödeme alınmadı.',storage:'Bu sekmede kayıt kullanılamıyor. Sayfadan ayrılırsanız seçiminiz kaybolabilir.',invalid:'Eski seçim okunamadı. Lütfen sepetinizi kontrol edin.',legacy:'Smart Choice içindeki eski seçimi de eklemek ister misiniz?',keep:'Mevcut sepeti koru',import:'Eski seçimi ekle',error:'İşlem tamamlanamadı. Miktarı ve seçimi kontrol edin.'},
  en: {cart:'My order',total:'Total',empty:'Your order is empty',back:'Keep choosing',remove:'Remove',undo:'Undo removal',close:'Close',add:'Increase',minus:'Decrease',draft:'Local preview. No order sent and no payment taken.',storage:'Storage is unavailable in this tab. Leaving this page may lose your selection.',invalid:'An old selection could not be read. Please check your order.',legacy:'Also add the previous Smart Choice selection?',keep:'Keep current order',import:'Add previous selection',error:'Could not complete this action. Check the quantity and selection.'},
  ru: {cart:'Мой заказ',total:'Итого',empty:'Ваш заказ пока пуст',back:'Продолжить выбор',remove:'Удалить',undo:'Отменить удаление',close:'Закрыть',add:'Увеличить',minus:'Уменьшить',draft:'Предварительный расчёт. Заказ не отправлен, оплата не списана.',storage:'Сохранение недоступно. При уходе со страницы выбор может потеряться.',invalid:'Прежний выбор не удалось прочитать. Проверьте заказ.',legacy:'Добавить также прежний выбор из Smart Choice?',keep:'Оставить текущий заказ',import:'Добавить прежний выбор',error:'Не удалось выполнить действие. Проверьте количество и состав.'}
};
function lang(): Language { const value = document.documentElement.lang.split('-')[0]; return value === 'ru' || value === 'en' ? value : 'tr'; }
function money(minor: number): string { return new Intl.NumberFormat({tr:'tr-TR',en:'en-US',ru:'ru-RU'}[lang()],{style:'currency',currency:'TRY',minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100); }
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
  dialog.append(close,heading,notice,migration,lines,total,status,undo,back,draft);
  root.append(bar,dialog);document.body.append(root);document.body.classList.add('has-unified-order');
  let returnFocus: HTMLElement|null=null;const inerted: HTMLElement[]=[];
  function act(action:()=>void):void {try{action();status.textContent=words[lang()].total+': '+money(order.summary().totalMinor);}catch{status.textContent=words[lang()].error;}}
  function open():void {
    returnFocus=document.activeElement as HTMLElement; render();
    if(typeof dialog.showModal==='function')dialog.showModal();
    else {dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      for(const node of Array.from(document.body.children)) if(node!==root && node instanceof HTMLElement && !node.inert){node.inert=true;inerted.push(node);}}
    document.body.classList.add('order-is-open');close.focus();
  }
  function hide():void {
    if(typeof dialog.close==='function' && dialog.open)dialog.close();else dialog.removeAttribute('open');
    inerted.splice(0).forEach(node=>{node.inert=false;});document.body.classList.remove('order-is-open');
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else bar.focus({preventScroll:true});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();hide();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)hide();});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();hide();}
    if(event.key!=='Tab')return;
    const nodes=Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(n=>!n.hidden && n.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  });
  function render(): void {
    const language=lang(),copy=words[language],summary=order.summary(),current=order.get(),state=order.status();
    const focus=document.activeElement instanceof HTMLElement ? document.activeElement.dataset.orderFocus : undefined;
    bar.textContent=summary.quantity ? `${copy.cart} · ${summary.quantity} · ${money(summary.totalMinor)} →` : copy.cart;
    bar.classList.toggle('order-bar--filled',summary.quantity>0);
    heading.textContent=copy.cart;close.setAttribute('aria-label',copy.close);back.textContent=copy.back;draft.textContent=copy.draft;
    notice.textContent=!state.persistent ? copy.storage : state.notice ? copy.invalid : '';notice.hidden=!notice.textContent;
    undo.textContent=copy.undo;undo.hidden=!state.canUndo;
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
      const row=element('article','order-line');const title=element('strong','',product.item.name[language]);
      const image=element('img','order-thumb');image.alt='';image.width=64;image.height=64;
      image.src=new URL(product.image, import.meta.url).href;
      const controls=element('div','order-controls');
      const minus=button('−',()=>act(()=>order.setQuantity(line.id,line.quantity-1)),'order-step');minus.setAttribute('aria-label',`${copy.minus}: ${title.textContent}`);minus.dataset.orderFocus=`${line.id}:minus`;
      const plus=button('+',()=>act(()=>order.setQuantity(line.id,line.quantity+1)),'order-step');plus.setAttribute('aria-label',`${copy.add}: ${title.textContent}`);plus.disabled=line.quantity>=99;plus.dataset.orderFocus=`${line.id}:plus`;
      const remove=button(copy.remove,()=>act(()=>order.setQuantity(line.id,0)),'order-remove');remove.dataset.orderFocus=`${line.id}:remove`;
      controls.append(minus,element('span','',String(line.quantity)),plus,remove);
      row.append(image,title,element('span','order-line-price',money(Math.round(product.item.price*100)*line.quantity)),controls);lines.append(row);
    }
    total.textContent=`${copy.total}: ${money(summary.totalMinor)}`;
    if(focus && dialog.open){const target=Array.from(dialog.querySelectorAll<HTMLElement>('[data-order-focus]')).find(node=>node.dataset.orderFocus===focus);(target ?? (undo.hidden ? back : undo)).focus({preventScroll:true});}
  }
  order.subscribe(render);
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  window.addEventListener('robys:order-open',open);
  window.addEventListener('robys:order-added',()=>{bar.classList.add('order-bar--added');setTimeout(()=>bar.classList.remove('order-bar--added'),220);});
  render();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
