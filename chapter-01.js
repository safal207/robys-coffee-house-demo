(() => {
  "use strict";

  const STORAGE_KEY = "robys-chapter-01-state-v1";
  const EVENTS_KEY = "robys-chapter-01-events-v1";
  const SCENES = ["teaser", "mood", "vote", "waiting", "reveal", "saved", "completed", "post-credit"];
  const supportedLanguages = ["tr", "en", "ru"];

  const copy = {
    ru: {
      chapterLabel: "ROBY’S · ГЛАВА №01",
      teaserTitle: "В Roby’s приближается новый момент.",
      teaserLead: "Он прохладный, немного сладкий и лучше работает, когда никуда не торопишься.",
      openSign: "Увидеть первый знак",
      viewMenu: "Посмотреть обычное меню",
      signOpened: "Первый знак открыт. Теперь эта история ждёт твоего выбора.",
      continueStory: "Продолжить историю",
      firstSign: "Первый знак",
      stepOne: "ШАГ 1 · ТВОЙ МОМЕНТ",
      moodTitle: "Какого момента тебе сейчас не хватает?",
      moodLead: "Здесь нет неправильного ответа. Выбери состояние, в которое хочется перейти.",
      moodCool: "Прохлада",
      moodCoolLead: "Хочу немного выдохнуть из жаркого дня.",
      moodCalm: "Спокойствие",
      moodCalmLead: "Хочу остановиться и никуда не торопиться.",
      moodEnergy: "Энергия",
      moodEnergyLead: "Хочу мягко вернуться в день.",
      moodCelebration: "Маленький праздник",
      moodCelebrationLead: "Хочу что-то хорошее без особого повода.",
      moodResponseCool: "Тогда эта история начинается со льда, мягкого кофе и свободного вечера.",
      moodResponseCalm: "Тогда эта история начинается с паузы, которую не нужно заслуживать.",
      moodResponseEnergy: "Тогда тебе нужен вкус, который возвращает в день без лишнего шума.",
      moodResponseCelebration: "Тогда сегодня у нас есть повод, даже если повода нет.",
      stepTwo: "ШАГ 2 · ТВОЙ ГОЛОС",
      voteTitle: "Что должно завершить этот момент?",
      voteLead: "Выбери спутника холодного латте. В реальном запуске победит голос гостей Roby’s.",
      cakeLead: "Сливочный, мягкий и созданный для медленного вечера.",
      macaron: "Фисташковый макарон",
      macaronLead: "Лёгкий, яркий и немного неожиданный.",
      chooseThis: "Выбираю это",
      voteAccepted: "Твой голос принят. Мы сохранили его на этом устройстве. Результаты в прототипе не выдумываются.",
      notifyLegend: "Как сообщить продолжение?",
      phoneNotification: "Уведомление на телефон",
      noSubscription: "Без подписки — сохранить только здесь",
      privacyNote: "На MVP-этапе выбор канала сохраняется локально. Реальная подписка не выполняется.",
      seeWaiting: "Перейти к ожиданию",
      betweenChapters: "МЕЖДУ ГЛАВАМИ",
      waitingTitle: "Теперь осталось немного подождать.",
      waitingLead: "Первое раскрытие запланировано на пятницу, 31 июля, после 16:00.",
      personalChoice: "Твой выбор: {choice}",
      whyWorks: "Почему это сочетание может сработать?",
      whyWorksLead: "Холодный кофе возвращает лёгкость. Сливочный десерт замедляет момент. Вместе они создают паузу между жарким днём и спокойным вечером.",
      openRevealDemo: "Открыть reveal в прототипе",
      changeChoice: "Изменить выбор",
      chapterOpened: "ГЛАВА №01 ОТКРЫТА",
      chapterTitle: "Летний вечер прохлады",
      chapterPromise: "Холодный латте возвращает лёгкость. San Sebastian разрешает никуда не торопиться.",
      latteLead: "Мягкий холодный кофе.",
      cakeShort: "Сливочный чизкейк.",
      priceTruth: "Цена равна стоимости двух позиций меню. Скидка не заявлена.",
      availabilityPrototype: "Прототип: реальная доступность и часы события ещё не подключены.",
      wantMoment: "Хочу этот момент",
      sendFriend: "Отправить другу",
      chapterNumber: "Глава №01",
      passTime: "Пятница · после 16:00",
      qrLater: "QR будет подключён после staff-flow",
      passWarning: "Это прототип, а не подтверждение заказа или резервирования.",
      showBarista: "Показать бариста",
      getRoute: "Построить маршрут",
      simulateVisit: "Демо: отметить визит",
      momentComplete: "МОМЕНТ СОХРАНЁН",
      completedTitle: "Ты открыл первую главу Roby’s.",
      completedLead: "В боевой версии это состояние появится только после подтверждённого визита или покупки.",
      myMoment: "МОЙ МОМЕНТ №01",
      reactionQuestion: "Каким был этот момент?",
      reactionNeeded: "Именно то, что было нужно",
      reactionRepeat: "Хочу повторить",
      reactionDifferent: "Хочу другое сочетание",
      seeNextSign: "Увидеть следующий знак",
      afterStory: "ПОСЛЕ ИСТОРИИ",
      postCreditTitle: "На следующей неделе кольцо станет теплее.",
      postCreditLead: "Первые, кто заметит новый знак, смогут повлиять на следующую главу.",
      seeFirst: "Увидеть первым",
      returnCafe: "Вернуться в Roby’s",
      reset: "Сбросить",
      showBaristaTitle: "Покажите этот экран бариста",
      prototypeNoOrder: "Прототип не создаёт заказ, оплату или резерв.",
      signToast: "Первый знак открыт.",
      sharedToast: "Ссылка на главу скопирована.",
      passSharedToast: "Moment Pass скопирован.",
      nextOptinToast: "Интерес к следующей главе сохранён локально.",
      resetToast: "Прототип сброшен.",
      notificationSaved: "Канал продолжения сохранён: {channel}.",
      voteSan: "San Sebastian",
      voteMacaron: "фисташковый макарон"
    },
    en: {
      chapterLabel: "ROBY’S · CHAPTER 01",
      teaserTitle: "A new moment is approaching at Roby’s.",
      teaserLead: "It is cool, a little sweet, and works best when you are in no hurry.",
      openSign: "Reveal the first sign",
      viewMenu: "View the regular menu",
      signOpened: "The first sign is open. Now this story is waiting for your choice.",
      continueStory: "Continue the story",
      firstSign: "First sign",
      stepOne: "STEP 1 · YOUR MOMENT",
      moodTitle: "What kind of moment are you missing right now?",
      moodLead: "There is no wrong answer. Choose the state you want to move into.",
      moodCool: "Coolness",
      moodCoolLead: "I want to step out of the heat for a while.",
      moodCalm: "Calm",
      moodCalmLead: "I want to pause and stop rushing.",
      moodEnergy: "Energy",
      moodEnergyLead: "I want to return gently to my day.",
      moodCelebration: "A small celebration",
      moodCelebrationLead: "I want something good without needing a reason.",
      moodResponseCool: "Then this story begins with ice, soft coffee, and a free evening.",
      moodResponseCalm: "Then this story begins with a pause you do not have to earn.",
      moodResponseEnergy: "Then you need a taste that brings you back without extra noise.",
      moodResponseCelebration: "Then today we have a reason, even if there is no reason.",
      stepTwo: "STEP 2 · YOUR VOTE",
      voteTitle: "What should complete this moment?",
      voteLead: "Choose a companion for iced latte. In a real launch, Roby’s guests decide the winner.",
      cakeLead: "Creamy, soft, and made for a slow evening.",
      macaron: "Pistachio macaron",
      macaronLead: "Light, bright, and a little unexpected.",
      chooseThis: "Choose this",
      voteAccepted: "Your vote is recorded on this device. The prototype never invents public results.",
      notifyLegend: "How should the story continue?",
      phoneNotification: "Phone notification",
      noSubscription: "No subscription — save only here",
      privacyNote: "In this MVP, the channel choice is stored locally. No real subscription is created.",
      seeWaiting: "Enter the waiting scene",
      betweenChapters: "BETWEEN CHAPTERS",
      waitingTitle: "Now there is just a little waiting left.",
      waitingLead: "The first reveal is planned for Friday, July 31, after 4:00 PM.",
      personalChoice: "Your choice: {choice}",
      whyWorks: "Why might this pairing work?",
      whyWorksLead: "Iced coffee brings back lightness. A creamy dessert slows the moment down. Together they create a pause between a hot day and a calm evening.",
      openRevealDemo: "Open the reveal in the prototype",
      changeChoice: "Change the choice",
      chapterOpened: "CHAPTER 01 IS OPEN",
      chapterTitle: "A Cool Summer Evening",
      chapterPromise: "Iced latte brings back lightness. San Sebastian gives you permission not to rush.",
      latteLead: "Soft iced coffee.",
      cakeShort: "Creamy cheesecake.",
      priceTruth: "The price equals the two regular menu items. No discount is claimed.",
      availabilityPrototype: "Prototype: live availability and event hours are not connected yet.",
      wantMoment: "I want this moment",
      sendFriend: "Send to a friend",
      chapterNumber: "Chapter 01",
      passTime: "Friday · after 4:00 PM",
      qrLater: "QR will be connected after the staff flow",
      passWarning: "This is a prototype, not an order or reservation confirmation.",
      showBarista: "Show the barista",
      getRoute: "Get directions",
      simulateVisit: "Demo: mark a visit",
      momentComplete: "MOMENT SAVED",
      completedTitle: "You opened the first Roby’s chapter.",
      completedLead: "In production, this state appears only after a confirmed visit or purchase.",
      myMoment: "MY MOMENT 01",
      reactionQuestion: "How did this moment feel?",
      reactionNeeded: "Exactly what I needed",
      reactionRepeat: "I want it again",
      reactionDifferent: "I want a different pairing",
      seeNextSign: "See the next sign",
      afterStory: "AFTER THE STORY",
      postCreditTitle: "Next week, the ring will become warmer.",
      postCreditLead: "The first people to notice the new sign can influence the next chapter.",
      seeFirst: "See it first",
      returnCafe: "Return to Roby’s",
      reset: "Reset",
      showBaristaTitle: "Show this screen to the barista",
      prototypeNoOrder: "The prototype does not create an order, payment, or reservation.",
      signToast: "The first sign is open.",
      sharedToast: "Chapter link copied.",
      passSharedToast: "Moment Pass copied.",
      nextOptinToast: "Interest in the next chapter was saved locally.",
      resetToast: "Prototype reset.",
      notificationSaved: "Continuation channel saved: {channel}.",
      voteSan: "San Sebastian",
      voteMacaron: "pistachio macaron"
    },
    tr: {
      chapterLabel: "ROBY’S · BÖLÜM 01",
      teaserTitle: "Roby’s’te yeni bir an yaklaşıyor.",
      teaserLead: "Serin, biraz tatlı ve acele etmediğinde daha güzel.",
      openSign: "İlk işareti gör",
      viewMenu: "Normal menüyü aç",
      signOpened: "İlk işaret açıldı. Şimdi bu hikâye senin seçimini bekliyor.",
      continueStory: "Hikâyeye devam et",
      firstSign: "İlk işaret",
      stepOne: "ADIM 1 · SENİN ANIN",
      moodTitle: "Şu anda nasıl bir ana ihtiyacın var?",
      moodLead: "Yanlış cevap yok. Geçmek istediğin hissi seç.",
      moodCool: "Serinlik",
      moodCoolLead: "Sıcak günden biraz uzaklaşmak istiyorum.",
      moodCalm: "Sakinlik",
      moodCalmLead: "Durmak ve acele etmemek istiyorum.",
      moodEnergy: "Enerji",
      moodEnergyLead: "Günüme yumuşakça dönmek istiyorum.",
      moodCelebration: "Küçük bir kutlama",
      moodCelebrationLead: "Özel bir sebep olmadan güzel bir şey istiyorum.",
      moodResponseCool: "O zaman bu hikâye buz, yumuşak kahve ve özgür bir akşamla başlıyor.",
      moodResponseCalm: "O zaman bu hikâye hak etmek zorunda olmadığın bir molayla başlıyor.",
      moodResponseEnergy: "O zaman seni gürültüsüzce güne döndüren bir tada ihtiyacın var.",
      moodResponseCelebration: "O zaman sebep olmasa bile bugün bir sebebimiz var.",
      stepTwo: "ADIM 2 · SENİN OYUN",
      voteTitle: "Bu anı ne tamamlamalı?",
      voteLead: "Buzlu latteye bir eşlikçi seç. Gerçek lansmanda kazananı Roby’s misafirleri belirler.",
      cakeLead: "Kremamsı, yumuşak ve yavaş bir akşam için.",
      macaron: "Fıstıklı makaron",
      macaronLead: "Hafif, parlak ve biraz beklenmedik.",
      chooseThis: "Bunu seçiyorum",
      voteAccepted: "Oyun bu cihazda kaydedildi. Prototip herkese açık sonuç uydurmaz.",
      notifyLegend: "Devamı nasıl gelsin?",
      phoneNotification: "Telefon bildirimi",
      noSubscription: "Abonelik yok — sadece burada sakla",
      privacyNote: "Bu MVP’de kanal seçimi yalnızca yerel olarak saklanır. Gerçek abonelik yapılmaz.",
      seeWaiting: "Bekleme sahnesine geç",
      betweenChapters: "BÖLÜMLER ARASINDA",
      waitingTitle: "Şimdi biraz beklemek kaldı.",
      waitingLead: "İlk açılış 31 Temmuz Cuma günü saat 16.00’dan sonra planlanıyor.",
      personalChoice: "Senin seçimin: {choice}",
      whyWorks: "Bu eşleşme neden işe yarayabilir?",
      whyWorksLead: "Soğuk kahve hafifliği geri getirir. Kremamsı tatlı anı yavaşlatır. Birlikte sıcak gün ile sakin akşam arasında bir mola yaratırlar.",
      openRevealDemo: "Prototipte açılışı göster",
      changeChoice: "Seçimi değiştir",
      chapterOpened: "BÖLÜM 01 AÇILDI",
      chapterTitle: "Serin Bir Yaz Akşamı",
      chapterPromise: "Buzlu latte hafifliği geri getirir. San Sebastian acele etmeme izni verir.",
      latteLead: "Yumuşak buzlu kahve.",
      cakeShort: "Kremamsı cheesecake.",
      priceTruth: "Fiyat iki normal menü ürününün toplamıdır. İndirim iddiası yoktur.",
      availabilityPrototype: "Prototip: canlı stok ve etkinlik saatleri henüz bağlı değil.",
      wantMoment: "Bu anı istiyorum",
      sendFriend: "Arkadaşa gönder",
      chapterNumber: "Bölüm 01",
      passTime: "Cuma · 16.00’dan sonra",
      qrLater: "QR, personel akışından sonra bağlanacak",
      passWarning: "Bu bir prototiptir; sipariş veya rezervasyon onayı değildir.",
      showBarista: "Baristaya göster",
      getRoute: "Yol tarifi al",
      simulateVisit: "Demo: ziyareti işaretle",
      momentComplete: "AN KAYDEDİLDİ",
      completedTitle: "Roby’s’in ilk bölümünü açtın.",
      completedLead: "Canlı sürümde bu durum yalnızca doğrulanmış ziyaret veya satın alma sonrası görünür.",
      myMoment: "BENİM ANIM 01",
      reactionQuestion: "Bu an nasıldı?",
      reactionNeeded: "Tam ihtiyacım olan şeydi",
      reactionRepeat: "Tekrar istiyorum",
      reactionDifferent: "Farklı bir eşleşme istiyorum",
      seeNextSign: "Sonraki işareti gör",
      afterStory: "HİKÂYEDEN SONRA",
      postCreditTitle: "Gelecek hafta halka daha sıcak olacak.",
      postCreditLead: "Yeni işareti ilk fark edenler bir sonraki bölümü etkileyebilecek.",
      seeFirst: "İlk gören ol",
      returnCafe: "Roby’s’e dön",
      reset: "Sıfırla",
      showBaristaTitle: "Bu ekranı baristaya göster",
      prototypeNoOrder: "Prototip sipariş, ödeme veya rezervasyon oluşturmaz.",
      signToast: "İlk işaret açıldı.",
      sharedToast: "Bölüm bağlantısı kopyalandı.",
      passSharedToast: "Moment Pass kopyalandı.",
      nextOptinToast: "Sonraki bölüme ilgi yerel olarak kaydedildi.",
      resetToast: "Prototip sıfırlandı.",
      notificationSaved: "Devam kanalı kaydedildi: {channel}.",
      voteSan: "San Sebastian",
      voteMacaron: "fıstıklı makaron"
    }
  };

  const moodResponseKey = {
    cool: "moodResponseCool",
    calm: "moodResponseCalm",
    energy: "moodResponseEnergy",
    celebration: "moodResponseCelebration"
  };

  const defaultState = {
    version: 1,
    scene: "teaser",
    language: "ru",
    signOpened: false,
    mood: null,
    vote: null,
    channel: "none",
    passCode: null,
    reaction: null,
    nextChapterOptIn: false,
    updatedAt: null
  };

  let state = readState();
  let toastTimer = null;

  function readState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || stored.version !== defaultState.version) return { ...defaultState };
      return {
        ...defaultState,
        ...stored,
        language: supportedLanguages.includes(stored.language) ? stored.language : "ru",
        scene: SCENES.includes(stored.scene) ? stored.scene : "teaser"
      };
    } catch {
      return { ...defaultState };
    }
  }

  function persistState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The prototype remains usable without persistent storage.
    }
  }

  function recordEvent(name, payload = {}) {
    const event = {
      name,
      chapterId: "summer-cool-evening-01",
      scene: state.scene,
      language: state.language,
      at: new Date().toISOString(),
      ...payload
    };

    try {
      const current = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
      current.push(event);
      localStorage.setItem(EVENTS_KEY, JSON.stringify(current.slice(-100)));
    } catch {
      // Analytics evidence is optional in the closed prototype.
    }

    window.dispatchEvent(new CustomEvent("robys:chapter-event", { detail: event }));
    console.info("[Roby's Chapter 01]", event);
  }

  function text(key) {
    return copy[state.language]?.[key] ?? copy.ru[key] ?? key;
  }

  function interpolate(template, variables) {
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
      template
    );
  }

  function translatePage() {
    document.documentElement.lang = state.language;
    document.title = `${text("chapterNumber")} · ${text("chapterTitle")} | Roby's`;

    document.querySelectorAll("[data-copy]").forEach((element) => {
      const key = element.dataset.copy;
      const value = text(key);
      if (value) element.textContent = value;
    });

    document.querySelectorAll(".lang-button").forEach((button) => {
      const active = button.dataset.lang === state.language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function selectedVoteName() {
    if (state.vote === "pistachio-macaron") return text("voteMacaron");
    return text("voteSan");
  }

  function ensureSceneData(scene) {
    if (["vote", "waiting", "reveal", "saved", "completed", "post-credit"].includes(scene) && !state.mood) {
      state.mood = "cool";
    }
    if (["waiting", "reveal", "saved", "completed", "post-credit"].includes(scene) && !state.vote) {
      state.vote = "san-sebastian";
    }
    if (["saved", "completed", "post-credit"].includes(scene) && !state.passCode) {
      state.passCode = generatePassCode();
    }
    if (scene !== "teaser") state.signOpened = true;
  }

  function render() {
    ensureSceneData(state.scene);
    translatePage();

    document.querySelectorAll("[data-scene]").forEach((scene) => {
      const active = scene.dataset.scene === state.scene;
      scene.hidden = !active;
      scene.classList.toggle("is-active", active);
    });

    const signReveal = document.querySelector("[data-sign-reveal]");
    if (signReveal) signReveal.hidden = !state.signOpened;
    document.querySelector(".wonder-ring")?.classList.toggle("is-open", state.signOpened);

    document.querySelectorAll("[data-mood]").forEach((button) => {
      const selected = button.dataset.mood === state.mood;
      button.setAttribute("aria-checked", String(selected));
    });

    const moodResponse = document.querySelector("[data-mood-response]");
    if (moodResponse) moodResponse.textContent = state.mood ? text(moodResponseKey[state.mood]) : "";
    const moodNext = document.querySelector('[data-action="to-vote"]');
    if (moodNext) moodNext.disabled = !state.mood;

    document.querySelectorAll("[data-vote]").forEach((button) => {
      const selected = button.dataset.vote === state.vote;
      button.setAttribute("aria-checked", String(selected));
    });

    const voteConfirmation = document.querySelector("[data-vote-confirmation]");
    if (voteConfirmation) voteConfirmation.hidden = !state.vote;

    document.querySelectorAll('input[name="channel"]').forEach((input) => {
      input.checked = input.value === state.channel;
    });

    const personalChoice = document.querySelector("[data-personal-choice]");
    if (personalChoice) {
      personalChoice.textContent = state.vote
        ? interpolate(text("personalChoice"), { choice: selectedVoteName() })
        : "";
    }

    document.querySelectorAll("[data-pass-code], [data-barista-code]").forEach((element) => {
      element.textContent = state.passCode ?? "RBY-000";
    });

    document.querySelectorAll('input[name="reaction"]').forEach((input) => {
      input.checked = input.value === state.reaction;
    });

    const nextResponse = document.querySelector("[data-next-response]");
    if (nextResponse) {
      nextResponse.textContent = state.nextChapterOptIn ? text("nextOptinToast") : "";
    }

    const prototypeState = document.querySelector("[data-prototype-state]");
    if (prototypeState) prototypeState.textContent = state.scene.toUpperCase();

    persistState();
  }

  function setScene(scene, { record = true } = {}) {
    if (!SCENES.includes(scene)) return;
    ensureSceneData(scene);
    state.scene = scene;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (record) recordEvent("chapter_scene_viewed", { targetScene: scene });
  }

  function generatePassCode() {
    const values = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(values);
      return `RBY-${String(values[0] % 1000).padStart(3, "0")}`;
    }
    return `RBY-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  }

  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  async function share(payload, fallbackText, successMessage) {
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fallbackText);
      } else {
        window.prompt("Copy", fallbackText);
      }
      showToast(successMessage);
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") console.warn("Share failed", error);
      return false;
    }
  }

  function shareChapter() {
    const url = new URL(window.location.href);
    url.hash = "chapter-01";
    share(
      { title: text("chapterTitle"), text: text("chapterPromise"), url: url.href },
      `${text("chapterTitle")} — ${url.href}`,
      text("sharedToast")
    ).then((shared) => {
      if (shared) recordEvent("chapter_shared");
    });
  }

  function sharePass() {
    const message = `${text("chapterTitle")} · Iced Latte + San Sebastian · 370 ₺ · ${state.passCode}`;
    share(
      { title: "Roby's Moment Pass", text: message, url: window.location.href },
      message,
      text("passSharedToast")
    ).then((shared) => {
      if (shared) recordEvent("moment_pass_shared", { passCode: state.passCode });
    });
  }

  function showBaristaDialog() {
    const dialog = document.querySelector("[data-barista-dialog]");
    if (!dialog) return;
    document.body.classList.add("dialog-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    recordEvent("moment_pass_barista_opened", { passCode: state.passCode });
  }

  function closeBaristaDialog() {
    const dialog = document.querySelector("[data-barista-dialog]");
    if (!dialog) return;
    document.body.classList.remove("dialog-open");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function resetPrototype() {
    state = { ...defaultState, language: state.language };
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(EVENTS_KEY);
    } catch {
      // Ignore storage restrictions.
    }
    closeBaristaDialog();
    render();
    showToast(text("resetToast"));
    recordEvent("chapter_prototype_reset");
  }

  function prototypeMove(direction) {
    const current = SCENES.indexOf(state.scene);
    const target = Math.min(SCENES.length - 1, Math.max(0, current + direction));
    setScene(SCENES[target]);
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;

    switch (action) {
      case "open-sign":
        state.signOpened = true;
        render();
        showToast(text("signToast"));
        recordEvent("chapter_first_sign_opened");
        break;
      case "to-mood":
        setScene("mood");
        break;
      case "to-vote":
        if (state.mood) setScene("vote");
        break;
      case "to-waiting":
        setScene("waiting");
        recordEvent("chapter_result_optin_saved", { channel: state.channel });
        if (state.channel !== "none") {
          showToast(interpolate(text("notificationSaved"), { channel: state.channel }));
        }
        break;
      case "back-to-vote":
        setScene("vote");
        break;
      case "to-reveal":
        setScene("reveal");
        recordEvent("chapter_reveal_viewed", { vote: state.vote });
        break;
      case "save-moment":
        if (!state.passCode) state.passCode = generatePassCode();
        setScene("saved");
        recordEvent("moment_pass_created", { passCode: state.passCode, price: 370, currency: "TRY" });
        break;
      case "share-chapter":
        shareChapter();
        break;
      case "share-pass":
        sharePass();
        break;
      case "show-barista":
        showBaristaDialog();
        break;
      case "close-barista":
        closeBaristaDialog();
        break;
      case "route":
        recordEvent("moment_pass_route_opened", { passCode: state.passCode });
        break;
      case "complete-demo":
        setScene("completed");
        recordEvent("chapter_visit_simulated", { passCode: state.passCode });
        break;
      case "to-post-credit":
        setScene("post-credit");
        recordEvent("chapter_post_credit_viewed");
        break;
      case "next-optin":
        state.nextChapterOptIn = true;
        render();
        showToast(text("nextOptinToast"));
        recordEvent("next_chapter_interest_saved");
        break;
      case "prototype-prev":
        prototypeMove(-1);
        break;
      case "prototype-next":
        prototypeMove(1);
        break;
      case "reset":
        resetPrototype();
        break;
      default:
        break;
    }
  });

  document.addEventListener("click", (event) => {
    const moodButton = event.target.closest("[data-mood]");
    if (moodButton) {
      state.mood = moodButton.dataset.mood;
      render();
      recordEvent("chapter_mood_selected", { mood: state.mood });
      return;
    }

    const voteButton = event.target.closest("[data-vote]");
    if (voteButton) {
      state.vote = voteButton.dataset.vote;
      render();
      recordEvent("chapter_vote_submitted", { vote: state.vote });
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches('input[name="channel"]')) {
      state.channel = event.target.value;
      persistState();
      recordEvent("chapter_channel_selected", { channel: state.channel });
    }

    if (event.target.matches('input[name="reaction"]')) {
      state.reaction = event.target.value;
      persistState();
      recordEvent("chapter_reaction_recorded", { reaction: state.reaction });
    }
  });

  document.querySelectorAll(".lang-button").forEach((button) => {
    button.addEventListener("click", () => {
      const language = button.dataset.lang;
      if (!supportedLanguages.includes(language)) return;
      state.language = language;
      render();
      recordEvent("chapter_language_changed", { selectedLanguage: language });
    });
  });

  document.querySelector("[data-barista-dialog]")?.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
  });

  window.robysChapter01 = {
    getState: () => structuredClone(state),
    getEvents: () => {
      try {
        return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
      } catch {
        return [];
      }
    },
    setScene,
    reset: resetPrototype
  };

  render();
  recordEvent("chapter_prototype_loaded");
})();
