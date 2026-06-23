import { readFileSync } from "node:fs";

const html = readFileSync("docs/instagram-tools.html", "utf8");
const css = readFileSync("docs/instagram-tools.css", "utf8");
const js = readFileSync("docs/instagram-tools.js", "utf8");
const qr = readFileSync("docs/robys-instagram-qr.svg", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[INSTAGRAM-001] ${message}`);
}

const profileUrl = "https://www.instagram.com/robyscoffeehouse/";
const languageButtons = Array.from(html.matchAll(/data-lang="(tr|en|ru)"/g), (match) => match[1]);
const actions = Array.from(html.matchAll(/data-action="(waiter|bill|water|question)"/g), (match) => match[1]);
const externalLinks = Array.from(html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g), (match) => match[0]);

assert(JSON.stringify(languageButtons) === JSON.stringify(["tr", "en", "ru"]), "TR / EN / RU language controls changed");
assert(JSON.stringify(actions) === JSON.stringify(["waiter", "bill", "water", "question"]), "Table quick actions changed");
assert((html.match(new RegExp(profileUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 3, "Instagram profile links are missing");
assert(externalLinks.length >= 6, "Expected Instagram and gallery external links");
for (const link of externalLinks) {
  assert(/rel="noopener noreferrer"/.test(link), "Every target=_blank link must use noopener noreferrer");
}
assert(/connect-src 'none'/.test(html), "The tools page must not make API requests");
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(js), "Instagram tools must remain API-free");
assert(!/innerHTML/.test(js), "Unsafe innerHTML rendering is forbidden");
assert(/replace\(\/\[\^\\p\{L\}\\p\{N\}-\]\/gu/.test(js), "Table identifier sanitization changed");
assert(/slice\(0, 12\)/.test(js), "Table identifier length cap changed");
for (const language of ["tr", "en", "ru"]) {
  assert(new RegExp(`\\n  ${language}: \\{`).test(js), `Missing ${language} copy bundle`);
}
for (const action of ["waiter", "bill", "water", "question"]) {
  assert((js.match(new RegExp(`${action}:`, "g")) ?? []).length >= 4, `Missing localized ${action} action/messages`);
}
assert(/@media\(max-width:640px\)/.test(css), "Mobile layout contract is missing");
assert(/grid-template-columns:repeat\(2,1fr\)/.test(css), "Mobile action grid contract changed");
assert(/viewBox="0 0 37 37"/.test(qr), "Instagram QR dimensions changed");
assert(/<path\b[^>]*fill="#241c1b"/.test(qr), "Instagram QR path is missing");
assert(!/<script[^>]*src="https?:/i.test(html), "External scripts are forbidden");
assert(!/<link[^>]*href="https?:/i.test(html), "External styles are forbidden");

console.log("✅ INSTAGRAM-001 passed: API-free profile, table messages, TR/EN/RU copy and QR remain intact.");
