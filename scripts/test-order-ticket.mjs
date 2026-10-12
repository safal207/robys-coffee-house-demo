import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { menuCategories } from "../menu-catalog.js";
import { createOrderQr } from "../src/order-checkout.js";
import { createTicketStorage } from "../src/order-ticket-storage.js";
import { addOrderGroup, normalizeOrderDraft, removeOrderGroup, updateOrderGroupQuantity } from "../src/order-draft.js";
import { getSweetProducts, isHotDrink, quoteMenuSelection } from "../src/menu-pairing.js";
import { buildCashierUrl, buildPosOrderRequest, decodeOrderTicket, encodeOrderTicket,
  getOrCreateOrderTicket, MAX_TICKET_PAYLOAD_LENGTH, ORDER_TICKET_STORAGE_KEY, ORDER_TICKET_CATALOG_REVISION,
  quoteOrderTicket, validateTicketDraft } from "../src/order-ticket.js";

const tea = "brew-hot:black-tea";
const cake = "desserts:san-sebastian-cheesecake";
const draft = { version: 1, groups: [{ quantity: 2, items: [{ id: tea, quantity: 1 }, { id: cake, quantity: 1 }] }] };
const store = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const errorCode = (code) => (error) => error?.code === code;
const fixtureTicket = () => getOrCreateOrderTicket(draft, { now: Date.UTC(2026, 9, 10, 10) });
const compactPayload = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const productSlug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const menuProducts = menuCategories.flatMap(category => (category.items ?? category.groups.flatMap(group => group.items))
  .map(item => ({ id: `${category.id}:${item.id ?? productSlug(item.name.en)}`, category, item })));
const productIds = new Set(menuProducts.map(product => product.id));
const drinks = menuProducts.filter(product => ["hot-coffee", "brew-hot", "herbal-tea", "cold-coffee", "refreshers"].includes(product.category.id));
const sweets = getSweetProducts(new Map(menuProducts.map(product => [product.id, product])));
const drinkOptions = drinks.flatMap(product => (product.item.variants?.length ? product.item.variants : [undefined])
  .map(variant => ({ product, variant })));
const legacyTicket = (ticket, language = "tr") => [1, ticket.id, ticket.createdAt, language, ORDER_TICKET_CATALOG_REVISION,
  ticket.groups.map(group => [group.quantity, group.items.map(item => [menuProducts.findIndex(product => product.id === item.id),
    item.quantity, ...(item.variant ? [item.variant] : [])])])];
const catalogDraft = () => {
  return { version: 1, groups: menuProducts.map(({ id, item }) => ({ quantity: 1,
    items: [{ id, quantity: 1, ...(item.variants?.length ? { variant: item.variants[0].id } : {}) }] })) };
};

function mockElement(namespaceURI, tag) {
  return { namespaceURI, tag, attributes: {}, children: [],
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; } };
}
function mockDocument() {
  return { createElement: tag => mockElement(null, tag), createElementNS: mockElement };
}

test("every drink/dessert/flavor × quantity1/2 retains composition and prices through checkout, edits and removal", async (context) => {
  const { renderTicketContent: renderBuiltTicket } = await import("../order-checkout.js");
  const previousDocument = globalThis.document;
  globalThis.document = mockDocument();
  let cases = 0;
  try {
    assert.equal(drinks.length, 44, "cover all five drink categories");
    assert.equal(sweets.length, 12, "cover every dessert option, including Nutella croissant");
    const sentinel = menuProducts.find(product => product.category.id === "food" && product.id !== "food:nutella-croissant");
    const starting = addOrderGroup(null, [{ id: sentinel.id, quantity: 1 }], 1, productIds).draft;
    for (const { product, variant } of drinkOptions) for (const sweet of sweets) for (const quantity of [1, 2]) {
      const label = `${product.id}/${variant?.id ?? "plain"} + ${sweet.id} ×${quantity}`;
      const items = [{ id: product.id, quantity: 1, ...(variant ? { variant: variant.id } : {}) }, { id: sweet.id, quantity: 1 }];
      const result = addOrderGroup(starting, items, quantity, productIds);
      assert.equal(result.applied, true, label);
      const restoredDraft = normalizeOrderDraft(JSON.parse(JSON.stringify(result.draft)), productIds);
      const group = restoredDraft.groups.find(entry => entry.items.length === 2);
      assert.deepEqual(group.items, items, label);
      assert.equal(group.quantity, quantity, label);
      const expectedPairMinor = Math.round((product.item.price + sweet.item.price) * quantity * 100);
      const expectedTotalMinor = expectedPairMinor + Math.round(sentinel.item.price * 100);
      if (isHotDrink(product)) {
        const preview = quoteMenuSelection(new Map(), [product, sweet], quantity);
        assert.equal(Math.round(preview.total * 100), expectedPairMinor, label);
      }
      const storage = store();
      const ticket = getOrCreateOrderTicket(restoredDraft, { storage });
      assert.equal(getOrCreateOrderTicket(restoredDraft, { storage }).id, ticket.id, label);
      for (const language of ["tr", "en", "ru"]) {
        const url = buildCashierUrl(ticket, language, "https://safal207.github.io/robys-coffee-house-demo/");
        const decoded = decodeOrderTicket(new URL(url).hash.slice(1));
        assert.deepEqual(decoded.ticket, ticket, label);
        assert.equal(decoded.language, language, label);
        const sourceQuote = quoteOrderTicket(decoded.ticket, language);
        const builtQuote = renderBuiltTicket(mockElement(null, "section"), decoded.ticket, language, { cashier: true });
        for (const quote of [sourceQuote, builtQuote]) {
          assert.equal(quote.totalMinor, expectedTotalMinor, label);
          const pair = quote.groups.find(entry => entry.items.length === 2);
          assert.equal(pair.lineTotalMinor, expectedPairMinor, label);
          const namedDrink = pair.items.find(entry => entry.id === product.id);
          assert.equal(namedDrink.name, product.item.name[language], label);
          assert.equal(namedDrink.variantName, variant?.name[language] ?? "", label);
        }
      }
      const changed = updateOrderGroupQuantity(restoredDraft, group.id, quantity === 1 ? 2 : 1, productIds);
      assert.equal(changed.applied, true, label);
      const next = getOrCreateOrderTicket(changed.draft, { storage });
      assert.notEqual(next.id, ticket.id, label);
      assert.equal(next.groups.find(entry => entry.items.length === 2).quantity, quantity === 1 ? 2 : 1, label);
      assert.equal(quoteOrderTicket(next).totalMinor,
        Math.round((product.item.price + sweet.item.price) * (quantity === 1 ? 2 : 1) * 100 + sentinel.item.price * 100), label);
      const removed = removeOrderGroup(changed.draft, group.id, productIds);
      assert.deepEqual(removed, starting, label);
      const finalTicket = getOrCreateOrderTicket(removed, { storage });
      assert.notEqual(finalTicket.id, next.id, label);
      assert.equal(quoteOrderTicket(finalTicket).totalMinor, Math.round(sentinel.item.price * 100), label);
      const empty = removeOrderGroup(removed, removed.groups[0].id, productIds);
      assert.throws(() => getOrCreateOrderTicket(empty), errorCode("empty-order"), label);
      cases += 1;
    }
  } finally { globalThis.document = previousDocument; }
  context.diagnostic(`${cases} combinations; ${drinkOptions.length} drink/flavor choices × ${sweets.length} desserts × 2 quantities × 3 languages; source + built cashier prices agree`);
});

test("ticket preserves pairs, reprices catalog and never encodes paid/preparing or prices", () => {
  const ticket = fixtureTicket();
  const payload = encodeOrderTicket(ticket, "ru");
  const restored = decodeOrderTicket(payload);
  assert.deepEqual(restored.ticket, ticket);
  assert.equal(restored.language, "ru");
  const quote = quoteOrderTicket(restored.ticket, "ru");
  assert.equal(quote.groups.length, 1);
  assert.equal(quote.groups[0].quantity, 2);
  const brew = menuCategories.find((category) => category.id === "brew-hot");
  const desserts = menuCategories.find((category) => category.id === "desserts");
  const expected = 2 * (brew.items.find((item) => item.name.en === "Black Tea").price
    + desserts.items.find((item) => item.name.en === "San Sebastian Cheesecake").price) * 100;
  assert.equal(quote.totalMinor, expected);
  const plain = Buffer.from(payload, "base64url").toString("utf8");
  assert.doesNotMatch(plain, /paid|preparing|price|totalMinor|submitted/i);
  assert.deepEqual(Object.keys(buildPosOrderRequest(ticket)).sort(), ["clientRequestId", "createdAt", "groups", "schemaVersion"]);
});

test("unchanged checkout is idempotent across reload; edited composition makes a fresh ticket", () => {
  const storage = store();
  const first = getOrCreateOrderTicket(draft, { storage });
  const reloaded = getOrCreateOrderTicket(structuredClone(draft), { storage });
  assert.equal(reloaded.id, first.id);
  const changed = structuredClone(draft);
  changed.groups[0].quantity = 3;
  const next = getOrCreateOrderTicket(changed, { storage });
  assert.notEqual(next.id, first.id);
  assert.equal(getOrCreateOrderTicket(changed, { storage }).id, next.id);
  assert.notEqual(getOrCreateOrderTicket(draft, { storage }).id, next.id);
});

test("ticket survives session migration when persistent storage rejects writes", () => {
  const session = store();
  const first = getOrCreateOrderTicket(draft, { storage: session });
  const readonly = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  const storage = createTicketStorage({ persistent: () => readonly, temporary: () => session });
  assert.equal(getOrCreateOrderTicket(draft, { storage }).id, first.id);
  const changed = structuredClone(draft);
  changed.groups[0].quantity = 3;
  const next = getOrCreateOrderTicket(changed, { storage });
  assert.notEqual(next.id, first.id);
  assert.equal(getOrCreateOrderTicket(changed, { storage }).id, next.id);
  const reloaded = createTicketStorage({ persistent: () => readonly, temporary: () => session });
  assert.equal(getOrCreateOrderTicket(changed, { storage: reloaded }).id, next.id);
});

test("failed ticket writes keep the latest ticket instead of restoring stale persistent data", () => {
  const persistent = store();
  const first = getOrCreateOrderTicket(draft, { storage: persistent });
  persistent.setItem = () => { throw new Error("quota"); };
  const inaccessible = () => { throw new Error("blocked"); };
  const storage = createTicketStorage({ persistent: () => persistent, temporary: inaccessible });
  assert.equal(getOrCreateOrderTicket(draft, { storage }).id, first.id);
  const changed = structuredClone(draft);
  changed.groups[0].quantity = 3;
  const next = getOrCreateOrderTicket(changed, { storage });
  assert.notEqual(next.id, first.id);
  assert.equal(getOrCreateOrderTicket(changed, { storage }).id, next.id);
});

test("quota failure followed by reload preserves the pending ticket and recovers persistence", () => {
  const persistent = store(), session = store();
  const save = persistent.setItem;
  const createStorage = () => createTicketStorage({ persistent: () => persistent, temporary: () => session });
  const first = getOrCreateOrderTicket(draft, { storage: createStorage() });
  persistent.setItem = () => { throw new Error("quota"); };
  const changed = structuredClone(draft); changed.groups[0].quantity = 3;
  const next = getOrCreateOrderTicket(changed, { storage: createStorage() });
  assert.notEqual(next.id, first.id);
  assert.equal(getOrCreateOrderTicket(changed, { storage: createStorage() }).id, next.id);
  assert.equal(JSON.parse(persistent.getItem(ORDER_TICKET_STORAGE_KEY)).ticket.id, first.id);
  persistent.setItem = save;
  assert.equal(getOrCreateOrderTicket(changed, { storage: createStorage() }).id, next.id);
  assert.equal(JSON.parse(persistent.getItem(ORDER_TICKET_STORAGE_KEY)).ticket.id, next.id);
  assert.equal(session.getItem(`${ORDER_TICKET_STORAGE_KEY}.pending`), null);
});

test("a pending session write cannot replace a newer ticket saved by another tab", () => {
  const persistent = store(), session = store();
  const save = persistent.setItem;
  const createStorage = () => createTicketStorage({ persistent: () => persistent, temporary: () => session });
  getOrCreateOrderTicket(draft, { storage: createStorage() });
  persistent.setItem = () => { throw new Error("quota"); };
  const changed = structuredClone(draft); changed.groups[0].quantity = 3;
  getOrCreateOrderTicket(changed, { storage: createStorage() });
  persistent.setItem = save;
  const otherDraft = structuredClone(draft); otherDraft.groups[0].quantity = 4;
  const other = getOrCreateOrderTicket(otherDraft, { storage: persistent });
  assert.equal(getOrCreateOrderTicket(otherDraft, { storage: createStorage() }).id, other.id);
  assert.equal(JSON.parse(persistent.getItem(ORDER_TICKET_STORAGE_KEY)).ticket.id, other.id);
  assert.equal(session.getItem(`${ORDER_TICKET_STORAGE_KEY}.pending`), null);
});

test("invalid cached ticket cannot replace validated composition", () => {
  const storage = store();
  const first = getOrCreateOrderTicket(draft, { storage });
  const record = JSON.parse(storage.getItem(ORDER_TICKET_STORAGE_KEY));
  record.ticket.groups[0].items[0].id = "evil:unknown";
  storage.setItem(ORDER_TICKET_STORAGE_KEY, JSON.stringify(record));
  const repaired = getOrCreateOrderTicket(draft, { storage });
  assert.notEqual(repaired.id, first.id);
  assert.deepEqual(repaired.groups, first.groups);
});

test("empty, unknown, duplicate and noninteger/overflowing groups are rejected", () => {
  assert.throws(() => validateTicketDraft({ version: 1, groups: [] }), errorCode("empty-order"));
  const one = (item, quantity = 1) => ({ version: 1, groups: [{ quantity, items: [item] }] });
  assert.throws(() => validateTicketDraft(one({ id: "unknown", quantity: 1 })), errorCode("unknown-product"));
  for (const quantity of [0, -1, 1.5, "1", 100, NaN, Infinity]) {
    assert.throws(() => validateTicketDraft(one({ id: tea, quantity })), errorCode("invalid-quantity"));
    assert.throws(() => validateTicketDraft(one({ id: tea, quantity: 1 }, quantity)), errorCode("invalid-quantity"));
  }
  assert.throws(() => validateTicketDraft(one({ id: tea, quantity: 50 }, 2)), errorCode("invalid-quantity"));
  assert.throws(() => validateTicketDraft({ version: 1, groups: [
    { quantity: 60, items: [{ id: tea, quantity: 1 }] }, { quantity: 40, items: [{ id: tea, quantity: 1 }] }
  ] }), errorCode("invalid-quantity"));
  assert.throws(() => validateTicketDraft({ version: 1, groups: [{ quantity: 1,
    items: [{ id: tea, quantity: 1 }, { id: tea, quantity: 1 }] }] }), errorCode("duplicate-item"));
  assert.throws(() => validateTicketDraft(one({ id: tea, quantity: 1, variant: "vanilla" })), errorCode("invalid-variant"));
});

test("flavor survives QR and missing/unknown flavor is rejected", () => {
  const category = menuCategories.find((entry) => entry.id === "cold-coffee");
  const product = category.items.find((item) => item.name.en === "Milkshake");
  assert.ok(product.variants?.length > 1, "milkshake catalog must declare selectable flavors");
  const flavored = { version: 1, groups: [{ quantity: 1, items: [{ id: "cold-coffee:milkshake", quantity: 1, variant: product.variants[0].id }] }] };
  const ticket = getOrCreateOrderTicket(flavored);
  const restored = decodeOrderTicket(encodeOrderTicket(ticket, "ru")).ticket;
  assert.equal(restored.groups[0].items[0].variant, product.variants[0].id);
  assert.equal(quoteOrderTicket(restored, "ru").groups[0].items[0].variantName, product.variants[0].name.ru);
  delete flavored.groups[0].items[0].variant;
  assert.throws(() => getOrCreateOrderTicket(flavored), errorCode("invalid-variant"));
  flavored.groups[0].items[0].variant = "<script>";
  assert.throws(() => getOrCreateOrderTicket(flavored), errorCode("invalid-variant"));
});

test("bounded decoder rejects malformed/oversized/version/catalog/product/status injection", () => {
  const ticket = fixtureTicket();
  const original = legacyTicket(ticket);
  for (const input of ["", "?", "a".repeat(MAX_TICKET_PAYLOAD_LENGTH + 1), compactPayload({}), "%%%%"]) {
    assert.throws(() => decodeOrderTicket(input));
  }
  for (const mutate of [
    (value) => { value[0] = 2; }, (value) => { value[1] = "<img src=x>"; },
    (value) => { value[2] = 0; }, (value) => { value[3] = "javascript:"; },
    (value) => { value[4] = "wrong-catalog"; },
    (value) => { value[5][0][1][0][0] = 99999; },
    (value) => { value[5][0][0] = 1.5; },
    (value) => { value.push({ paid: true, total: 1 }); }
  ]) {
    const invalid = structuredClone(original);
    mutate(invalid);
    assert.throws(() => decodeOrderTicket(compactPayload(invalid)));
  }
  assert.throws(() => buildCashierUrl(ticket, "ru", "javascript:alert(1)"));
});

test("binary QR rejects truncated bytes, invalid header/counts/variants and trailing status data", () => {
  const original = Buffer.from(encodeOrderTicket(fixtureTicket(), "ru"), "base64url");
  assert.equal(original[0], 2);
  for (let length = 0; length < original.length; length += 1) {
    assert.throws(() => decodeOrderTicket(original.subarray(0, length).toString("base64url")));
  }
  for (const [offset, value] of [[0, 9], [1, 60], [27, 4], [32, 0], [32, 65], [33, 0], [33, 100], [34, 0], [34, 9], [35, 255], [36, 0], [37, 255]]) {
    const changed = Buffer.from(original);
    changed[offset] = value;
    assert.throws(() => decodeOrderTicket(changed.toString("base64url")), `invalid byte ${offset}=${value}`);
  }
  const badDate = Buffer.from(original); badDate.fill(0, 21, 27);
  assert.throws(() => decodeOrderTicket(badDate.toString("base64url")), errorCode("invalid-ticket"));
  const wrongCatalog = Buffer.from(original); wrongCatalog[28] ^= 255;
  assert.throws(() => decodeOrderTicket(wrongCatalog.toString("base64url")), errorCode("catalog-changed"));
  assert.throws(() => decodeOrderTicket(Buffer.concat([original, Buffer.from('{"paid":true,"total":1}')]).toString("base64url")), errorCode("invalid-payload"));
});

test("earlier v1 QR remains readable while v2 significantly reduces the full catalog payload", () => {
  const ticket = getOrCreateOrderTicket(catalogDraft());
  const legacy = compactPayload(legacyTicket(ticket, "ru"));
  const binary = encodeOrderTicket(ticket, "ru");
  assert.deepEqual(decodeOrderTicket(legacy), decodeOrderTicket(binary));
  assert.ok(binary.length < legacy.length / 2, `${binary.length} bytes must be less than half of ${legacy.length}`);
  assert.ok(buildCashierUrl(ticket, "ru", "https://safal207.github.io/robys-coffee-house-demo/").length < 600);
});

test("full catalog fits; excessively large valid composition reports a bounded QR error", () => {
  const all = catalogDraft();
  assert.equal(all.groups.length, 63);
  const ticket = getOrCreateOrderTicket(all);
  const payload = encodeOrderTicket(ticket);
  assert.ok(payload.length <= MAX_TICKET_PAYLOAD_LENGTH);
  assert.deepEqual(decodeOrderTicket(payload).ticket.groups, ticket.groups);
  const eightItems = all.groups.slice(0, 8).flatMap((group) => group.items);
  const large = { version: 1, groups: Array.from({ length: 64 }, () => ({ quantity: 1, items: eightItems })) };
  const oversized = getOrCreateOrderTicket(large);
  assert.throws(() => encodeOrderTicket(oversized), errorCode("order-too-large"));
});

async function scanSvgQr(url, createQr = createOrderQr, pixelWidth) {
  const { default: jsQR } = await import("jsqr");
  const previousDocument = globalThis.document;
  globalThis.document = mockDocument();
  let svg;
  try { svg = createQr(url, "ru"); } finally { globalThis.document = previousDocument; }
  const modules = Number(svg.attributes.viewBox.split(" ")[2]);
  const size = pixelWidth ?? Number(svg.attributes.width ?? modules * 5), scale = size / modules;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  const path = svg.children.find((child) => child.tag === "path").attributes.d;
  for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [, column, row, run] = match.map(Number);
    for (let y = Math.round(row * scale); y < Math.round((row + 1) * scale); y += 1) for (let x = Math.round(column * scale); x < Math.round((column + run) * scale); x += 1) {
      const offset = (y * size + x) * 4;
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = 0;
    }
  }
  const read = jsQR(rgba, size, size);
  assert.ok(read, `independent scanner must read the rendered QR geometry at ${size}px (${modules} modules)`);
  return read.data;
}

test("actual SVG QR independently decodes both a pair and full63-item cart", async () => {
  const { createOrderQr: createBuiltQr } = await import("../order-checkout.js");
  for (const ticket of [fixtureTicket(), getOrCreateOrderTicket(catalogDraft())]) {
    const url = buildCashierUrl(ticket, "ru", "https://safal207.github.io/robys-coffee-house-demo/");
    assert.ok(url.startsWith("https://safal207.github.io/robys-coffee-house-demo/cashier.html#"));
    const decodedUrl = await scanSvgQr(url);
    assert.equal(decodedUrl, url);
    assert.deepEqual(decodeOrderTicket(new URL(decodedUrl).hash.slice(1)).ticket, ticket);
    assert.equal(await scanSvgQr(url, createBuiltQr), url);
  }
});

test("independent QR scanner reads every flavor and drink category paired with dessert", async (context) => {
  const selectedCategories = new Set();
  const samples = drinkOptions.filter(({ product, variant }) => {
    if (variant) return true;
    if (selectedCategories.has(product.category.id)) return false;
    selectedCategories.add(product.category.id);
    return true;
  });
  for (const [index, { product, variant }] of samples.entries()) {
    const sweet = sweets[index % sweets.length];
    const chosen = { version: 1, groups: [{ quantity: 2, items: [
      { id: product.id, quantity: 1, ...(variant ? { variant: variant.id } : {}) }, { id: sweet.id, quantity: 1 }
    ] }] };
    const ticket = getOrCreateOrderTicket(chosen);
    const url = buildCashierUrl(ticket, ["tr", "en", "ru"][index % 3], "https://safal207.github.io/robys-coffee-house-demo/");
    const scanned = await scanSvgQr(url);
    assert.equal(scanned, url);
    assert.deepEqual(decodeOrderTicket(new URL(scanned).hash.slice(1)).ticket, ticket);
  }
  context.diagnostic(`${samples.length} rendered flavor/category QR samples independently decoded`);
});

test("full catalog QR reads at desktop and narrow mobile display pixel sizes", async () => {
  const ticket = getOrCreateOrderTicket(catalogDraft());
  const url = buildCashierUrl(ticket, "ru", "https://safal207.github.io/robys-coffee-house-demo/");
  // Intrinsic desktop size at 1x; 320px mobile's 264px QR at 2x/3x device pixels.
  for (const pixelWidth of [undefined, 528, 792]) assert.equal(await scanSvgQr(url, createOrderQr, pixelWidth), url);
});

test("cashier navigation uses its cached page offline, at root and repository subpaths", async () => {
  const serviceWorker = readFileSync(new URL("../sw-core-v64.js", import.meta.url), "utf8");
  for (const scope of ["https://example.com/", "https://example.com/robys-coffee-house-demo/"]) {
    const lookups = [];
    const writes = [];
    let offline = true;
    const cache = {
      async match(request) { lookups.push(request.url); return new Response(new URL(request.url).pathname); },
      async put(request) { writes.push(request.url); }
    };
    const context = vm.createContext({ URL, Request, Response, Promise,
      self: { registration: { scope }, location: { origin: new URL(scope).origin }, addEventListener() {} },
      caches: { open: async () => cache },
      fetch: async () => { if (offline) throw new Error("offline"); return new Response("fresh cashier"); }
    });
    vm.runInContext(serviceWorker, context);
    const cashierUrl = new URL("cashier.html", scope).href;
    context.checkoutRequest = new Request(cashierUrl);
    const cached = await vm.runInContext("navigationResponse(checkoutRequest)", context);
    assert.equal(await cached.text(), new URL(cashierUrl).pathname);
    assert.deepEqual(lookups, [cashierUrl]);
    offline = false;
    const fresh = await vm.runInContext("navigationResponse(checkoutRequest)", context);
    assert.equal(await fresh.text(), "fresh cashier");
    assert.deepEqual(writes, [cashierUrl], "online cashier navigation refreshes its cached page");
  }
});
