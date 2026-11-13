import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pages = ["index.html", "menu.html"];
const placeId = "ChIJpdkfSnH13BQRAEJUSGpYxNg";
const reviewLinks = [
  "https://search.google.com/local/reviews?placeid=" + placeId,
  "https://search.google.com/local/writereview?placeid=" + placeId
];

for (const page of pages) {
  test(page + ": Reyhan links, languages and location", () => {
    const html = readFileSync(page, "utf8");
    for (const url of reviewLinks) {
      const at = html.indexOf('href="' + url + '"');
      assert.ok(at > 0, page + " missing review link " + url);
      const open = html.lastIndexOf("<a ", at);
      const close = html.indexOf("</a>", at);
      assert.ok(close > open, page + " malformed review link");
      const anchor = html.slice(open, close);
      for (const attr of ['target="_blank"', 'rel="noopener noreferrer"', "data-tr=", "data-en=", "data-ru=", "data-localized"]) {
        assert.ok(anchor.includes(attr), page + " missing " + attr + " in review link");
      }
    }
    assert.ok(!/Cadılar Bayramı havası|A little Halloween magic|Немного магии Хэллоуина/i.test(html));
    assert.ok(html.includes("destination_place_id=" + placeId), page + " has no exact place route");
  });
}

test("homepage: photo menu is the first and primary hero action", () => {
  const html = readFileSync("index.html", "utf8");
  const start = html.indexOf('<div class="hero-actions">');
  assert.ok(start > 0);
  const hero = html.slice(start + '<div class="hero-actions">'.length, html.indexOf("</div>", start));
  assert.ok(hero.startsWith('<a class="button button-primary" href="menu.html" data-i18n="viewMenu">'));
  assert.ok(hero.includes('href="smart-choice/" data-smart-choice-entry'));
  assert.ok(html.includes("maps?q=Roby%27s%20Coffee%20House"));
});
