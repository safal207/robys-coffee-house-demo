const CACHE_VERSION = "robys-offline-v64-20260910-menu-truth-4fc1610c3f10-pairing-css-882faab929d1-menu-share-4f662e6b236a-menu-feed-51adbd87aae9-quick-order-88a9ad073730-coffee-paths-e0e89349a2f4-halloween-e3045e5201bf-home-navigation-a9d3db84269a-family-menu-75947c63bb80-occasion-combos-5f9437181221-custom-pair-66b6cc7da28d-menu-css-e89ae9369544-shared-order-social-offer-cf339e8c8777-20260922-web-only-20260923-share-v4-7d1b6bc8f058-b7b8c4df73db-96b566c9731e";
const MENU_SHARE_PRODUCTS = {"pairing-offers--cool-lime-macaron-pairing":"pairing-offers:cool-lime-macaron-pairing","hot-coffee--espresso":"hot-coffee:espresso","brew-hot--filter-coffee":"brew-hot:filter-coffee","cold-coffee--iced-filter-coffee":"cold-coffee:iced-filter-coffee","refreshers--cool-lime":"refreshers:cool-lime","herbal-tea--beauty-tea-floral-white-tea":"herbal-tea:beauty-tea-floral-white-tea","desserts--san-sebastian-cheesecake":"desserts:san-sebastian-cheesecake","food--three-cheese-croissant":"food:three-cheese-croissant","pairing-offers--iced-san-sebastian-pairing":"pairing-offers:iced-san-sebastian-pairing","hot-coffee--americano":"hot-coffee:americano","brew-hot--turkish-coffee":"brew-hot:turkish-coffee","cold-coffee--iced-americano":"cold-coffee:iced-americano","refreshers--berry-hibiscus":"refreshers:berry-hibiscus","herbal-tea--tahiti-tea-hibiscus-lemongrass":"herbal-tea:tahiti-tea-hibiscus-lemongrass","desserts--lotus-cheesecake":"desserts:lotus-cheesecake","food--nutella-croissant":"food:nutella-croissant","hot-coffee--espresso-macchiato":"hot-coffee:espresso-macchiato","brew-hot--black-tea":"brew-hot:black-tea","cold-coffee--iced-caffe-latte":"cold-coffee:iced-caffe-latte","refreshers--mango-passionfruit":"refreshers:mango-passionfruit","herbal-tea--maroc-tea-mint-green-tea":"herbal-tea:maroc-tea-mint-green-tea","desserts--raspberry-cheesecake":"desserts:raspberry-cheesecake","food--white-cheese-baguette-sandwich":"food:white-cheese-baguette-sandwich","hot-coffee--cortado":"hot-coffee:cortado","brew-hot--hot-chocolate":"brew-hot:hot-chocolate","cold-coffee--flavoured-iced-caffe-latte":"cold-coffee:flavoured-iced-caffe-latte","refreshers--berry-lemonade":"refreshers:berry-lemonade","herbal-tea--relax-tea-lavender-rooibos":"herbal-tea:relax-tea-lavender-rooibos","desserts--chocolate-cake":"desserts:chocolate-cake","food--beef-sirloin-baguette-sandwich":"food:beef-sirloin-baguette-sandwich","hot-coffee--flat-white":"hot-coffee:flat-white","brew-hot--milk":"brew-hot:milk","cold-coffee--iced-mocha":"cold-coffee:iced-mocha","refreshers--pineapple-berry":"refreshers:pineapple-berry","herbal-tea--balance-tea-detox-green-tea":"herbal-tea:balance-tea-detox-green-tea","desserts--almond-tart":"desserts:almond-tart","food--sesame-simit":"food:sesame-simit","hot-coffee--cappuccino":"hot-coffee:cappuccino","brew-hot--salep":"brew-hot:salep","cold-coffee--white-chocolate-mocha":"cold-coffee:white-chocolate-mocha","refreshers--summer-pine":"refreshers:summer-pine","desserts--cake-roll":"desserts:cake-roll","hot-coffee--caramel-cappuccino":"hot-coffee:caramel-cappuccino","brew-hot--chai-tea-latte":"brew-hot:chai-tea-latte","cold-coffee--caffe-latte-frappe":"cold-coffee:caffe-latte-frappe","refreshers--tropical-mango":"refreshers:tropical-mango","desserts--mosaic-cake":"desserts:mosaic-cake","hot-coffee--caffe-latte":"hot-coffee:caffe-latte","cold-coffee--milkshake":"cold-coffee:milkshake","refreshers--strawberry-lime":"refreshers:strawberry-lime","desserts--tiramisu":"desserts:tiramisu","hot-coffee--chocolate-cookie-latte":"hot-coffee:chocolate-cookie-latte","refreshers--yuzu-popcorn":"refreshers:yuzu-popcorn","desserts--brownie":"desserts:brownie","hot-coffee--cinnamon-latte":"hot-coffee:cinnamon-latte","desserts--savoury-cookie":"desserts:savoury-cookie","hot-coffee--caramel-latte":"hot-coffee:caramel-latte","desserts--cookie":"desserts:cookie","hot-coffee--vanilla-latte":"hot-coffee:vanilla-latte","desserts--macaron":"desserts:macaron","hot-coffee--hazelnut-latte":"hot-coffee:hazelnut-latte","hot-coffee--caffe-mocha":"hot-coffee:caffe-mocha","hot-coffee--white-chocolate-mocha":"hot-coffee:white-chocolate-mocha"};
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
  "./kids-menu.css?v=e2dec4adf195",
  "./",
  "./index.html",
  "./cashier.html",
  "./cashier.js?v=f4fcdfa73b78",
  "./order-checkout.js?v=ede76ee31ffa",
  "./order-checkout.css?v=9ead86a924fa",
  "./src/products/quick-choice-v1/coffee.webp",
  "./src/products/quick-choice-v1/tea.webp",
  "./src/products/quick-choice-v1/cold.webp",
  "./menu-order-ui.js?v=206dca9f16f0",
  "./menu-family-ui.js?v=e9cf66bcd351",
  "./menu-family.css?v=0c4e64ab2125",
  "./order-storage.js?v=6908555cd79b",
  "./src/products/family-sets-v1/milk-cookie.webp",
  "./src/products/family-sets-v1/simit-break.webp",
  "./src/products/family-sets-v1/milk-roll.webp",
  "./src/products/family-sets-v1/kids-box.webp",
  "./menu-runtime.css?v=e89ae9369544",
  "./menu-combos-ui.js?v=7ceff359f5a2",
  "./menu-combos.css?v=abeb6c64bcda",
  "./combo-entry.css?v=da624d45b4d6",
  "./choice-help.js?v=b968a6dcbaa8",
  "./choice-help.css?v=6b3dac7b0da1",
  "./src/products/occasion-sets-v1/student.webp",
  "./src/products/occasion-sets-v1/cycle.webp",
  "./src/products/occasion-sets-v1/rain.webp",
  "./src/products/occasion-sets-v1/tea.webp",
  "./src/products/occasion-sets-v1/refresh.webp",
  "./src/products/occasion-sets-v1/together.webp",
  "./src/products/occasion-sets-v1/family.webp",
  "./src/products/occasion-sets-v1/local.webp",
  "./src/products/occasion-sets-v1/go.webp",
  "./src/products/occasion-sets-v1/morning.webp",
  "./src/products/occasion-sets-v1/sweet.webp",
  "./src/products/occasion-sets-v1/hearty.webp",
  "./choice-help-entry.js?v=77349983b058",
  "./seasonal-theme.js?v=7e07ce1187f0",
  "./seasonal.css?v=f2437d09532e",
  "./smart-choice/photo-previews.js?v=a8f51a54c367",
  "./smart-choice/catalog.js?v=59bffc03490d",
  "./menu-feed.html",
  "./menu-feed.js?v=7370a20b4c4a",
  "./menu-feed.css?v=b9c32b97a6eb",
  "./menu-view-mode.js?v=277d248a767d",
  "./menu-share-entry.js?v=a7a7ede8582e",
  "./menu-share-entry.css?v=5be22dbb9b83",
  "./menu-feedback.js?v=57d1a0c670f6",
  "./menu-feed-viewer.js?v=5f768fc6a5ff",
  "./src/products/quick-v1/sets-v1/cool-lime-macaron-256.webp",
  "./src/products/quick-v1/menu-v1/hot-coffee--espresso-256.webp",
  "./src/products/quick-v1/menu-v1/brew-hot--filter-coffee-256.webp",
  "./src/products/quick-v1/menu-v1/cold-coffee--iced-filter-coffee-256.webp",
  "./src/products/quick-v1/menu-v1/refreshers--cool-lime-256.webp",
  "./src/products/quick-v1/menu-v1/herbal-tea--beauty-tea-floral-white-tea-256.webp",
  "./src/products/quick-v1/menu-v1/desserts--san-sebastian-cheesecake-256.webp",
  "./src/products/quick-v1/menu-v1/food--three-cheese-croissant-256.webp",
  "./src/products/family-sets-v1/kids-box-kinder-v1.webp",
  "./menu.html",
  "./discover.html",
  "./404.html",
  "./offline.css",
  "./pwa-pairing-fix.js?v=web-only-20260923-1",
  "./pwa.js?v=web-only-20260923-1",
  "./styles-v2.css?v=26e28dbd2846",
  "./mobile.css?v=5b32c08631ed",
  "./menu-preview.css?v=4ef1398382fa",
  "./conversion.css",
  "./final-qa-v2.css?v=daa1b27c54f2",
  "./community-reel-v2.css?v=fd0051060777",
  "./social-offer.css",
  "./coffee-paths.css?v=e0e89349a2f4",
  "./social-offer.js?v=cf339e8c8777",
  "./menu-premium.css?v=86adefeda34f",
  "./pairing-posters.css?v=882faab929d1",
  "./menu-product-reveal.css?v=80aa0282d851",
  "./menu-stability-v2.css?v=84e172cb281b",
  "./menu-security-v2.css?v=c9ec36b38ff3",
  "./discover.css",
  "./discover-deck.css?v=14bb488e526a",
  "./discover-rotation.css?v=96b566c9731e",
  "./wordmark-responsive.css?v=20260704-1",
  "./brand-photo-logo.css?v=20260917-approved-v4-restore",
  "./src/brand/robys-primary-master-v1.svg?v=20260917-approved-v4-restore",
  "./src/brand/robys-header-master-v1.svg?v=20260917-approved-v4-restore",
  "./src/brand/robys-compact-master-v1.svg?v=20260917-approved-v4-restore",
  "./src/brand/robys-mark-master-v1.svg?v=20260917-approved-v4-restore",
  "./bootstrap-v2.js?v=b4984fb63ba2",
  "./morning-entry-v2.js?v=8a158515f4de",
  "./takeaway-entry.js?v=e42f8fe96069",
  "./src/brand/robys-takeaway-cup-v1.webp",
  "./day-night-entry.js?v=20260904-compositor-v25",
  "./app.js?v=c3e3627010df",
  "./conversion.js?v=a0e1928a38c0",
  "./menu-ready.js",
  "./menu-app.js?v=4be9f511052a",
  "./menu-pairing.js?v=bd8dad93ebae",
  "./menu-product-reveal.js?v=6ae2dd3ba2e7",
  "./menu-product-reveal-runtime.js?v=fd2730c787d9",
  "./pairing-posters.js?v=4fc1610c3f10",
  "./menu-pwa.js?v=pairing-video-fix-20260916-2",
  "./menu-catalog.js?v=05e7dac3c17b",
  "./menu-search-clear.js",
  "./menu-interactions.js?v=20260923-web-only-v4",
  "./smart-choice/index.html",
  "./experience/",
  "./experience/index.html",
  "./experience/experience-pwa.js?v=d8be62f9f9c2",
  "./experience/experience.js?v=b818597a4d32",
  "./experience/experience.css?v=ff925b1ea262",
  "./experience/brand-fidelity.css?v=1124cdd22903",
  "./experience/experience-state.css?v=ccb9ced40708",
  "./experience/cinematic-environments.css?v=76e6ccf04650",
  "./experience/environments/origin.svg?v=72b518cd81ca",
  "./experience/environments/energy.svg?v=763f3ca80be7",
  "./experience/environments/moment.svg?v=1ed58ad2b6fa",
  "./experience/environments/move.svg?v=9815d8f61a63",
  "./experience/environments/pair.svg?v=35401ccb58f0",
  "./experience/environments/finale.svg?v=fb371d27c428",
  "./src/products/gallery-v5/croissant-828.webp",
  "./src/products/gallery-v5/san-sebastian-828.webp",
  "./smart-choice/pwa.js?v=pairing-video-fix-20260916-2",
  "./smart-choice/style.css?v=c3664b917232",
  "./smart-choice/cart.css?v=42034af591c0",
  "./smart-choice/decision-trace.css?v=caa831d49b1f",
  "./smart-choice/release-qa.css?v=382f68926f7d",
  "./smart-choice/brand-v4.css?v=20260917-approved-v4-restore",
  "./smart-choice/release-qa.js?v=2811759ef7b2",
  "./smart-choice/app-v2.js?v=2950655c2203",
  "./smart-choice/cart-v2.js?v=db77b68f5ac9",
  "./smart-choice/experiments-v2.js?v=1ca034352c70",
  "./smart-choice/analytics-v2.js?v=2d2d2ccd5fba",
  "./smart-choice/decision-trace-v2.js?v=d8fe9d1ef4e8",
  "./discover.js",
  "./discover-v2.js?v=7d1b6bc8f058",
  "./discover-deck.js?v=23824b43dd75",
  "./discover-copy.js?v=748cea1d06ec",
  "./discover-journeys.js",
  "./discover-journeys-v2.js",
  "./discover-rotation.js",
  "./discover-rotation-v2.js",
  "./discover-rotation-v3.js?v=b7b8c4df73db",
  "./src/brand/robys-organic-ring.svg?v=20260720-1",
  "./src/pairings-data/final/cool-lime-macaron-price-free.webp",
  "./src/pairings-data/approved/iced-san-sebastian-hq.webp",
  ...MENU_IMAGE_ASSETS,
  "./src/products/sets-v1/cool-lime-macaron.webp",
  "./src/products/sets-v1/iced-san-sebastian.webp",
  "./src/products/san-sebastian.webp",
  "./src/pairings-data/final/cool-lime-macaron.webp.b64.txt",
  "./src/pairings-data/final/iced-san-sebastian.webp.b64.txt",
  "./icon.svg",
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
    url.pathname.endsWith("/seasonal-theme.js") ||
    url.pathname.endsWith("/seasonal.css") ||
    url.pathname.endsWith("/menu-runtime.css") ||
    url.pathname.endsWith("/menu-family-ui.js") ||
    url.pathname.endsWith("/menu-family.css") ||
    url.pathname.endsWith("/kids-menu.css") ||
    url.pathname.endsWith("/menu-combos-ui.js") ||
    url.pathname.endsWith("/menu-combos.css") ||
    url.pathname.endsWith("/combo-entry.css") ||
    url.pathname.endsWith("/choice-help.js") ||
    url.pathname.endsWith("/choice-help-entry.js") ||
    url.pathname.endsWith("/choice-help.css") ||
    url.pathname.endsWith("/discover-copy.js") ||
    url.pathname.endsWith("/pwa-pairing-fix.js") ||
    url.pathname.endsWith("/conversion.js") ||
    url.pathname.endsWith("/social-offer.js") ||
    url.pathname.endsWith("/bootstrap-v2.js") ||
    url.pathname.endsWith("/morning-entry-v2.js") ||
    url.pathname.endsWith("/takeaway-entry.js") ||
    url.pathname.endsWith("/styles-v2.css") ||
    url.pathname.endsWith("/mobile.css") ||
    url.pathname.endsWith("/menu-preview.css") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/menu-security-v2.css") ||
    url.pathname.endsWith("/menu-stability-v2.css") ||
    url.pathname.endsWith("/final-qa-v2.css") ||
    url.pathname.endsWith("/community-reel-v2.css") ||
    url.pathname.endsWith("/pwa.js") ||
    url.pathname.endsWith("/menu-pwa.js") ||
    url.pathname.endsWith("/day-night-entry.js") ||
    url.pathname.endsWith("/menu-app.js") ||
    url.pathname.endsWith("/menu-feed.js") ||
    url.pathname.endsWith("/menu-feedback.js") ||
    url.pathname.endsWith("/menu-feed-viewer.js") ||
    url.pathname.endsWith("/menu-view-mode.js") ||
    url.pathname.endsWith("/menu-feed.css") ||
    url.pathname.endsWith("/menu-share-entry.js") ||
    url.pathname.endsWith("/menu-share-entry.css") ||
    url.pathname.endsWith("/menu-order-ui.js") ||
    url.pathname.endsWith("/order-storage.js") ||
    url.pathname.endsWith("/order-checkout.js") ||
    url.pathname.endsWith("/order-checkout.css") ||
    url.pathname.endsWith("/cashier.js") ||
    url.pathname.endsWith("/menu-pairing.js") ||
    url.pathname.endsWith("/menu-product-reveal.css") ||
    url.pathname.endsWith("/menu-product-reveal.js") ||
    url.pathname.endsWith("/menu-product-reveal-runtime.js") ||
    url.pathname.endsWith("/pairing-posters.js") ||
    url.pathname.endsWith("/pairing-posters.css") ||
    url.pathname.endsWith("/menu-catalog.js") ||
    url.pathname.endsWith("/menu-premium.css") ||
    url.pathname.endsWith("/coffee-paths.css") ||
    url.pathname.endsWith("/menu-interactions.js") ||
    url.pathname.endsWith("/discover-v2.js") ||
    url.pathname.endsWith("/discover-deck.css") ||
    url.pathname.endsWith("/discover-deck.js") ||
    url.pathname.endsWith("/discover-rotation-v3.js") ||
    url.pathname.endsWith("/discover-rotation.css") ||
    url.pathname.endsWith("/experience/experience-pwa.js") ||
    url.pathname.endsWith("/experience/experience.js") ||
    url.pathname.endsWith("/experience/experience.css") ||
    url.pathname.endsWith("/experience/brand-fidelity.css") ||
    url.pathname.endsWith("/experience/experience-state.css") ||
    url.pathname.endsWith("/experience/cinematic-environments.css") ||
    url.pathname.includes("/experience/environments/") ||
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
  const isMenuFeed = url.pathname.endsWith("/menu-feed.html");
  const shareMatch = url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length).match(/^share\/(tr|en|ru)\/([a-z0-9-]+)\.html$/) : null;
  const shareProduct = shareMatch ? MENU_SHARE_PRODUCTS[shareMatch[2]] : null;
  const isCashier = url.pathname.endsWith("/cashier.html");
  const isDiscover = url.pathname.endsWith("/discover.html");
  const isSmartChoice = url.pathname === `${scopePath}smart-choice/` ||
    url.pathname === `${scopePath}smart-choice/index.html`;
  const isExperience = url.pathname === `${scopePath}experience/` ||
    url.pathname === `${scopePath}experience/index.html`;
  const isHome = url.pathname === scopePath || url.pathname === `${scopePath}index.html`;

  try {
    const network = await fetch(request);
    if (network.ok) {
      if (isMenu || isMenuFeed || isCashier || isDiscover || isSmartChoice || isExperience || isHome) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    }
  } catch {
    // Fall through to a deterministic cached page.
  }

  if (isMenu) return cachedPage("menu.html");
  if (isMenuFeed) return cachedPage("menu-feed.html");
  if (typeof shareProduct === "string") {
    const entry = new URL("menu-feed.html", self.registration.scope);
    entry.searchParams.set("item", shareProduct);
    entry.searchParams.set("lang", shareMatch[1]);
    entry.searchParams.set("view", "feed");
    return Response.redirect(entry.href, 302);
  }
  if (isCashier) return cachedPage("cashier.html");
  if (isDiscover) return cachedPage("discover.html");
  if (isSmartChoice) return cachedPage("smart-choice/index.html");
  if (isExperience) return cachedPage("experience/index.html");
  if (isHome) return cachedPage("index.html");
  return cachedPage("404.html");
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Live staff sessions and order status must never pass through offline caches,
  // even when a previously installed menu worker controls the counter pages.
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : "";
  if (relativePath === "counter-config.json" || relativePath.startsWith("api/counter/") ||
      relativePath.startsWith("counter/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(runtimeAssetResponse(event.request));
});
