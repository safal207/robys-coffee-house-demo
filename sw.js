const CACHE_VERSION = "robys-offline-v63-20260905-cart-feedback-d16fc23e122d-58d387ca0c01-96b566c9731e";
const MENU_IMAGE_ASSETS = [
  "./src/products/menu-v1/brew-hot--black-tea.webp",
  "./src/products/menu-v1/brew-hot--chai-tea-latte.webp",
  "./src/products/menu-v1/brew-hot--filter-coffee.webp",
  "./src/products/menu-v1/brew-hot--hot-chocolate.webp",
  "./src/products/menu-v1/brew-hot--milk.webp",
  "./src/products/menu-v1/brew-hot--salep.webp",
  "./src/products/menu-v1/brew-hot--turkish-coffee.webp",
  "./src/products/menu-v1/cold-coffee--caffe-latte-frappe.webp",
  "./src/products/menu-v1/cold-coffee--flavoured-iced-caffe-latte.webp",
  "./src/products/menu-v1/cold-coffee--iced-americano.webp",
  "./src/products/menu-v1/cold-coffee--iced-caffe-latte.webp",
  "./src/products/menu-v1/cold-coffee--iced-filter-coffee.webp",
  "./src/products/menu-v1/cold-coffee--iced-mocha.webp",
  "./src/products/menu-v1/cold-coffee--milkshake.webp",
  "./src/products/menu-v1/cold-coffee--white-chocolate-mocha.webp",
  "./src/products/menu-v1/desserts--almond-tart.webp",
  "./src/products/menu-v1/desserts--brownie.webp",
  "./src/products/menu-v1/desserts--cake-roll.webp",
  "./src/products/menu-v1/desserts--chocolate-cake.webp",
  "./src/products/menu-v1/desserts--cookie.webp",
  "./src/products/menu-v1/desserts--lotus-cheesecake.webp",
  "./src/products/menu-v1/desserts--macaron.webp",
  "./src/products/menu-v1/desserts--mosaic-cake.webp",
  "./src/products/menu-v1/desserts--raspberry-cheesecake.webp",
  "./src/products/menu-v1/desserts--san-sebastian-cheesecake.webp",
  "./src/products/menu-v1/desserts--savoury-cookie.webp",
  "./src/products/menu-v1/desserts--tiramisu.webp",
  "./src/products/menu-v1/food--beef-sirloin-baguette-sandwich.webp",
  "./src/products/menu-v1/food--nutella-croissant.webp",
  "./src/products/menu-v1/food--sesame-simit.webp",
  "./src/products/menu-v1/food--three-cheese-croissant.webp",
  "./src/products/menu-v1/food--white-cheese-baguette-sandwich.webp",
  "./src/products/menu-v1/herbal-tea--balance-tea-detox-green-tea.webp",
  "./src/products/menu-v1/herbal-tea--beauty-tea-floral-white-tea.webp",
  "./src/products/menu-v1/herbal-tea--maroc-tea-mint-green-tea.webp",
  "./src/products/menu-v1/herbal-tea--relax-tea-lavender-rooibos.webp",
  "./src/products/menu-v1/herbal-tea--tahiti-tea-hibiscus-lemongrass.webp",
  "./src/products/menu-v1/hot-coffee--americano.webp",
  "./src/products/menu-v1/hot-coffee--caffe-latte.webp",
  "./src/products/menu-v1/hot-coffee--caffe-mocha.webp",
  "./src/products/menu-v1/hot-coffee--cappuccino.webp",
  "./src/products/menu-v1/hot-coffee--caramel-cappuccino.webp",
  "./src/products/menu-v1/hot-coffee--caramel-latte.webp",
  "./src/products/menu-v1/hot-coffee--chocolate-cookie-latte.webp",
  "./src/products/menu-v1/hot-coffee--cinnamon-latte.webp",
  "./src/products/menu-v1/hot-coffee--cortado.webp",
  "./src/products/menu-v1/hot-coffee--espresso-macchiato.webp",
  "./src/products/menu-v1/hot-coffee--espresso.webp",
  "./src/products/menu-v1/hot-coffee--flat-white.webp",
  "./src/products/menu-v1/hot-coffee--hazelnut-latte.webp",
  "./src/products/menu-v1/hot-coffee--vanilla-latte.webp",
  "./src/products/menu-v1/hot-coffee--white-chocolate-mocha.webp",
  "./src/products/menu-v1/refreshers--berry-hibiscus.webp",
  "./src/products/menu-v1/refreshers--berry-lemonade.webp",
  "./src/products/menu-v1/refreshers--cool-lime.webp",
  "./src/products/menu-v1/refreshers--mango-passionfruit.webp",
  "./src/products/menu-v1/refreshers--pineapple-berry.webp",
  "./src/products/menu-v1/refreshers--strawberry-lime.webp",
  "./src/products/menu-v1/refreshers--summer-pine.webp",
  "./src/products/menu-v1/refreshers--tropical-mango.webp",
  "./src/products/menu-v1/refreshers--yuzu-popcorn.webp"
];
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./menu.html",
  "./discover.html",
  "./404.html",
  "./manifest.webmanifest",
  "./mobile-install-copy.json",
  "./mobile-install.js",
  "./offline.css",
  "./pwa.js?v=premium-cache-new-20260904-1",
  "./android-download.js",
  "./android-app.css?v=01b7f55a3fdc",
  "./mobile-install.css",
  "./styles-v2.css?v=a008bb8274b9",
  "./mobile.css",
  "./conversion.css",
  "./final-qa.css",
  "./social-offer.css",
  "./menu-premium.css?v=8057fd0f208f",
  "./menu-stability.css",
  "./menu-security-v2.css?v=9a74fe13ba64",
  "./discover.css",
  "./discover-rotation.css?v=96b566c9731e",
  "./wordmark-responsive.css?v=20260704-1",
  "./brand-photo-logo.css?v=20260726-approved-v4",
  "./src/brand/robys-primary-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-header-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4",
  "./bootstrap-v2.js?v=45fbf33f0155",
  "./android-handoff.js",
  "./morning-entry-v2.js?v=8a158515f4de",
  "./day-night-entry.js?v=20260904-compositor-v25",
  "./app.js",
  "./conversion.js?v=bbea03459a71",
  "./menu-ready.js",
  "./menu-app.js?v=b80b59c4a797",
  "./menu-pwa.js?v=premium-cache-new-20260904-1",
  "./menu-catalog.js?v=20260904-premium-order-v1",
  "./menu-search-clear.js",
  "./menu-interactions.js?v=20260904-interaction-v3",
  "./order-launcher.js?v=c55dccbcb93f",
  "./order-store.js?v=5c782a5b81af",
  "./order-shell.js?v=1aacda1a540c",
  "./order-shell.css?v=a4db01bf758c",
  "./smart-choice/index.html",
  "./smart-choice/pwa.js?v=premium-cache-new-20260904-1",
  "./smart-choice/style.css?v=93af186a5b11",
  "./smart-choice/cart.css?v=4fcc327520f5",
  "./smart-choice/decision-trace.css?v=caa831d49b1f",
  "./smart-choice/release-qa.css?v=9d9afd5b512c",
  "./smart-choice/brand-v4.css?v=20260728-1",
  "./smart-choice/release-qa.js?v=8741e7ebc72b",
  "./smart-choice/app-v2.js?v=b13d23deb15e",
  "./smart-choice/cart-v2.js?v=5f6b01b9efd9",
  "./smart-choice/experiments-v2.js?v=4852fc7c9115",
  "./smart-choice/analytics-v2.js?v=9cd3b5dd0fc2",
  "./smart-choice/decision-trace-v2.js?v=923446e45093",
  "./discover.js",
  "./discover-v2.js?v=d16fc23e122d",
  "./discover-copy.js",
  "./discover-journeys.js",
  "./discover-journeys-v2.js",
  "./discover-rotation.js",
  "./discover-rotation-v2.js",
  "./discover-rotation-v3.js?v=58d387ca0c01",
  "./src/brand/robys-organic-ring.svg?v=20260720-1",
  "./src/pairings-data/final/cool-lime-macaron-hq.webp",
  "./src/pairings-data/approved/iced-san-sebastian-hq.png",
  ...MENU_IMAGE_ASSETS,
  "./src/products/sets-v1/cool-lime-macaron.webp",
  "./src/products/sets-v1/iced-san-sebastian.webp",
  "./src/pairings-data/final/cool-lime-macaron.webp.b64.txt",
  "./src/pairings-data/final/iced-san-sebastian.webp.b64.txt",
  "./icon.svg",
  "./icon-maskable.svg",
  "./apple-touch-icon.png",
  "./src/android-mark.svg",
  "./src/robys-hero-poster.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_VERSION);
  const url = new URL(request.url);
  const smartChoiceRoot = new URL("smart-choice/", self.registration.scope).pathname;
  const isVersionedSmartChoiceAsset = url.pathname.startsWith(smartChoiceRoot) &&
    (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"));
  const requiresExactRevision =
    isVersionedSmartChoiceAsset ||
    url.pathname.endsWith("/bootstrap-v2.js") ||
    url.pathname.endsWith("/morning-entry-v2.js") ||
    url.pathname.endsWith("/styles-v2.css") ||
    url.pathname.endsWith("/menu-security-v2.css") ||
    url.pathname.endsWith("/pwa.js") ||
    url.pathname.endsWith("/menu-pwa.js") ||
    url.pathname.endsWith("/day-night-entry.js") ||
    url.pathname.endsWith("/menu-app.js") ||
    url.pathname.endsWith("/menu-catalog.js") ||
    url.pathname.endsWith("/menu-premium.css") ||
    url.pathname.endsWith("/menu-interactions.js") ||
    url.pathname.endsWith("/discover-v2.js") ||
    url.pathname.endsWith("/discover-rotation-v3.js") ||
    url.pathname.endsWith("/discover-rotation.css") ||
    url.pathname.endsWith("/qa.js") ||
    url.pathname.endsWith("/src/robys-ambience-clean.mp4") ||
    url.pathname.endsWith("/wordmark-responsive.css") ||
    url.pathname.endsWith("/brand-photo-logo.css") ||
    url.pathname.endsWith("/src/brand/robys-primary-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-header-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-compact-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-mark-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-organic-ring.svg");
  if (requiresExactRevision) {
    return cache.match(request);
  }
  return cache.match(request, { ignoreSearch: true });
}

async function runtimeAssetResponse(request) {
  const cached = await cachedResponse(request);
  if (cached) return cached;

  const network = await fetch(request);
  if (network.ok) {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, network.clone()).catch(() => {});
  }
  return network;
}

async function cachedPage(name) {
  return (await cachedResponse(new Request(new URL(name, self.registration.scope)))) || Response.error();
}

async function navigationResponse(request) {
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  const isMenu = url.pathname.endsWith("/menu.html");
  const isDiscover = url.pathname.endsWith("/discover.html");
  const isSmartChoice = url.pathname === `${scopePath}smart-choice/` ||
    url.pathname === `${scopePath}smart-choice/index.html`;
  const isHome = url.pathname === scopePath || url.pathname === `${scopePath}index.html`;

  try {
    const network = await fetch(request);
    if (network.ok) {
      if (isMenu || isDiscover || isSmartChoice || isHome) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    }
  } catch {
    // Fall through to a deterministic cached page.
  }

  if (isMenu) return cachedPage("menu.html");
  if (isDiscover) return cachedPage("discover.html");
  if (isSmartChoice) return cachedPage("smart-choice/index.html");
  if (isHome) return cachedPage("index.html");
  return cachedPage("404.html");
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(runtimeAssetResponse(event.request));
});
