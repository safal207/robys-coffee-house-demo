import { menuCategories } from "../menu-catalog.js?v=3132b4dc1273";
import { addOrderGroup, transactStoredOrderDraft } from "../order-storage.js";
import { MOOD_GRAPH_VERSION, PAIR_RULES, recommendMoodPair } from "./mood-graph-domain.js?v=0a8dfc32bd32";

const root = document.getElementById("mood-pair");
if (root) {
  const text = {
    ru: {
      eyebrow:"ТВОЙ ROBY’S СЕГОДНЯ",title:"Выбери цвет. Найди новый вкус.",intro:"Настроение и погода помогут собрать напиток и что-нибудь к нему из настоящего меню.",
      color:"1. Какой цвет тебе ближе?",mood:"2. Какое настроение?",weather:"3. Какая погода?",
      colors:{ green:"Зелёный",coral:"Коралловый",blue:"Синий",amber:"Янтарный" },
      moods:{fresh:"Освежиться",comfort:"Хочу уюта",energy:"Взбодриться",surprise:"Попробовать необычное"},
      weathers:{hot:"Жарко",cool:"Прохладно",rain:"Дождь"},
      recommended:"Твоя пара",newPair:"Предлагаемое сочетание, не отдельное комбо или скидка",
      why:"Почему именно эта пара?",note:"Это объяснение правил, а не доказательство влияния на покупки.",
      inputs:"Твои ответы",eligible:"Есть в каталоге",ranking:"Оценка соответствия",output:"Рекомендация",
      weatherInfo:"Погода выбрана вручную. Сайт не запрашивает твою геолокацию.",
      moodHit:"Настроение",weatherHit:"Погода",colorHit:"Цветовая тема",next:"Удиви ещё",tried:"Уже пробовал",
      add:"Добавить пару в заказ",adding:"Добавляем…",openOrder:"Посмотреть заказ",
      success:"Пара добавлена в черновик заказа. Оплата и подтверждение — только в кафе.",
      failure:"Не получилось сохранить заказ. Проверь хранилище браузера и повтори попытку.",
      empty:"Все варианты отмечены как попробованные. Сбрось отметки, чтобы выбрать снова.",
      reset:"Сбросить отметки",price:"Итого по меню",checkoutNote:"Проверяй наличие и актуальную цену на кассе.",
      discover:"Познакомиться со вкусом",storyTitle:"Ты открыл этот вкус",storyLine:"Посмотри на сочетание и представь, как эти два продукта дополняют друг друга.",
      progress:"Вкусов открыто",views:"Твоих просмотров",like:"Нравится",shareTitle:"С кем бы ты попробовал эту пару?",shareLead:"Поделись этим сочетанием с другом. Можно просто пропустить.",
      share:"Поделиться с другом",skip:"Пропустить",offerTitle:"Хочешь попробовать эту пару?",
      copied:"Ссылка скопирована — теперь её можно отправить другу.",shareFallback:"Скопируй ссылку вручную или пропусти этот шаг.",copyLink:"Ссылка на сочетание",direct:"Сразу выбрать пару"
    },
    en: {
      eyebrow:"YOUR ROBY’S TODAY",title:"Choose a color. Discover a new pairing.",intro:"Your mood and the weather help match a real menu drink with something to eat.",
      color:"1. Choose a color",mood:"2. How do you feel?",weather:"3. How is the weather?",
      colors:{green:"Green",coral:"Coral",blue:"Blue",amber:"Amber"},
      moods:{fresh:"Refresh me",comfort:"Something cozy",energy:"More energy",surprise:"Surprise me"},
      weathers:{hot:"Hot",cool:"Cool",rain:"Rainy"},
      recommended:"Your pairing",newPair:"Suggested combination, not a separate discount or published set",
      why:"Why this pairing?",note:"This explains configured rules, not their effect on sales.",
      inputs:"Your choices",eligible:"Catalog-verified",ranking:"Preference match",output:"Suggestion",
      weatherInfo:"Weather is selected manually. No location is requested.",
      moodHit:"Mood",weatherHit:"Weather",colorHit:"Color theme",next:"Surprise me again",tried:"Already tried",
      add:"Add pairing to order",adding:"Adding…",openOrder:"Review order",
      success:"Pairing added to your order draft. Payment and confirmation happen at the café.",
      failure:"Could not save the order. Check browser storage and try again.",
      empty:"All pairings are marked as tried. Reset the list to choose again.",
      reset:"Reset tried pairings",price:"Menu total",checkoutNote:"Confirm availability and price at the counter.",
      discover:"Discover the taste",storyTitle:"Taste discovered",storyLine:"Explore this pairing and imagine how the two products go together.",
      progress:"Tastes discovered",views:"Your views",like:"Like",shareTitle:"Who would you try this with?",shareLead:"Share this exact pairing with a friend, or simply skip.",
      share:"Share with a friend",skip:"Not now",offerTitle:"Want to try this pairing?",
      copied:"Link copied. You can now send it to a friend.",shareFallback:"Copy this link manually, or skip this step.",copyLink:"Pairing link",direct:"Choose this pair now"
    },
    tr: {
      eyebrow:"BUGÜNKÜ ROBY’S",title:"Bir renk seç. Yeni bir lezzet keşfet.",intro:"Ruh halin ve hava durumu, gerçek menüden içecek ve tatlı seçmene yardımcı olsun.",
      color:"1. Bir renk seç",mood:"2. Nasıl hissediyorsun?",weather:"3. Hava nasıl?",
      colors:{green:"Yeşil",coral:"Mercan",blue:"Mavi",amber:"Kehribar"},
      moods:{fresh:"Serinlemek",comfort:"Sakin bir mola",energy:"Enerji",surprise:"Beni şaşırt"},
      weathers:{hot:"Sıcak",cool:"Serin",rain:"Yağmurlu"},
      recommended:"Sana özel ikili",newPair:"Öneri; ayrı bir indirim veya onaylı set değil",
      why:"Neden bu ikili?",note:"Bu kuralları açıklar, satış etkisini kanıtlamaz.",
      inputs:"Seçimlerin",eligible:"Menüde doğrulandı",ranking:"Tercih uyumu",output:"Öneri",
      weatherInfo:"Hava durumu elle seçilir. Konum istenmez.",
      moodHit:"Ruh hali",weatherHit:"Hava",colorHit:"Renk teması",next:"Başka bir fikir",tried:"Denedim",
      add:"İkiliyi siparişe ekle",adding:"Ekleniyor…",openOrder:"Siparişi gör",
      success:"İkili sipariş taslağına eklendi. Ödeme ve onay kafede yapılır.",
      failure:"Sipariş kaydedilemedi. Tarayıcı depolamasını kontrol edip tekrar deneyin.",
      empty:"Tüm ikilileri denedin olarak işaretledin. Yeniden başlamak için sıfırla.",
      reset:"İşaretleri sıfırla",price:"Menü toplamı",checkoutNote:"Stok ve güncel fiyatı kasada doğrulayın.",
      discover:"Lezzeti keşfet",storyTitle:"Bu lezzeti keşfettin",storyLine:"Bu ikiliyi keşfet ve iki ürünün birlikte nasıl bir tat vereceğini hayal et.",
      progress:"Keşfedilen lezzet",views:"Kendi görüntülemelerin",like:"Beğen",shareTitle:"Bu ikiliyi kiminle denemek istersin?",shareLead:"Bu ikiliyi arkadaşınla paylaş veya bu adımı geç.",
      share:"Arkadaşınla paylaş",skip:"Şimdi değil",offerTitle:"Bu ikiliyi denemek ister misin?",
      copied:"Bağlantı kopyalandı. Arkadaşına gönderebilirsin.",shareFallback:"Bağlantıyı elle kopyala veya geç.",copyLink:"İkili bağlantısı",direct:"İkiliyi hemen seç"
    }
  };
  const colorNames = ["green","coral","blue","amber"];
  const moodNames = ["fresh","comfort","energy","surprise"];
  const weatherNames = ["hot","cool","rain"];
  const triedKey = "robys-mood-pairs-tried.v1";
  const traceKey = "robys-mood-pair-trace.v1";
  const tasteKey = "robys-mood-taste-journey.v1";
  const taste = (() => {
    try {
      const data = JSON.parse(localStorage.getItem(tasteKey) || "{}");
      return {
        views: data && typeof data.views === "object" && !Array.isArray(data.views) ? data.views : {},
        liked: data && typeof data.liked === "object" && !Array.isArray(data.liked) ? data.liked : {},
        discovered: data && typeof data.discovered === "object" && !Array.isArray(data.discovered) ? data.discovered : {}
      };
    } catch { return { views:{}, liked:{}, discovered:{} }; }
  })();
  const journey = { pairId:"", phase:"intro", notice:"", fallbackLink:"" };
  const saveTaste = () => {
    try { localStorage.setItem(tasteKey, JSON.stringify(taste)); } catch { /* optional storage */ }
  };
  const sharedPairId = new URLSearchParams(location.search).get("pair");
  const knownPairIds = new Set(PAIR_RULES.map(rule => rule.id));

  const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const products = menuCategories.flatMap(category => (category.items ??
    category.groups?.flatMap(group => group.items) ?? []).map(item => ({
      id:`${category.id}:${item.id ?? slug(item.name.en)}`,
      sourceId:`${category.id}--${item.id ?? slug(item.name.en)}`,
      image: item.image ?? `src/products/menu-v1/${category.id}--${slug(item.name.en)}.webp`
    })));
  const sourceToMenu = new Map(products.map(p => [p.sourceId,p.id]));
  const sourceToDetail = new Map(products.map(p => [p.sourceId,p]));
  const validIds = new Set(products.map(p => p.id));
  const safeRead = () => {
    try {
      const value = JSON.parse(localStorage.getItem(triedKey) || "[]");
      return Array.isArray(value) ? value.filter(id => typeof id === "string").slice(0,100) : [];
    } catch { return []; }
  };
  const state = { color:"green", mood:"fresh", weather:"hot", tried:safeRead(), offset:0 };
  let busy = false;
  let message = "";

  function resetJourneyIfChanged(pair) {
    if (journey.pairId === (pair?.id ?? "")) return;
    journey.pairId = pair?.id ?? "";
    journey.phase = "intro";
    journey.notice = "";
    journey.fallbackLink = "";
  }
  function openTaste(pair) {
    resetJourneyIfChanged(pair);
    if (journey.phase === "intro") {
      journey.phase = "share";
      const count = Number(taste.views[pair.id]);
      taste.views[pair.id] = Number.isSafeInteger(count) && count >= 0
        ? Math.min(count + 1, 99999) : 1;
      taste.discovered[pair.id] = true;
      saveTaste();
      record("taste-opened",pair);
    }
    render("like");
  }
  function pairShareUrl(pair) {
    const url = new URL("index.html", location.href);
    url.search = "";
    url.searchParams.set("pair",pair.id);
    url.hash = "quick";
    return url.href;
  }
  async function sharePair(pair) {
    const language = lang(), labels = text[language], url = pairShareUrl(pair);
    journey.notice = "";
    journey.fallbackLink = "";
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({title:pair.drink.name[language]+" + "+pair.snack.name[language],url});
        journey.phase = "offer";
        record("share-sheet-resolved",pair);
        render("add");
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          record("share-cancelled",pair);
          render("share");
          return;
        }
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("No clipboard");
      await navigator.clipboard.writeText(url);
      journey.notice = labels.copied;
      journey.phase = "offer";
      record("share-link-copied",pair);
      render("add");
    } catch {
      journey.notice = labels.shareFallback;
      journey.fallbackLink = url;
      record("share-fallback-shown",pair);
      render("skip");
    }
  }
  const lang = () => ["ru","en","tr"].includes(document.documentElement.lang)
    ? document.documentElement.lang : "tr";
  const node = (tag, className, content) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (content !== undefined) e.textContent = content;
    return e;
  };
  const money = (n,language) => new Intl.NumberFormat(
    language==="ru"?"ru-RU":language==="en"?"en-US":"tr-TR",
    {style:"currency",currency:"TRY",maximumFractionDigits:0}).format(n/100);
  function record(event, pair) {
    // Mechanism-only causal decision graph, local and bounded. No remote telemetry.
    try {
      const stored = JSON.parse(sessionStorage.getItem(traceKey) || "{}");
      const events = Array.isArray(stored.events) ? stored.events.slice(-49) : [];
      events.push({
        sequence: events.length ? events[events.length - 1].sequence + 1 : 1,
        event, occurredAt: new Date().toISOString(),
        ...(pair ? { pairId:pair.id,totalMinor:pair.totalMinor,inputs:pair.trace.inputs,
          scoring:pair.trace.scoring,selectedIds:pair.trace.selectedIds }: {})
      });
      sessionStorage.setItem(traceKey,JSON.stringify({
        version:MOOD_GRAPH_VERSION, catalogVersion:pair?.trace.catalogVersion ?? null,
        claimLevel:"mechanism-only", randomizedExperimentRequiredForSalesEffect:true,
        latestRecommendation:pair?.trace ?? null, events
      }));
    } catch { /* optional */ }
  }
  function controls(label,names,active,values,key,copy) {
    const field = node("fieldset","mood-controls");
    const legend = node("legend","mood-label",label);
    const options = node("div",key==="color"?"mood-options mood-colors":"mood-options");
    names.forEach(name => {
      const button = node("button","mood-option",values[name]);
      button.type = "button";
      button.dataset.choiceKey = `${key}:${name}`;
      button.setAttribute("aria-pressed",String(active===name));
      if(key==="color") {
        const dot = node("span",`mood-dot mood-dot--${name}`);
        dot.setAttribute("aria-hidden","true");button.prepend(dot);
      }
      button.addEventListener("click",()=>{
        if(busy) return;
        state[key]=name;state.offset=0;message="";
        render(`${key}:${name}`);record("preferences-updated",recommendMoodPair(state));
      });
      options.append(button);
    });
    field.append(legend,options);
    return field;
  }
  function renderTasteJourney(pair, labels, language) {
    resetJourneyIfChanged(pair);
    const panel = node("section","mood-taste-journey");
    panel.setAttribute("aria-label",labels.storyTitle);
    const summary = node("div","mood-taste-stats");
    const discovered = Object.keys(taste.discovered).filter(id => knownPairIds.has(id) && taste.discovered[id] === true).length;
    const personalViews = Number(taste.views[pair.id]) || 0;
    summary.append(node("span","",`${labels.progress}: ${discovered}/${knownPairIds.size}`),
      node("span","",`${labels.views}: ${Math.max(0,personalViews)}`));
    panel.append(summary);
    if(journey.phase === "intro") {
      const start = node("button","mood-discover",labels.discover);
      start.type="button";start.dataset.choiceKey="discover";
      start.addEventListener("click",()=>openTaste(pair));
      panel.append(start);
      return panel;
    }
    const story = node("div","mood-taste-story");
    story.append(node("p","mood-eyebrow",labels.storyTitle),node("p","",labels.storyLine));
    for (const product of [pair.drink,pair.snack]) {
      const description = product.description?.[language];
      if (description) story.append(node("p","mood-small",description));
    }
    const like = node("button","mood-like",`♥  ${labels.like}`);
    like.type="button";like.dataset.choiceKey="like";
    like.setAttribute("aria-pressed", String(taste.liked[pair.id] === true));
    like.addEventListener("click",()=>{
      taste.liked[pair.id] = taste.liked[pair.id] !== true;
      saveTaste();
      record(taste.liked[pair.id] ? "taste-liked" : "taste-unliked",pair);
      render("like");
    });
    story.append(like);
    panel.append(story);
    const shareBox = node("div","mood-share-stage");
    if (journey.phase === "share") {
      shareBox.append(node("h4","",labels.shareTitle),node("p","mood-small",labels.shareLead));
      const buttons = node("div","mood-share-actions");
      const share = node("button","mood-secondary",labels.share);
      share.type="button";share.dataset.choiceKey="share";
      share.addEventListener("click",()=>{void sharePair(pair)});
      const skip = node("button","mood-secondary",labels.skip);
      skip.type="button";skip.dataset.choiceKey="skip";
      skip.addEventListener("click",()=>{journey.phase="offer";journey.notice="";journey.fallbackLink="";record("share-skipped",pair);render("add")});
      buttons.append(share,skip);
      shareBox.append(buttons);
      if(journey.fallbackLink){
        const label = node("label","mood-link-label",labels.copyLink);
        const field = node("input","mood-share-link");
        field.type="text";field.readOnly=true;field.value=journey.fallbackLink;
        field.addEventListener("focus",()=>field.select());
        label.append(field);
        shareBox.append(node("p","mood-small",journey.notice),label);
      }
    } else {
      shareBox.append(node("h4","",labels.offerTitle));
      if(journey.notice)shareBox.append(node("p","mood-small",journey.notice));
    }
    panel.append(shareBox);
    return panel;
  }
  function render(focusKey="") {
    const language = lang(),copy=text[language],pair=recommendMoodPair(state);
    resetJourneyIfChanged(pair);
    root.replaceChildren();
    root.hidden = false;
    root.setAttribute("aria-label",copy.title);
    root.dataset.tone = state.color;
    const header = node("div","mood-heading");
    header.append(node("p","mood-eyebrow",copy.eyebrow),node("h2","mood-title",copy.title),node("p","mood-intro",copy.intro));
    root.append(header,
      controls(copy.color,colorNames,state.color,copy.colors,"color",copy),
      controls(copy.mood,moodNames,state.mood,copy.moods,"mood",copy),
      controls(copy.weather,weatherNames,state.weather,copy.weathers,"weather",copy),
      node("p","mood-small",copy.weatherInfo));
    const result = node("div","mood-result");
    result.setAttribute("aria-label",copy.recommended);
    if (!pair) {
      result.append(node("p","",copy.empty));
      const reset=node("button","mood-secondary",copy.reset);
      reset.type="button";reset.addEventListener("click",()=>{state.tried=[];state.offset=0;try{localStorage.removeItem(triedKey)}catch{}render("reset")});
      reset.dataset.choiceKey="reset";result.append(reset);
    } else {
      const lead=node("div","mood-result-head");
      lead.append(node("span","mood-eyebrow",copy.recommended),node("strong","mood-price",money(pair.totalMinor,language)));
      const itemNames=node("h3","mood-pair-title",`${pair.drink.name[language]} + ${pair.snack.name[language]}`);
      const detail=node("p","mood-small",copy.newPair);
      const gallery=node("div","mood-gallery");
      for(const part of [pair.drink,pair.snack]) {
        const product=sourceToDetail.get(part.id);
        if(!product) continue;
        const figure=node("figure","mood-photo");
        const img=node("img");
        img.src="../"+product.image;
        img.alt=part.name[language];
        img.loading="lazy";
        img.decoding="async";
        img.width=img.height=320;
        img.addEventListener("error",()=>img.remove(),{once:true});
        figure.append(img,node("figcaption","",part.name[language]));
        gallery.append(figure);
      }
      const graph=node("details","mood-trace");
      graph.append(node("summary","",copy.why));
      const list=node("ol","mood-trace-list");
      for(const label of [copy.inputs,copy.eligible,copy.ranking,copy.output]) list.append(node("li","",label));
      const contributions=node("div","mood-contributions");
      for(const hit of pair.hits) {
        const row=node("div","mood-score");
        row.append(node("span","",({mood:copy.moodHit,weather:copy.weatherHit,color:copy.colorHit})[hit.code]),
          node("strong","",`+${hit.applied?hit.weight:0}`));
        contributions.append(row);
      }
      graph.append(list,contributions,node("p","mood-small",copy.note));
      const actions=node("div","mood-actions");
      const next=node("button","mood-secondary",copy.next);
      next.type="button";next.dataset.choiceKey="next";
      next.addEventListener("click",()=>{if(busy)return;state.offset++;message="";render("next");record("alternative-requested",recommendMoodPair(state))});
      const tried=node("button","mood-secondary",copy.tried);
      tried.type="button";tried.dataset.choiceKey="tried";
      tried.addEventListener("click",()=>{
        if(busy)return;
        state.tried=[...new Set([...state.tried,pair.id])];
        try{localStorage.setItem(triedKey,JSON.stringify(state.tried))}catch{}
        state.offset=0;message="";record("marked-tried",pair);render("tried");
      });
      const add=node("button","mood-primary",journey.phase === "offer" ? copy.add : copy.direct);
      add.type="button";add.dataset.choiceKey="add";add.disabled=busy;
      add.addEventListener("click",async()=>{
        if(busy)return;
        if(journey.phase !== "offer") record("direct-pair-choice",pair);
        const drinkId=sourceToMenu.get(pair.drink.id),snackId=sourceToMenu.get(pair.snack.id);
        if(!drinkId||!snackId){message=copy.failure;render("add");return;}
        busy=true;add.disabled=true;add.textContent=copy.adding;
        try {
          const output=await transactStoredOrderDraft(draft =>
            addOrderGroup(draft,[{id:drinkId,quantity:1},{id:snackId,quantity:1}],1,validIds),validIds);
          if(!output.applied) throw new Error("Order draft rejected");
          message=copy.success;record("pair-added-to-draft",pair);
        }catch {message=copy.failure;record("pair-add-failed",pair)}
        finally{busy=false;render("open-order")}
      });
      actions.append(next,tried,add);
      result.append(lead,itemNames,detail,gallery,renderTasteJourney(pair,copy,language),graph,actions);
      if(message===copy.success) {
        const open=node("button","mood-secondary",copy.openOrder);
        open.type="button";open.dataset.choiceKey="open-order";
        open.addEventListener("click",()=>{
          window.dispatchEvent(new CustomEvent("robys:quick-order"));
          document.getElementById("smart-choice-app")?.scrollIntoView({block:"start",behavior:"auto"});
        });
        actions.append(open);
      }
    }
    const status=node("p","mood-status",message);
    status.setAttribute("role",message===copy.failure?"alert":"status");
    status.setAttribute("aria-live","polite");
    result.append(status);
    root.append(result);
    if(focusKey)root.querySelectorAll("[data-choice-key]").forEach(el=>{if(el.dataset.choiceKey===focusKey)el.focus({preventScroll:true})});
  }
  new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  if (knownPairIds.has(sharedPairId)) {
    state.tried = state.tried.filter(id => id !== sharedPairId);
    for (let index=0; index<knownPairIds.size; index++) {
      const candidate=recommendMoodPair({...state,offset:index});
      if(candidate?.id === sharedPairId) { state.offset=index; break; }
    }
  }
  render();
  if (knownPairIds.has(sharedPairId)) {
    const shared=recommendMoodPair(state);
    if(shared?.id === sharedPairId) openTaste(shared);
  }
  record("recommendation-viewed",recommendMoodPair(state));
}
