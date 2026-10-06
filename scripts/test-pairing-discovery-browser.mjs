import assert from "node:assert/strict";

// Independent copy fixtures: a Turkish fallback in EN/RU must fail this test.
const expectedCopy = {
  tr: { eyebrow: "LEZZETLE TANIŞ", kicker: "LEZZET YOLCULUĞU", label: "Seçtiğin eşleşme",
    why: "Neden birlikte güzel?", notes: "Tatta ne var?", choose: "Bu eşleşmeyi seç",
    mark: "Bunu tanıdım", close: "Kapat" },
  en: { eyebrow: "DISCOVER THE TASTE", kicker: "TASTE JOURNEY", label: "Your pairing",
    why: "Why does it work?", notes: "What will you taste?", choose: "Choose this pairing",
    mark: "I've met this taste", close: "Close" },
  ru: { eyebrow: "ЗНАКОМСТВО СО ВКУСОМ", kicker: "ПУТЕШЕСТВИЕ ВКУСА", label: "Твоя пара",
    why: "Почему они вместе?", notes: "Что почувствуешь?", choose: "Выбрать эту пару",
    mark: "Я познакомился со вкусом", close: "Закрыть" }
};
const pairings = [
  { id: "cool-lime-macaron", names: { tr: "Cool Lime + Makaron", en: "Cool Lime + Macaron", ru: "Cool Lime + макарон" },
    reasons: { tr: "Canlı lime ferahlığı önce gelir;", en: "Bright lime freshness arrives first;", ru: "Сначала приходит яркая свежесть лайма," },
    notes: { tr: ["Ferah", "Narenciye", "Fıstık"], en: ["Refreshing", "Citrus", "Pistachio"], ru: ["Свежий", "Цитрус", "Фисташка"] } },
  { id: "iced-san-sebastian", names: { tr: "Buzlu Latte + San Sebastian", en: "Iced Latte + San Sebastian Cheesecake", ru: "Айс-латте + чизкейк Сан-Себастьян" },
    reasons: { tr: "Serin latte damağı tazeler;", en: "The chilled latte refreshes the palate", ru: "Холодный латте освежает," },
    notes: { tr: ["Serin kahve", "Kremamsı", "Karamelize"], en: ["Chilled coffee", "Creamy", "Caramelized"], ru: ["Холодный кофе", "Сливочный", "Карамельный"] } }
];

// Poster containment is independent of the ordinary-product photo checks.
export async function verifyPairingGeometry(page, label) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const cards = await page.locator("#pairing-offers .pairing-poster-card").evaluateAll((nodes) => nodes.map((card) => {
    const media = card.querySelector(".full-menu-item-media");
    const bounds = media.getBoundingClientRect();
    const rect = (selector) => card.querySelector(selector).getBoundingClientRect();
    const title = rect(".pairing-poster-title");
    const price = rect(".pairing-poster-price");
    const kicker = rect(".pairing-poster-kicker");
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
    const inside = (r) => r.left >= bounds.left - 1 && r.right <= bounds.right + 1 &&
      r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
    const clippedText = [];
    for (const node of card.querySelectorAll(".pairing-poster-title span, .pairing-poster-kicker, .pairing-poster-bottom span")) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((r) => !inside(r))) clippedText.push(node.textContent);
    }
    const action = getComputedStyle(media, "::after");
    const arrow = { right: bounds.right - parseFloat(action.right), bottom: bounds.bottom - parseFloat(action.bottom) };
    arrow.left = arrow.right - parseFloat(action.width);
    arrow.top = arrow.bottom - parseFloat(action.height);
    const chipOverlap = [...card.querySelectorAll(".pairing-poster-bottom span")].some((n) => overlap(n.getBoundingClientRect(), arrow));
    return { id: card.dataset.pairing, width: bounds.width, height: bounds.height,
      titlePriceOverlap: overlap(title, price), titleKickerOverlap: overlap(title, kicker),
      clippedText, chipOverlap, priceContained: inside(price), kickerContained: inside(kicker) };
  }));
  assert.deepEqual(cards.map((card) => card.id).sort(), pairings.map((pair) => pair.id).sort(), `${label}: both pairing posters render`);
  const failures = cards.filter((card) => card.titlePriceOverlap || card.titleKickerOverlap || card.clippedText.length ||
    card.chipOverlap || !card.priceContained || !card.kickerContained);
  assert.deepEqual(failures, [], `${label}: pairing copy, price and action must remain readable and separate`);
  return { label, pairingCards: cards.length, pairingGeometryFailures: failures.length };
}

// An opened pairing must remain readable and operable when its text grows.
export async function verifyPairingDetailsGeometry(page, label) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.locator(".pairing-discovery-panel").evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    const rect = (node) => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
    const inside = (r) => r.left >= bounds.left - 1 && r.right <= bounds.right + 1 &&
      r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
    const title = rect(panel.querySelector("h3"));
    const price = rect(panel.querySelector(".pairing-discovery-price"));
    const notes = [...panel.querySelectorAll(".pairing-discovery-notes span")].map(rect);
    const actions = [...panel.querySelectorAll(".pairing-discovery-actions button")].map((button) => ({
      text: button.textContent, radius: parseFloat(getComputedStyle(button).borderRadius), ...rect(button)
    }));
    const clippedText = [];
    for (const node of panel.querySelectorAll("h3, p, strong, .pairing-discovery-notes span, button")) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((r) => !inside(r))) clippedText.push(node.textContent);
    }
    const joinedNotes = notes.some((a, index) => notes.slice(index + 1).some((b) => {
      const sameRow = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
      const sameColumn = Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5;
      return overlap(a, b) || (sameRow && Math.max(a.left, b.left) - Math.min(a.right, b.right) <= .5) ||
        (sameColumn && Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom) <= .5);
    }));
    return {
      id: panel.dataset.pairingId,
      titlePriceOverlap: overlap(title, price),
      headingContained: inside(title) && inside(price),
      notesSeparate: notes.length >= 2 && !joinedNotes && notes.every(inside),
      actions,
      actionsUsable: actions.length === 3 && actions.every((action) => inside(action) && action.height >= 43.5 && action.radius > 0),
      clippedText,
      horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1 ||
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
  assert.equal(geometry.titlePriceOverlap, false, `${label}: pairing title and price must not overlap`);
  assert.equal(geometry.headingContained, true, `${label}: pairing title and price stay inside the panel`);
  assert.equal(geometry.notesSeparate, true, `${label}: tasting notes have separate readable boxes`);
  assert.equal(geometry.actionsUsable, true, `${label}: all three styled actions stay inside the panel and reach 44px height`);
  assert.deepEqual(geometry.clippedText, [], `${label}: pairing details text must not be clipped`);
  assert.equal(geometry.horizontalOverflow, false, `${label}: pairing details must not cause horizontal overflow`);
  return { label, pairingDetailsGeometry: geometry };
}

// Keep the inline pairing route covered separately from ordinary product modals.
export async function verifyPairingDiscovery(context, baseUrl, check) {
  for (const language of ["tr", "en", "ru"]) {
    for (const fallback of [false, true]) {
      for (const pairing of pairings) {
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const label = `${pairing.id}/${language}/${fallback ? "fallback" : "native"}`;
        try {
          await page.goto(new URL("menu.html#pairing-offers", baseUrl).href, { waitUntil: "domcontentloaded" });
          await page.locator(`.lang-button[data-lang="${language}"]`).click();
          const opener = page.locator(`#pairing-offers .full-menu-item-media[data-discover-pairing="${pairing.id}"]`);
          await opener.waitFor({ state: "visible" });
          if (fallback) {
            await page.evaluate(() => {
              document.querySelectorAll("dialog").forEach((dialog) => {
                Object.defineProperty(dialog, "showModal", { configurable: true, value: undefined });
              });
            });
          }
          const initialCount = await page.locator("#menu-cart-count").textContent();
          await opener.focus();
          await page.keyboard.press("Enter");
          const panel = page.locator(".pairing-discovery-panel");
          await panel.waitFor({ state: "visible" });
          const name = await panel.locator("h3").textContent();
          const inline = {
            pairingId: await panel.getAttribute("data-pairing-id"),
            language: await page.locator("html").getAttribute("lang"),
            expanded: await opener.getAttribute("aria-expanded"),
            controls: await opener.getAttribute("aria-controls"),
            panelId: await panel.getAttribute("id"),
            openModals: await page.locator(".menu-dialog[open]").count(),
            placement: await panel.evaluate((node) => {
              const cards = [...node.parentElement.querySelectorAll(".pairing-poster-card")];
              const wide = document.documentElement.clientWidth >= 901;
              return {
                wide,
                predecessor: node.previousElementSibling?.dataset.pairing ?? null,
                expectedPredecessor: wide ? cards.at(-1)?.dataset.pairing : node.dataset.pairingId,
                bothCardsBefore: cards.every((card) => Boolean(card.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))
              };
            }),
            posterPrice: (await opener.locator(".pairing-poster-price").textContent())?.trim(),
            cardPrice: await opener.evaluate((node) => node.closest(".pairing-poster-card").querySelector(".full-menu-price").textContent.trim()),
            price: (await panel.locator(".pairing-discovery-price").textContent())?.trim()
          };
          const geometry = await verifyPairingDetailsGeometry(page, label);
          const copy = {
            eyebrow: await panel.locator(".pairing-discovery-eyebrow").textContent(),
            kicker: await opener.locator(".pairing-poster-kicker").textContent(),
            label: await panel.locator(".pairing-discovery-label").textContent(),
            why: await panel.locator(".pairing-discovery-story > div").nth(0).locator("strong").textContent(),
            notes: await panel.locator(".pairing-discovery-story > div").nth(1).locator("strong").textContent(),
            choose: await panel.locator(".pairing-discovery-choose").textContent(),
            mark: await panel.locator(".pairing-discovery-mark").textContent(),
            close: await panel.locator(".pairing-discovery-close").textContent()
          };
          const reason = await panel.locator(".pairing-discovery-story p").textContent();
          const notes = await panel.locator(".pairing-discovery-notes span").allTextContents();
          check("PAIRING-DISCOVERY-LOCALIZATION-001",
            Object.entries(expectedCopy[language]).every(([key, value]) => copy[key] === value) &&
              reason.startsWith(pairing.reasons[language]) && JSON.stringify(notes) === JSON.stringify(pairing.notes[language]),
            `${label}: localized inline headings, explanation, tasting notes and actions`, { copy, reason, notes });
          await panel.locator(".pairing-discovery-choose").click();
          const dialog = page.locator("#menu-product-dialog[open]");
          await dialog.waitFor({ state: "visible" });
          const product = {
            name: await page.locator("#menu-product-title").textContent(),
            price: (await page.locator("#menu-product-price").textContent())?.trim(),
            fallback: await dialog.evaluate((node) => node.classList.contains("menu-dialog--fallback")),
            draftNote: await page.locator("#menu-product-draft-note").textContent()
          };
          await dialog.locator('[data-menu-dialog-close="product"]').click();
          await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
          await panel.locator(".pairing-discovery-close").click();
          await panel.waitFor({ state: "detached" });
          const closed = {
            expanded: await opener.getAttribute("aria-expanded"),
            controls: await opener.getAttribute("aria-controls"),
            focusReturned: await opener.evaluate((node) => document.activeElement === node),
            count: await page.locator("#menu-cart-count").textContent()
          };
          check(
            "PAIRING-DISCOVERY-BROWSER-001",
            inline.language === language && inline.pairingId === pairing.id && inline.expanded === "true" &&
              Boolean(inline.panelId) && inline.controls === inline.panelId && inline.openModals === 0 &&
              inline.placement.predecessor === inline.placement.expectedPredecessor &&
              (!inline.placement.wide || inline.placement.bothCardsBefore) &&
              Boolean(inline.price) && inline.price === inline.cardPrice && inline.price === inline.posterPrice &&
              product.price === inline.price &&
              name === pairing.names[language] && product.name === pairing.names[language] &&
              product.fallback === fallback && Boolean(product.draftNote?.trim()) &&
              closed.expanded === "false" && closed.controls === null && closed.focusReturned &&
              closed.count === initialCount && errors.length === 0,
            `${label}: keyboard opens inline discovery, choose opens the matching draft, close restores focus without ordering`,
            { inline, geometry, product, closed, errors }
          );
        } catch (error) {
          check("PAIRING-DISCOVERY-BROWSER-001", false, `${label}: pairing discovery failed`, {
            error: String(error?.stack ?? error), errors
          });
        } finally {
          await page.close().catch(() => {});
        }
      }
    }
  }
}
