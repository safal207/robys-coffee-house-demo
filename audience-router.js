const STORAGE_KEY = "robys-audience-router-v1";
const EVENTS_KEY = "robys-audience-router-events-v1";
const OFFERED_KEY = "robys-audience-router-offered-v1";
const SCHEMA_VERSION = 1;

const ROUTES = [
  { id: "menu", href: "menu.html", marker: "01" },
  { id: "discover", href: "discover.html", marker: "02" },
  { id: "smart", href: "smart-choice/", marker: "03" },
  { id: "chapter", href: "chapter-01.html", marker: "○" }
];

const COPY = {
  tr: {
    eyebrow: "SANA UYGUN YOL",
    title: "Bugün nasıl seçmek istersin?",
    lead: "Hızlıca menüye gidebilir, Roby's'i tanıyabilir, öneri alabilir ya da yeni bir hikâyeye katılabilirsin.",
    aria: "Roby's seçim yolları",
    lastBadge: "Son seçimin",
    reset: "Tercihi unut",
    status: "Geçen sefer “{route}” yolunu seçtin. Bu kez başka bir yol seçebilirsin.",
    menuTitle: "Ne istediğimi biliyorum",
    menuText: "Tam menüyü aç ve doğrudan seç.",
    menuAction: "Menüye git",
    discoverTitle: "Buraya ilk kez geldim",
    discoverText: "Roby's atmosferini ve tat yolculuğunu keşfet.",
    discoverAction: "Roby's'i tanı",
    smartTitle: "Seçmeme yardım et",
    smartText: "Birkaç kısa cevapla sana uygun seçimi bul.",
    smartAction: "Smart Choice",
    chapterTitle: "Yeni bir şey göster",
    chapterText: "Yeni Roby's bölümüne gönüllü olarak katıl.",
    chapterAction: "Bölümü aç"
  },
  en: {
    eyebrow: "YOUR WAY INTO ROBY'S",
    title: "How would you like to choose today?",
    lead: "Go straight to the menu, get to know Roby's, ask for help choosing, or voluntarily enter a new story.",
    aria: "Roby's choice routes",
    lastBadge: "Your last choice",
    reset: "Forget preference",
    status: "Last time you chose “{route}”. You can take a different path today.",
    menuTitle: "I know what I want",
    menuText: "Open the complete menu and choose directly.",
    menuAction: "Open menu",
    discoverTitle: "I am here for the first time",
    discoverText: "Discover the Roby's atmosphere and taste journey.",
    discoverAction: "Meet Roby's",
    smartTitle: "Help me choose",
    smartText: "Find a fitting choice through a few short answers.",
    smartAction: "Smart Choice",
    chapterTitle: "Show me something new",
    chapterText: "Voluntarily enter the newest Roby's chapter.",
    chapterAction: "Open chapter"
  },
  ru: {
    eyebrow: "ТВОЙ ПУТЬ В ROBY'S",
    title: "Как тебе удобнее выбрать сегодня?",
    lead: "Можно сразу открыть меню, познакомиться с Roby's, получить помощь с выбором или добровольно войти в новую историю.",
    aria: "Способы выбора в Roby's",
    lastBadge: "Твой прошлый выбор",
    reset: "Забыть предпочтение",
    status: "В прошлый раз ты выбрал путь «{route}». Сегодня можно выбрать любой другой.",
    menuTitle: "Я знаю, чего хочу",
    menuText: "Открыть полное меню и выбрать напрямую.",
    menuAction: "Открыть меню",
    discoverTitle: "Я здесь впервые",
    discoverText: "Познакомиться с атмосферой и путешествием вкусов Roby's.",
    discoverAction: "Познакомиться",
    smartTitle: "Помогите мне выбрать",
    smartText: "Получить подходящий вариант через несколько коротких ответов.",
    smartAction: "Smart Choice",
    chapterTitle: "Покажите что-нибудь новое",
    chapterText: "Добровольно войти в новую главу Roby's.",
    chapterAction: "Открыть главу"
  }
};

const localizedNodes = [];
let preferredRoute = readPreference()?.preferredRoute ?? null;
let statusNode;
let resetButton;
let routeGrid;

function safeStorage(storage, operation, fallback = null) {
  try {
    return operation(storage);
  } catch {
    return fallback;
  }
}

function readPreference() {
  return safeStorage(localStorage, (storage) => {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    return parsed?.schemaVersion === SCHEMA_VERSION ? parsed : null;
  });
}

function savePreference(route) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    preferredRoute: route,
    selectedAt: new Date().toISOString(),
    source: "explicit-home-router"
  };
  safeStorage(localStorage, (storage) => storage.setItem(STORAGE_KEY, JSON.stringify(state)));
  return state;
}

function routeCopyKey(route, suffix) {
  return `${route === "discover" ? "discover" : route}${suffix}`;
}

function currentLanguage() {
  const language = document.documentElement.lang?.toLowerCase().split("-")[0];
  return COPY[language] ? language : "tr";
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bindText(node, key) {
  localizedNodes.push({ node, key });
  return node;
}

function forwardAnalytics(name, detail) {
  window.robysAnalytics?.track?.(name, { placement: "audience_router", ...detail });
}

function recordEvent(name, detail = {}) {
  const payload = {
    event: name,
    schemaVersion: SCHEMA_VERSION,
    at: new Date().toISOString(),
    language: currentLanguage(),
    path: location.pathname,
    ...detail
  };

  safeStorage(sessionStorage, (storage) => {
    const events = JSON.parse(storage.getItem(EVENTS_KEY) || "[]");
    events.push(payload);
    storage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-100)));
  });

  document.dispatchEvent(new CustomEvent("robys:audience-router", { detail: payload }));
  if (window.robysAnalytics?.track) forwardAnalytics(name, detail);
  else setTimeout(() => forwardAnalytics(name, detail), 0);
}

function updatePreferenceView(language = currentLanguage()) {
  const copy = COPY[language];
  const cards = routeGrid ? [...routeGrid.querySelectorAll("[data-router-route]")] : [];

  cards.forEach((card) => {
    const selected = card.dataset.routerRoute === preferredRoute;
    card.classList.toggle("is-preferred", selected);
    const badge = card.querySelector(".audience-route-badge");
    if (badge) {
      badge.hidden = !selected;
      badge.textContent = copy.lastBadge;
    }
  });

  if (!statusNode || !resetButton) return;
  const selectedRoute = ROUTES.find((route) => route.id === preferredRoute);
  if (!selectedRoute) {
    statusNode.hidden = true;
    resetButton.hidden = true;
    return;
  }

  const routeTitle = copy[routeCopyKey(selectedRoute.id, "Title")];
  statusNode.textContent = copy.status.replace("{route}", routeTitle);
  statusNode.hidden = false;
  resetButton.hidden = false;
  resetButton.textContent = copy.reset;
}

function applyLanguage(language = currentLanguage()) {
  const normalized = COPY[language] ? language : "tr";
  const copy = COPY[normalized];
  localizedNodes.forEach(({ node, key }) => {
    node.textContent = copy[key];
  });
  if (routeGrid) routeGrid.setAttribute("aria-label", copy.aria);
  updatePreferenceView(normalized);
}

function buildRouteCard(route) {
  const card = createElement("a", "audience-route-card");
  card.href = route.href;
  card.dataset.routerRoute = route.id;

  const marker = createElement("span", "audience-route-marker", route.marker);
  marker.setAttribute("aria-hidden", "true");
  if (route.id === "chapter") marker.classList.add("audience-route-marker--chapter");

  const body = createElement("span", "audience-route-body");
  const headingLine = createElement("span", "audience-route-heading-line");
  const title = bindText(createElement("strong", "audience-route-title"), routeCopyKey(route.id, "Title"));
  const badge = createElement("span", "audience-route-badge");
  badge.hidden = true;
  headingLine.append(title, badge);

  const description = bindText(createElement("span", "audience-route-description"), routeCopyKey(route.id, "Text"));
  const action = bindText(createElement("span", "audience-route-action"), routeCopyKey(route.id, "Action"));
  const arrow = createElement("span", "audience-route-arrow", "→");
  arrow.setAttribute("aria-hidden", "true");
  action.append(" ", arrow);

  body.append(headingLine, description, action);
  card.append(marker, body);

  card.addEventListener("click", () => {
    preferredRoute = route.id;
    savePreference(route.id);
    updatePreferenceView();
    recordEvent("route_accepted", { route: route.id, destination: route.href, intentSource: "explicit" });
  });

  return card;
}

function ensureStylesheet() {
  if (document.getElementById("audience-router-styles")) return;
  const link = document.createElement("link");
  link.id = "audience-router-styles";
  link.rel = "stylesheet";
  link.href = "audience-router.css?v=20260729-1";
  document.head.append(link);
}

function buildRouter() {
  const hero = document.querySelector(".hero");
  if (!hero || document.getElementById("audience-router")) return;
  ensureStylesheet();

  const section = createElement("section", "audience-router");
  section.id = "audience-router";
  section.setAttribute("aria-labelledby", "audience-router-title");

  const container = createElement("div", "container audience-router-inner");
  const heading = createElement("header", "audience-router-heading");
  const eyebrow = bindText(createElement("p", "eyebrow"), "eyebrow");
  const title = bindText(createElement("h2", "audience-router-title"), "title");
  title.id = "audience-router-title";
  const lead = bindText(createElement("p", "audience-router-lead"), "lead");
  heading.append(eyebrow, title, lead);

  routeGrid = createElement("div", "audience-route-grid");
  ROUTES.forEach((route) => routeGrid.append(buildRouteCard(route)));

  const preference = createElement("div", "audience-router-preference");
  statusNode = createElement("p", "audience-router-status");
  statusNode.hidden = true;
  statusNode.setAttribute("aria-live", "polite");
  resetButton = createElement("button", "audience-router-reset");
  resetButton.type = "button";
  resetButton.hidden = true;
  resetButton.addEventListener("click", () => {
    const previousRoute = preferredRoute;
    preferredRoute = null;
    safeStorage(localStorage, (storage) => storage.removeItem(STORAGE_KEY));
    updatePreferenceView();
    recordEvent("route_preference_reset", { previousRoute });
  });
  preference.append(statusNode, resetButton);

  container.append(heading, routeGrid, preference);
  section.append(container);
  hero.insertAdjacentElement("afterend", section);

  applyLanguage();
  updatePreferenceView();

  const alreadyOffered = safeStorage(sessionStorage, (storage) => storage.getItem(OFFERED_KEY) === "1", false);
  if (!alreadyOffered) {
    safeStorage(sessionStorage, (storage) => storage.setItem(OFFERED_KEY, "1"));
    recordEvent("route_offered", { routes: ROUTES.map((route) => route.id), restoredRoute: preferredRoute });
  }
}

function resetRouter() {
  preferredRoute = null;
  safeStorage(localStorage, (storage) => storage.removeItem(STORAGE_KEY));
  safeStorage(sessionStorage, (storage) => storage.removeItem(EVENTS_KEY));
  safeStorage(sessionStorage, (storage) => storage.removeItem(OFFERED_KEY));
  updatePreferenceView();
}

buildRouter();

document.addEventListener("click", (event) => {
  const languageButton = event.target.closest(".lang-button[data-lang]");
  if (!languageButton) return;
  setTimeout(() => applyLanguage(languageButton.dataset.lang), 0);
});

const languageObserver = new MutationObserver(() => applyLanguage());
languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

window.robysAudienceRouter = Object.freeze({
  getState: () => readPreference(),
  getEvents: () => safeStorage(sessionStorage, (storage) => JSON.parse(storage.getItem(EVENTS_KEY) || "[]"), []),
  reset: resetRouter,
  routes: () => ROUTES.map((route) => ({ ...route }))
});
