import { menuCategories } from "../menu-catalog.js";

// A QR is a customer's requested composition, never proof of payment or a
// trusted price. The receiving catalog supplies every amount and description.
export const ORDER_TICKET_STORAGE_KEY = "robys-counter-ticket.v1";
export const MAX_TICKET_PAYLOAD_LENGTH = 2000;
export const MAX_TICKET_URL_LENGTH = 2250;
const MAX_GROUPS = 64;
const MAX_GROUP_ITEMS = 8;
const LANGUAGES = ["tr", "en", "ru"];
const ID_PATTERN = /^[A-HJ-NP-Z2-9]{20}$/;
const slug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export class OrderTicketError extends Error {
  constructor(code) { super(code); this.name = "OrderTicketError"; this.code = code; }
}
const fail = (code) => { throw new OrderTicketError(code); };
const integer = (value, max = 99) => Number.isInteger(value) && value > 0 && value <= max;

const products = menuCategories.flatMap((category) =>
  (category.items ?? category.groups?.flatMap((group) => group.items) ?? []).map((item) => ({
    id: `${category.id}:${item.id ?? slug(item.name.en)}`,
    name: item.name,
    priceMinor: Math.round(item.price * 100),
    variants: item.variants ?? []
  }))
);
const productIndex = new Map(products.map((product, index) => [product.id, { ...product, index }]));
// Prices intentionally do not participate: a cashier always sees today's price.
function catalogFingerprint() {
  const input = JSON.stringify(products.map((product) => [product.id, product.variants.map((variant) => variant.id)]));
  let hash = 2166136261;
  for (const character of input) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export const ORDER_TICKET_CATALOG_REVISION = catalogFingerprint();

export function validateTicketDraft(draft) {
  if (!draft || draft.version !== 1) fail("invalid-draft");
  if (Object.hasOwn(draft, "groups") && !Array.isArray(draft.groups)) fail("invalid-draft");
  const source = Array.isArray(draft.groups) ? draft.groups
    : Array.isArray(draft.lines) ? draft.lines.map((line) => ({ quantity: line.quantity, items: [{ id: line.id, variant: line.variant, quantity: 1 }] }))
      : fail("invalid-draft");
  if (!source.length) fail("empty-order");
  if (source.length > MAX_GROUPS) fail("order-too-large");
  const quantities = new Map();
  const groups = source.map((group) => {
    if (!group || !integer(group.quantity) || !Array.isArray(group.items) || !group.items.length || group.items.length > MAX_GROUP_ITEMS) fail("invalid-quantity");
    const seen = new Set();
    const items = group.items.map((line) => {
      if (!line || typeof line.id !== "string" || !productIndex.has(line.id)) fail("unknown-product");
      if (!integer(line.quantity)) fail("invalid-quantity");
      const product = productIndex.get(line.id);
      const variant = line.variant;
      if (product.variants.length) {
        if (typeof variant !== "string" || !product.variants.some((candidate) => candidate.id === variant)) fail("invalid-variant");
      } else if (variant !== undefined && variant !== "") fail("invalid-variant");
      if (!Number.isSafeInteger(product.priceMinor) || product.priceMinor <= 0) fail("invalid-price");
      const identity = `${line.id}\u0000${variant ?? ""}`;
      if (seen.has(identity)) fail("duplicate-item");
      seen.add(identity);
      const quantity = (quantities.get(line.id) ?? 0) + line.quantity * group.quantity;
      if (!integer(quantity)) fail("invalid-quantity");
      quantities.set(line.id, quantity);
      return { id: line.id, ...(variant ? { variant } : {}), quantity: line.quantity };
    }).sort((a, b) => `${a.id}:${a.variant ?? ""}`.localeCompare(`${b.id}:${b.variant ?? ""}`, "en"));
    return { quantity: group.quantity, items };
  }).sort((a, b) => JSON.stringify(a.items).localeCompare(JSON.stringify(b.items), "en"));
  return groups;
}

export function quoteOrderTicket(ticket, language = "tr") {
  const groups = validateTicketDraft({ version: 1, groups: ticket.groups });
  const lang = LANGUAGES.includes(language) ? language : "tr";
  let totalMinor = 0;
  return {
    groups: groups.map((group) => {
      const items = group.items.map((line) => {
        const product = productIndex.get(line.id);
        const variant = product.variants.find((candidate) => candidate.id === line.variant);
        return { ...line, name: product.name[lang] ?? product.name.tr,
          variantName: variant ? variant.name[lang] ?? variant.name.tr : "", unitPriceMinor: product.priceMinor };
      });
      const unitTotalMinor = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
      const lineTotalMinor = unitTotalMinor * group.quantity;
      totalMinor += lineTotalMinor;
      if (![unitTotalMinor, lineTotalMinor, totalMinor].every(Number.isSafeInteger)) fail("invalid-price");
      return { quantity: group.quantity, items, unitTotalMinor, lineTotalMinor };
    }),
    get totalMinor() { return totalMinor; }, currency: "TRY"
  };
}

function signature(groups) { return JSON.stringify([ORDER_TICKET_CATALOG_REVISION, groups]); }
function newTicketId(cryptoProvider) {
  if (!cryptoProvider?.getRandomValues) fail("secure-random-unavailable");
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(20));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function validHeader(ticket) {
  return ticket?.version === 1 && typeof ticket.id === "string" && ID_PATTERN.test(ticket.id)
    && Number.isSafeInteger(ticket.createdAt) && ticket.createdAt >= 1577836800000 && ticket.createdAt <= 4102444800000;
}

export function getOrCreateOrderTicket(draft, { storage, cryptoProvider = globalThis.crypto, now = Date.now() } = {}) {
  const groups = validateTicketDraft(draft);
  const nextSignature = signature(groups);
  if (!Number.isSafeInteger(now) || now < 1577836800000 || now > 4102444800000) fail("invalid-date");
  if (storage) {
    try {
      const savedText = storage.getItem(ORDER_TICKET_STORAGE_KEY);
      if (savedText?.length < 30000) {
        const saved = JSON.parse(savedText);
        if (saved?.signature === nextSignature && validHeader(saved.ticket)
          && signature(validateTicketDraft({ version: 1, groups: saved.ticket.groups })) === nextSignature) return saved.ticket;
      }
    } catch { /* An unavailable or damaged browser store does not submit an order. */ }
  }
  const ticket = { version: 1, id: newTicketId(cryptoProvider), createdAt: now, groups };
  try { storage?.setItem(ORDER_TICKET_STORAGE_KEY, JSON.stringify({ signature: nextSignature, ticket })); } catch { /* The open ticket still works. */ }
  return ticket;
}

export function ticketOrderNumber(ticket) { return `R-${ticket.id.slice(-8)}`; }

function encodeBase64Url(bytes) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeBase64Url(payload) {
  if (typeof payload !== "string" || !payload.length || payload.length > MAX_TICKET_PAYLOAD_LENGTH || !/^[A-Za-z0-9_-]+$/.test(payload)) fail("invalid-payload");
  try {
    const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (encodeBase64Url(bytes) !== payload) fail("invalid-payload");
    return bytes;
  } catch { fail("invalid-payload"); }
}

export function encodeOrderTicket(ticket, language = "tr") {
  if (!validHeader(ticket)) fail("invalid-ticket");
  const groups = validateTicketDraft({ version: 1, groups: ticket.groups });
  // Wire v2: one-byte version, 20 ASCII ID bytes, six-byte timestamp, language,
  // four-byte catalog fingerprint, group count; groups contain quantity/count
  // and three bytes per item (catalog index, quantity, 1-based variant index).
  // This keeps a full catalog readable on mobile without compression services.
  if (products.length > 256) fail("catalog-changed");
  const bytes = [2, ...Array.from(ticket.id, character => character.charCodeAt(0))];
  for (let shift = 5; shift >= 0; shift -= 1) bytes.push(Math.floor(ticket.createdAt / 256 ** shift) % 256);
  bytes.push(Math.max(0, LANGUAGES.indexOf(language)));
  const fingerprint = parseInt(ORDER_TICKET_CATALOG_REVISION, 16);
  for (let shift = 3; shift >= 0; shift -= 1) bytes.push(Math.floor(fingerprint / 256 ** shift) % 256);
  bytes.push(groups.length);
  for (const group of groups) {
    bytes.push(group.quantity, group.items.length);
    for (const item of group.items) {
      const product = productIndex.get(item.id);
      const variant = item.variant ? product.variants.findIndex(candidate => candidate.id === item.variant) + 1 : 0;
      if (variant > 255) fail("catalog-changed");
      bytes.push(product.index, item.quantity, variant);
    }
  }
  const payload = encodeBase64Url(bytes);
  if (payload.length > MAX_TICKET_PAYLOAD_LENGTH) fail("order-too-large");
  return payload;
}

function decodeLegacyTicket(compact) {
  if (!Array.isArray(compact) || compact.length !== 6 || compact[0] !== 1 || !LANGUAGES.includes(compact[3])) fail("invalid-payload");
  if (compact[4] !== ORDER_TICKET_CATALOG_REVISION) fail("catalog-changed");
  if (!Array.isArray(compact[5]) || compact[5].length > MAX_GROUPS) fail("invalid-payload");
  const ticket = { version: 1, id: compact[1], createdAt: compact[2], groups: compact[5].map((group) => {
    if (!Array.isArray(group) || group.length !== 2 || !Array.isArray(group[1]) || group[1].length > MAX_GROUP_ITEMS) fail("invalid-payload");
    return { quantity: group[0], items: group[1].map((item) => {
      if (!Array.isArray(item) || item.length < 2 || item.length > 3 || !Number.isInteger(item[0]) || !products[item[0]]) fail("unknown-product");
      return { id: products[item[0]].id, quantity: item[1], ...(item.length === 3 ? { variant: item[2] } : {}) };
    }) };
  }) };
  if (!validHeader(ticket)) fail("invalid-ticket");
  ticket.groups = validateTicketDraft({ version: 1, groups: ticket.groups });
  return { ticket, language: compact[3] };
}

function decodeBinaryTicket(bytes) {
  let cursor = 1;
  const read = () => { if (cursor >= bytes.length) fail("invalid-payload"); return bytes[cursor++]; };
  const number = length => {
    let value = 0;
    for (let index = 0; index < length; index += 1) value = value * 256 + read();
    return value;
  };
  const id = Array.from({ length: 20 }, () => String.fromCharCode(read())).join("");
  const createdAt = number(6);
  const language = LANGUAGES[read()];
  if (!language) fail("invalid-payload");
  if (number(4).toString(16).padStart(8, "0") !== ORDER_TICKET_CATALOG_REVISION) fail("catalog-changed");
  const groupCount = read();
  if (!integer(groupCount, MAX_GROUPS)) fail("invalid-payload");
  const groups = Array.from({ length: groupCount }, () => {
    const quantity = read();
    const itemCount = read();
    if (!integer(itemCount, MAX_GROUP_ITEMS)) fail("invalid-payload");
    const items = Array.from({ length: itemCount }, () => {
      const product = products[read()];
      if (!product) fail("unknown-product");
      const itemQuantity = read();
      const variantIndex = read();
      if (variantIndex > product.variants.length) fail("invalid-variant");
      return { id: product.id, quantity: itemQuantity,
        ...(variantIndex ? { variant: product.variants[variantIndex - 1].id } : {}) };
    });
    return { quantity, items };
  });
  if (cursor !== bytes.length) fail("invalid-payload");
  const ticket = { version: 1, id, createdAt, groups };
  if (!validHeader(ticket)) fail("invalid-ticket");
  ticket.groups = validateTicketDraft({ version: 1, groups });
  return { ticket, language };
}

export function decodeOrderTicket(payload) {
  const bytes = decodeBase64Url(payload);
  if (bytes[0] === 2) return decodeBinaryTicket(bytes);
  let legacy;
  try { legacy = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("invalid-payload"); }
  return decodeLegacyTicket(legacy);
}

export function buildCashierUrl(ticket, language, baseUrl) {
  const url = new URL("cashier.html", baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) fail("invalid-origin");
  url.search = "";
  url.hash = encodeOrderTicket(ticket, language);
  if (url.href.length > MAX_TICKET_URL_LENGTH) fail("order-too-large");
  return url.href;
}

// Future POS adapter boundary. POST this requested composition to a trusted
// service; that service must revalidate IDs, variants and current prices, return
// its own order identifier, and derive payment/preparation status from the POS.
// The browser never persists or accepts a paid/preparing status from a QR.
export function buildPosOrderRequest(ticket) {
  if (!validHeader(ticket)) fail("invalid-ticket");
  return { schemaVersion: "robys.counter-request.v1", clientRequestId: ticket.id,
    createdAt: ticket.createdAt, groups: validateTicketDraft({ version: 1, groups: ticket.groups }) };
}
