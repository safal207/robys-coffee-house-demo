import {
  SMART_CHOICE_CATALOG,
  type PartySize,
  type SmartChoiceIntent,
  type SmartChoiceLanguage
} from "./catalog.js";
import {
  recommendSmartChoice,
  type RankedRecommendation,
  type RecommendationInput,
  type RecommendationResult,
  type RequestedTaste,
  type RequestedTemperature
} from "./engine.js";

type LocalizedText = Record<SmartChoiceLanguage, string>;
type Screen = "welcome" | "question" | "results" | "selected";
type AnswerKey = "intent" | "temperature" | "taste" | "partySize" | "budgetKey";

type Answers = Partial<Record<AnswerKey, string>>;

interface FlowState {
  version: 1;
  screen: Screen;
  questionIndex: number;
  answers: Answers;
  locale: SmartChoiceLanguage;
  selectedCandidateId?: string;
}

interface QuestionOption {
  value: string;
  label: LocalizedText;
  note?: LocalizedText;
}

interface QuestionDefinition {
  id: AnswerKey;
  title: LocalizedText;
  help: LocalizedText;
  options: readonly QuestionOption[];
}

interface BudgetDefinition {
  minMinor?: number;
  maxMinor: number;
}

const STORAGE_KEY = "robys-smart-choice-session.v1";
const LANGUAGE_KEY = "robys-language";
const STATE_VERSION = 1;

const localeTag: Record<SmartChoiceLanguage, string> = {
  tr: "tr-TR",
  en: "en-US",
  ru: "ru-RU"
};

const copy = {
  tr: {
    fullMenu: "Tam Menü",
    footerNote: "Smart Choice bir seçim yardımcısıdır. Bu ekranda sipariş veya ödeme alınmaz.",
    eyebrow: "ROBY'S SMART CHOICE",
    welcomeTitle: "Bugünkü Roby's anınızı birlikte seçelim.",
    welcomeLead: "Beş kısa seçim yapın. Size bütçenize ve isteğinize uyan doğrulanmış bir Roby's seçimi gösterelim.",
    start: "Seçime başla",
    openMenu: "Tam menüyü aç",
    trustFast: "Yaklaşık 30–45 saniye",
    trustHonest: "Gizli ücret yok",
    trustSafe: "Henüz sipariş gönderilmez",
    back: "Geri",
    restart: "Baştan başla",
    step: "Adım",
    of: "/",
    continue: "Devam et",
    resultsEyebrow: "SİZE UYGUN SEÇİMLER",
    resultsTitle: "Roby's seçiminiz hazır.",
    resultsLead: "Fiyat ve içerik açıkça gösterilir. Bir seçimi işaretlemek henüz sipariş göndermez.",
    best: "En iyi eşleşme",
    economy: "Daha ekonomik",
    premium: "Premium alternatif",
    choose: "Bunu seç",
    changeAnswers: "Cevapları değiştir",
    premiumWarning: "Bu alternatif seçtiğiniz bütçenin biraz üzerindedir ve açıkça premium olarak işaretlenmiştir.",
    selectedEyebrow: "SEÇİM KAYDEDİLDİ",
    selectedTitle: "Güzel seçim.",
    selectedNote: "Bu seçim yalnızca bu tarayıcı oturumunda saklandı. Kafeye, kasaya veya ödeme sistemine henüz sipariş gönderilmedi.",
    chooseAnother: "Başka bir seçim yap",
    noMatchEyebrow: "TAM EŞLEŞME YOK",
    noMatchTitle: "Bu tercihlerle doğrulanmış bir seçim bulamadık.",
    noMatchCopy: "Bütçenizi veya sıcaklık tercihinizi değiştirebilir ya da tam menüden özgürce seçim yapabilirsiniz.",
    invalidTitle: "Seçim bilgileri tamamlanamadı.",
    invalidCopy: "Lütfen cevapları yeniden kontrol edin. Hiçbir fiyat veya ürün tahmin edilmedi.",
    components: "İçindekiler",
    why: "Neden uygun",
    noOrder: "Sipariş gönderilmez",
    price: "Toplam fiyat"
  },
  en: {
    fullMenu: "Full menu",
    footerNote: "Smart Choice is a selection assistant. No order or payment is submitted on this screen.",
    eyebrow: "ROBY'S SMART CHOICE",
    welcomeTitle: "Let’s find your Roby's moment today.",
    welcomeLead: "Make five quick choices and get a verified Roby's menu choice that fits your preferences and budget.",
    start: "Start choosing",
    openMenu: "Open full menu",
    trustFast: "About 30–45 seconds",
    trustHonest: "No hidden charges",
    trustSafe: "No order is sent yet",
    back: "Back",
    restart: "Restart",
    step: "Step",
    of: "of",
    continue: "Continue",
    resultsEyebrow: "YOUR MATCHES",
    resultsTitle: "Your Roby's choice is ready.",
    resultsLead: "Price and contents stay visible. Selecting an option does not submit an order yet.",
    best: "Best match",
    economy: "Lower price",
    premium: "Premium alternative",
    choose: "Choose this",
    changeAnswers: "Change answers",
    premiumWarning: "This alternative is slightly above your chosen budget and is clearly marked as premium.",
    selectedEyebrow: "CHOICE SAVED",
    selectedTitle: "Lovely choice.",
    selectedNote: "This choice is stored only for this browser session. No order has been sent to the café, POS, or payment system.",
    chooseAnother: "Choose another",
    noMatchEyebrow: "NO EXACT MATCH",
    noMatchTitle: "We could not find a confirmed menu choice for all these preferences.",
    noMatchCopy: "Adjust your budget or temperature preference, or choose freely from the full menu.",
    invalidTitle: "We could not complete the selection.",
    invalidCopy: "Please review the answers. No product or price was guessed.",
    components: "Includes",
    why: "Why it fits",
    noOrder: "No order is sent",
    price: "Total price"
  },
  ru: {
    fullMenu: "Полное меню",
    footerNote: "Smart Choice помогает выбрать. На этом экране заказ и оплата ещё не отправляются.",
    eyebrow: "ROBY'S SMART CHOICE",
    welcomeTitle: "Давайте найдём ваш момент Roby's сегодня.",
    welcomeLead: "Сделайте пять коротких выборов — и получите подтверждённую позицию или сочетание Roby's под ваши предпочтения и бюджет.",
    start: "Начать выбор",
    openMenu: "Открыть полное меню",
    trustFast: "Около 30–45 секунд",
    trustHonest: "Без скрытых доплат",
    trustSafe: "Заказ пока не отправляется",
    back: "Назад",
    restart: "Начать заново",
    step: "Шаг",
    of: "из",
    continue: "Продолжить",
    resultsEyebrow: "ПОДХОДЯЩИЕ ВАРИАНТЫ",
    resultsTitle: "Ваш выбор Roby's готов.",
    resultsLead: "Состав и цена видны сразу. Выбор варианта пока не отправляет заказ.",
    best: "Лучшее совпадение",
    economy: "Экономнее",
    premium: "Премиальный вариант",
    choose: "Выбрать",
    changeAnswers: "Изменить ответы",
    premiumWarning: "Этот вариант немного превышает выбранный бюджет и явно отмечен как премиальный.",
    selectedEyebrow: "ВЫБОР СОХРАНЁН",
    selectedTitle: "Отличный выбор.",
    selectedNote: "Выбор сохранён только в этой сессии браузера. Заказ ещё не отправлен в кафе, кассу или платёжную систему.",
    chooseAnother: "Выбрать другое",
    noMatchEyebrow: "ТОЧНОГО СОВПАДЕНИЯ НЕТ",
    noMatchTitle: "Мы не нашли подтверждённый вариант под все эти условия.",
    noMatchCopy: "Измените бюджет или температуру напитка либо свободно выберите позицию в полном меню.",
    invalidTitle: "Не удалось завершить подбор.",
    invalidCopy: "Проверьте ответы ещё раз. Система не стала выдумывать товар или цену.",
    components: "Состав",
    why: "Почему подходит",
    noOrder: "Заказ не отправляется",
    price: "Итоговая цена"
  }
} satisfies Record<SmartChoiceLanguage, Record<string, string>>;

const questions: readonly QuestionDefinition[] = [
  {
    id: "intent",
    title: {
      tr: "Şu anda ne istiyorsunuz?",
      en: "What would you like right now?",
      ru: "Чего хочется прямо сейчас?"
    },
    help: {
      tr: "En yakın ihtiyacı seçin; daha sonra geri dönüp değiştirebilirsiniz.",
      en: "Choose the closest need. You can go back and change it later.",
      ru: "Выберите ближайшую потребность — ответ можно изменить позже."
    },
    options: [
      { value: "coffee", label: { tr: "Kahve", en: "Coffee", ru: "Кофе" }, note: { tr: "Hızlı bir kahve anı", en: "A quick coffee moment", ru: "Быстрый кофейный момент" } },
      { value: "breakfast", label: { tr: "Kahvaltı", en: "Breakfast", ru: "Завтрак" }, note: { tr: "İçecek veya doyurucu eşlikçi", en: "A drink or a satisfying bite", ru: "Напиток или сытное дополнение" } },
      { value: "snack", label: { tr: "Atıştırmalık", en: "Snack", ru: "Перекус" }, note: { tr: "Hafif bir mola", en: "A light break", ru: "Лёгкая пауза" } },
      { value: "dessert", label: { tr: "Tatlı", en: "Dessert", ru: "Десерт" }, note: { tr: "Tatlı bir Roby's anı", en: "A sweet Roby's moment", ru: "Сладкий момент Roby's" } },
      { value: "refresh", label: { tr: "Serinlemek", en: "Refresh", ru: "Освежиться" }, note: { tr: "Soğuk ve ferah", en: "Cold and refreshing", ru: "Холодное и освежающее" } }
    ]
  },
  {
    id: "temperature",
    title: { tr: "Sıcak mı, soğuk mu?", en: "Hot or cold?", ru: "Горячее или холодное?" },
    help: { tr: "Net bir tercihiniz yoksa fark etmez seçin.", en: "Choose any if you have no strong preference.", ru: "Выберите «без разницы», когда строгого предпочтения нет." },
    options: [
      { value: "hot", label: { tr: "Sıcak", en: "Hot", ru: "Горячее" } },
      { value: "cold", label: { tr: "Soğuk", en: "Cold", ru: "Холодное" } },
      { value: "any", label: { tr: "Fark etmez", en: "Either", ru: "Без разницы" } }
    ]
  },
  {
    id: "taste",
    title: { tr: "Hangi tat daha yakın?", en: "Which taste feels right?", ru: "Какой вкус сейчас ближе?" },
    help: { tr: "Tatlı, daha nötr veya ikisi de olabilir.", en: "Sweet, more neutral, or either one.", ru: "Сладкий, более нейтральный или любой." },
    options: [
      { value: "sweet", label: { tr: "Tatlı", en: "Sweet", ru: "Сладкое" } },
      { value: "neutral", label: { tr: "Daha nötr", en: "More neutral", ru: "Нейтральное" } },
      { value: "any", label: { tr: "Fark etmez", en: "Either", ru: "Без разницы" } }
    ]
  },
  {
    id: "partySize",
    title: { tr: "Kaç kişisiniz?", en: "How many people?", ru: "На сколько человек?" },
    help: { tr: "Bu cevap porsiyon uyumunu etkiler, fiyatı gizlice değiştirmez.", en: "This affects fit only and never changes the price secretly.", ru: "Ответ влияет на соответствие, но не меняет цену скрытно." },
    options: [
      { value: "one", label: { tr: "Bir kişi", en: "One", ru: "Один" } },
      { value: "two", label: { tr: "İki kişi", en: "Two", ru: "Двое" } },
      { value: "family", label: { tr: "Aile", en: "Family", ru: "Семья" } }
    ]
  },
  {
    id: "budgetKey",
    title: { tr: "Bütçeniz hangi aralıkta?", en: "What budget feels right?", ru: "Какой бюджет комфортен?" },
    help: { tr: "Normal öneri sınırı aşmaz. Daha pahalı seçenek yalnızca premium olarak gösterilebilir.", en: "The main recommendation stays within this limit. A higher option can only appear as clearly marked premium.", ru: "Основная рекомендация не превысит лимит. Более дорогой вариант появится только с явной пометкой premium." },
    options: [
      { value: "250", label: { tr: "250 ₺'ye kadar", en: "Up to 250 ₺", ru: "До 250 ₺" } },
      { value: "400", label: { tr: "400 ₺'ye kadar", en: "Up to 400 ₺", ru: "До 400 ₺" } },
      { value: "600", label: { tr: "600 ₺'ye kadar", en: "Up to 600 ₺", ru: "До 600 ₺" } },
      { value: "open", label: { tr: "Esnek", en: "Flexible", ru: "Гибкий" }, note: { tr: "600 ₺'ye kadar seçenekleri göster", en: "Show options up to 600 ₺", ru: "Показывать варианты до 600 ₺" } }
    ]
  }
];

const budgets: Readonly<Record<string, BudgetDefinition>> = {
  "250": { maxMinor: 25_000 },
  "400": { minMinor: 25_001, maxMinor: 40_000 },
  "600": { minMinor: 40_001, maxMinor: 60_000 },
  open: { maxMinor: 60_000 }
};

const reasonText: Record<SmartChoiceLanguage, Record<string, string>> = {
  tr: {
    "score.intent.coffee": "Kahve isteğinize uyuyor",
    "score.intent.breakfast": "Kahvaltı amacınıza uyuyor",
    "score.intent.snack": "Atıştırmalık molasına uyuyor",
    "score.intent.dessert": "Tatlı isteğinize uyuyor",
    "score.intent.refresh": "Ferahlatıcı seçim isteğinize uyuyor",
    "score.temperature.hot": "Sıcak tercihine uyuyor",
    "score.temperature.cold": "Soğuk tercihine uyuyor",
    "score.temperature.any": "Sıcaklıkta esnek seçiminize uyuyor",
    "score.taste.sweet": "Tatlı tercihine uyuyor",
    "score.taste.neutral": "Nötr tercihine uyuyor",
    "score.taste.any": "Tat konusunda esnek seçiminize uyuyor",
    "score.budget.within-range": "Seçtiğiniz bütçe sınırı içinde",
    "score.budget.premium-stretch": "Bütçenin üzerinde premium alternatif"
  },
  en: {
    "score.intent.coffee": "Matches your coffee intent",
    "score.intent.breakfast": "Matches your breakfast intent",
    "score.intent.snack": "Fits a snack break",
    "score.intent.dessert": "Matches your dessert intent",
    "score.intent.refresh": "Matches your refreshing choice",
    "score.temperature.hot": "Matches your hot preference",
    "score.temperature.cold": "Matches your cold preference",
    "score.temperature.any": "Works with either temperature",
    "score.taste.sweet": "Matches your sweet preference",
    "score.taste.neutral": "Matches your neutral preference",
    "score.taste.any": "Works with either taste",
    "score.budget.within-range": "Within your selected budget",
    "score.budget.premium-stretch": "Premium option above the budget"
  },
  ru: {
    "score.intent.coffee": "Соответствует желанию выпить кофе",
    "score.intent.breakfast": "Подходит для завтрака",
    "score.intent.snack": "Подходит для перекуса",
    "score.intent.dessert": "Соответствует желанию десерта",
    "score.intent.refresh": "Подходит, чтобы освежиться",
    "score.temperature.hot": "Соответствует выбору горячего",
    "score.temperature.cold": "Соответствует выбору холодного",
    "score.temperature.any": "Подходит при любой температуре",
    "score.taste.sweet": "Соответствует сладкому вкусу",
    "score.taste.neutral": "Соответствует нейтральному вкусу",
    "score.taste.any": "Подходит при любом вкусе",
    "score.budget.within-range": "Укладывается в выбранный бюджет",
    "score.budget.premium-stretch": "Премиальный вариант выше бюджета"
  }
};

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`[SMART-CHOICE-PAGE] Required element is missing: ${selector}`);
  return element;
}

const app = requireElement<HTMLElement>("#smart-choice-app");

const itemIndex = new Map(SMART_CHOICE_CATALOG.items.map((item) => [item.id, item]));
let state = loadState();
let currentResult: RecommendationResult | null = null;
let suppressHistory = false;

function isLanguage(value: unknown): value is SmartChoiceLanguage {
  return value === "tr" || value === "en" || value === "ru";
}

function safeStoredLanguage(): SmartChoiceLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return isLanguage(stored) ? stored : "tr";
  } catch {
    return "tr";
  }
}

function initialState(): FlowState {
  return {
    version: STATE_VERSION,
    screen: "welcome",
    questionIndex: 0,
    answers: {},
    locale: safeStoredLanguage()
  };
}

function isScreen(value: unknown): value is Screen {
  return value === "welcome" || value === "question" || value === "results" || value === "selected";
}

function loadState(): FlowState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<FlowState>;
    const questionIndex =
      typeof parsed.questionIndex === "number" && Number.isInteger(parsed.questionIndex)
        ? parsed.questionIndex
        : -1;
    if (
      parsed.version !== STATE_VERSION ||
      !isScreen(parsed.screen) ||
      !isLanguage(parsed.locale) ||
      questionIndex < 0 ||
      questionIndex >= questions.length ||
      !parsed.answers ||
      typeof parsed.answers !== "object"
    ) {
      return initialState();
    }
    return {
      version: STATE_VERSION,
      screen: parsed.screen,
      questionIndex,
      answers: parsed.answers,
      locale: parsed.locale,
      ...(typeof parsed.selectedCandidateId === "string" ? { selectedCandidateId: parsed.selectedCandidateId } : {})
    };
  } catch {
    return initialState();
  }
}

function saveState(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Session persistence is optional; the flow remains usable without storage.
  }
}

function storeLanguage(language: SmartChoiceLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Language persistence is optional.
  }
}

function setState(next: FlowState, historyMode: "push" | "replace" | "none" = "push"): void {
  state = next;
  saveState();
  if (!suppressHistory && historyMode !== "none") {
    const hash = state.screen === "question" ? `#step-${state.questionIndex + 1}` : `#${state.screen}`;
    const method = historyMode === "replace" ? "replaceState" : "pushState";
    window.history[method]({ smartChoice: true }, "", hash);
  }
  render();
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function localized(value: LocalizedText): string {
  return value[state.locale];
}

function formatPrice(valueMinor: number): string {
  return new Intl.NumberFormat(localeTag[state.locale], {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: valueMinor % 100 === 0 ? 0 : 2
  }).format(valueMinor / 100);
}

function updateStaticCopy(): void {
  document.documentElement.lang = state.locale;
  const languageCopy: Record<string, string> = copy[state.locale];
  document.title = `Roby's Smart Choice | ${languageCopy.fullMenu}`;
  document.querySelectorAll<HTMLElement>("[data-static-copy]").forEach((element) => {
    const key = element.dataset.staticCopy;
    if (key && languageCopy[key]) element.textContent = languageCopy[key];
  });
  document.querySelectorAll<HTMLButtonElement>(".lang-button").forEach((button) => {
    const active = button.dataset.lang === state.locale;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function createActionLink(label: string, href: string, className = "secondary-button"): HTMLAnchorElement {
  const link = createElement("a", className, label);
  link.href = href;
  return link;
}

function createButton(label: string, className: string, action: () => void): HTMLButtonElement {
  const button = createElement("button", className, label);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}

function renderWelcome(): HTMLElement {
  const card = createElement("section", "smart-card");
  card.setAttribute("aria-labelledby", "smart-choice-title");

  card.append(
    createElement("p", "eyebrow", copy[state.locale].eyebrow),
    createElement("h1", "smart-title", copy[state.locale].welcomeTitle),
    createElement("p", "smart-lead", copy[state.locale].welcomeLead)
  );
  card.querySelector("h1")!.id = "smart-choice-title";

  const trust = createElement("div", "smart-trust");
  trust.append(
    createElement("span", "", copy[state.locale].trustFast),
    createElement("span", "", copy[state.locale].trustHonest),
    createElement("span", "", copy[state.locale].trustSafe)
  );
  card.append(trust);

  const actions = createElement("div", "actions");
  actions.append(
    createButton(copy[state.locale].start, "primary-button", () => {
      setState({ ...state, screen: "question", questionIndex: 0, selectedCandidateId: undefined });
    }),
    createActionLink(copy[state.locale].openMenu, "../menu.html")
  );
  card.append(actions);
  return card;
}

function answerFor(question: QuestionDefinition): string | undefined {
  return state.answers[question.id];
}

function renderFlowTopline(): HTMLElement {
  const top = createElement("div", "flow-topline");
  const progress = createElement("div", "progress-wrap");
  const label = createElement("div", "progress-label");
  label.append(
    createElement("span", "", `${copy[state.locale].step} ${state.questionIndex + 1}`),
    createElement("span", "", `${state.questionIndex + 1} ${copy[state.locale].of} ${questions.length}`)
  );
  const track = createElement("div", "progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "1");
  track.setAttribute("aria-valuemax", String(questions.length));
  track.setAttribute("aria-valuenow", String(state.questionIndex + 1));
  const value = createElement("span", "progress-value");
  const progressStep = Math.min(questions.length, Math.max(1, state.questionIndex + 1));
  value.classList.add(`progress-value--${progressStep}`);
  track.append(value);
  progress.append(label, track);

  const restart = createButton(copy[state.locale].restart, "icon-button", restartFlow);
  top.append(progress, restart);
  return top;
}

function renderQuestion(): HTMLElement {
  const question = questions[state.questionIndex];
  const selected = answerFor(question);
  const card = createElement("section", "smart-card");
  const headingId = `question-${question.id}`;
  card.setAttribute("aria-labelledby", headingId);
  card.append(renderFlowTopline());

  const title = createElement("h1", "question-title", localized(question.title));
  title.id = headingId;
  card.append(title, createElement("p", "question-help", localized(question.help)));

  const options = createElement("div", "option-grid");
  const optionButtons: HTMLButtonElement[] = [];
  const continueButton = createButton(copy[state.locale].continue, "primary-button", () => {
    if (!answerFor(question)) return;
    if (state.questionIndex < questions.length - 1) {
      setState({ ...state, questionIndex: state.questionIndex + 1 });
    } else {
      currentResult = buildRecommendation();
      setState({ ...state, screen: "results" });
    }
  });
  continueButton.disabled = !selected;

  for (const option of question.options) {
    const button = createElement("button", "option-button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(selected === option.value));
    const labelWrap = createElement("span");
    labelWrap.append(createElement("span", "option-label", localized(option.label)));
    if (option.note) labelWrap.append(createElement("span", "option-note", localized(option.note)));
    button.append(labelWrap, createElement("span", "option-arrow", "→"));
    button.addEventListener("click", () => {
      state = { ...state, answers: { ...state.answers, [question.id]: option.value } };
      saveState();
      optionButtons.forEach((entry) => entry.setAttribute("aria-pressed", String(entry === button)));
      continueButton.disabled = false;
    });
    optionButtons.push(button);
    options.append(button);
  }
  card.append(options);

  const actions = createElement("div", "actions");
  actions.append(
    createButton(copy[state.locale].back, "secondary-button", goBack),
    continueButton
  );
  card.append(actions);
  return card;
}

function isCompleteAnswers(answers: Answers): answers is Required<Answers> {
  return Boolean(answers.intent && answers.temperature && answers.taste && answers.partySize && answers.budgetKey);
}

function buildRecommendation(): RecommendationResult {
  if (!isCompleteAnswers(state.answers)) {
    return recommendSmartChoice({});
  }
  const budget = budgets[state.answers.budgetKey];
  const input: RecommendationInput = {
    intent: state.answers.intent as SmartChoiceIntent,
    temperature: state.answers.temperature as RequestedTemperature,
    taste: state.answers.taste as RequestedTaste,
    partySize: state.answers.partySize as PartySize,
    budget,
    locale: state.locale
  };
  return recommendSmartChoice(input);
}

function recommendationReason(recommendation: RankedRecommendation): string[] {
  const dictionary = reasonText[state.locale];
  const translated = recommendation.reasonCodes
    .map((reason) => dictionary[reason])
    .filter((reason): reason is string => Boolean(reason));
  return [...new Set(translated)].slice(0, 4);
}

function roleLabel(role: RankedRecommendation["role"]): string {
  if (role === "top") return copy[state.locale].best;
  if (role === "economy") return copy[state.locale].economy;
  return copy[state.locale].premium;
}

function renderRecommendationCard(recommendation: RankedRecommendation): HTMLElement {
  const card = createElement("article", `result-card${recommendation.role === "top" ? " result-card--top" : ""}`);
  card.append(
    createElement("span", "result-badge", roleLabel(recommendation.role)),
    createElement("h2", "", recommendation.name[state.locale]),
    createElement("p", "result-price", `${copy[state.locale].price}: ${formatPrice(recommendation.priceMinor)}`)
  );

  const components = createElement("ul", "component-list");
  components.setAttribute("aria-label", copy[state.locale].components);
  for (const itemId of recommendation.componentItemIds) {
    const item = itemIndex.get(itemId);
    if (item) components.append(createElement("li", "", item.name[state.locale]));
  }
  card.append(components);

  const reasons = recommendationReason(recommendation);
  if (reasons.length > 0) {
    const reasonList = createElement("ul", "reason-list");
    reasonList.setAttribute("aria-label", copy[state.locale].why);
    reasons.forEach((reason) => reasonList.append(createElement("li", "", reason)));
    card.append(reasonList);
  }

  if (recommendation.premiumStretch) {
    card.append(createElement("p", "premium-warning", copy[state.locale].premiumWarning));
  }

  const choose = createButton(copy[state.locale].choose, "primary-button", () => {
    setState({ ...state, screen: "selected", selectedCandidateId: recommendation.candidateId });
  });
  card.append(choose, createElement("p", "safe-note", copy[state.locale].noOrder));
  return card;
}

function uniqueRecommendations(result: RecommendationResult): RankedRecommendation[] {
  const seen = new Set<string>();
  return [result.top, result.economy, result.premium].filter((entry): entry is RankedRecommendation => {
    if (!entry || seen.has(entry.candidateId)) return false;
    seen.add(entry.candidateId);
    return true;
  });
}

function renderNoMatch(result: RecommendationResult): HTMLElement {
  const card = createElement("section", "no-match-card");
  const invalid = result.status === "invalid-input";
  card.append(
    createElement("p", "eyebrow", invalid ? copy[state.locale].eyebrow : copy[state.locale].noMatchEyebrow),
    createElement("h1", "result-title", invalid ? copy[state.locale].invalidTitle : copy[state.locale].noMatchTitle),
    createElement("p", "no-match-copy", invalid ? copy[state.locale].invalidCopy : copy[state.locale].noMatchCopy)
  );
  const actions = createElement("div", "actions");
  actions.append(
    createButton(copy[state.locale].changeAnswers, "primary-button", () => {
      setState({ ...state, screen: "question", questionIndex: Math.max(0, questions.length - 1) });
    }),
    createActionLink(copy[state.locale].openMenu, "../menu.html")
  );
  card.append(actions);
  return card;
}

function renderResults(): HTMLElement {
  currentResult = currentResult ?? buildRecommendation();
  if (currentResult.status !== "ok" || !currentResult.top) return renderNoMatch(currentResult);

  const wrapper = createElement("section", "smart-card");
  wrapper.append(
    createElement("p", "eyebrow", copy[state.locale].resultsEyebrow),
    createElement("h1", "result-title", copy[state.locale].resultsTitle),
    createElement("p", "result-lead", copy[state.locale].resultsLead)
  );

  const list = createElement("div", "result-list");
  uniqueRecommendations(currentResult).forEach((recommendation) => list.append(renderRecommendationCard(recommendation)));
  wrapper.append(list);

  const actions = createElement("div", "actions");
  actions.append(
    createButton(copy[state.locale].changeAnswers, "secondary-button", () => {
      setState({ ...state, screen: "question", questionIndex: Math.max(0, questions.length - 1) });
    }),
    createActionLink(copy[state.locale].openMenu, "../menu.html")
  );
  wrapper.append(actions);
  return wrapper;
}

function selectedRecommendation(): RankedRecommendation | null {
  const result = currentResult ?? buildRecommendation();
  currentResult = result;
  return uniqueRecommendations(result).find((entry) => entry.candidateId === state.selectedCandidateId) ?? null;
}

function renderSelected(): HTMLElement {
  const recommendation = selectedRecommendation();
  if (!recommendation) return renderNoMatch(buildRecommendation());

  const card = createElement("section", "selected-card");
  card.append(
    createElement("p", "eyebrow", copy[state.locale].selectedEyebrow),
    createElement("h1", "result-title", copy[state.locale].selectedTitle),
    createElement("p", "selected-note", copy[state.locale].selectedNote)
  );

  const summary = createElement("div", "selected-summary");
  summary.append(
    createElement("strong", "", recommendation.name[state.locale]),
    createElement("span", "", `${copy[state.locale].price}: ${formatPrice(recommendation.priceMinor)}`)
  );
  card.append(summary);

  const actions = createElement("div", "actions");
  actions.append(
    createButton(copy[state.locale].chooseAnother, "primary-button", () => {
      setState({ ...state, screen: "results", selectedCandidateId: undefined });
    }),
    createActionLink(copy[state.locale].openMenu, "../menu.html")
  );
  card.append(actions);
  return card;
}

function goBack(): void {
  if (state.screen === "question") {
    if (state.questionIndex > 0) {
      setState({ ...state, questionIndex: state.questionIndex - 1 }, "replace");
    } else {
      setState({ ...state, screen: "welcome" }, "replace");
    }
    return;
  }
  if (state.screen === "selected") {
    setState({ ...state, screen: "results", selectedCandidateId: undefined }, "replace");
    return;
  }
  if (state.screen === "results") {
    setState({ ...state, screen: "question", questionIndex: questions.length - 1 }, "replace");
  }
}

function restartFlow(): void {
  const locale = state.locale;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Optional persistence.
  }
  currentResult = null;
  setState({ ...initialState(), locale }, "replace");
}

function render(): void {
  updateStaticCopy();
  app.setAttribute("aria-busy", "false");
  let content: HTMLElement;
  if (state.screen === "welcome") content = renderWelcome();
  else if (state.screen === "question") content = renderQuestion();
  else if (state.screen === "results") content = renderResults();
  else content = renderSelected();
  app.replaceChildren(content);
  window.requestAnimationFrame(() => {
    const heading = content.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  });
}

document.querySelectorAll<HTMLButtonElement>(".lang-button").forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.dataset.lang;
    if (!isLanguage(language)) return;
    state = { ...state, locale: language };
    currentResult = state.screen === "results" || state.screen === "selected" ? buildRecommendation() : null;
    storeLanguage(language);
    saveState();
    render();
  });
});

window.addEventListener("popstate", () => {
  suppressHistory = true;
  goBack();
  suppressHistory = false;
});

window.history.replaceState({ smartChoice: true }, "", window.location.hash || "#welcome");
render();
