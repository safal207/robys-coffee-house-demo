import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/menu-actions-loader.js", import.meta.url), "utf8");
const { createMenuActionsLoader } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const messages = {
  tr: "Paylaşım açılamadı. Yeniden denemek için Menüyü paylaş düğmesine dokunun.",
  en: "Sharing could not load. Tap Share menu to try again.",
  ru: "Не удалось открыть отправку меню. Нажми «Поделиться меню» ещё раз."
};
const unhandled = [];
const recordUnhandled = error => unhandled.push(error);
process.on("unhandledRejection", recordUnhandled);

for (const language of ["tr", "en", "ru"]) {
  const requests = [], shares = [], statuses = [];
  const actions = { shareMenu: async (...args) => shares.push(args), completeNativeShare() {}, track() {} };
  const loader = createMenuActionsLoader({
    getLanguage: () => language, setStatus: text => statuses.push(text),
    loadModule: async attempt => {
      requests.push(attempt);
      if (attempt < 2) throw new Error("injected transient module failure");
      return actions;
    }
  });
  await loader.share();
  assert.equal(statuses.at(-1), messages[language], "First fault must provide localized live feedback");
  await loader.share();
  assert.equal(statuses.at(-1), messages[language], "A second fault must remain recoverable");
  await loader.share(true);
  assert.deepEqual(requests, [0, 1, 2], "Every explicit retry after failure must request a fresh module attempt");
  assert.equal(statuses.at(-1), "", "Recovery must clear the stale failure message");
  assert.deepEqual(shares, [[null, { skipNative: true }]], "Only the recovered action runs, preserving native-skip semantics");
  await loader.share();
  assert.equal(requests.length, 3, "Healthy subsequent actions reuse the loaded module");
  assert.equal(shares.length, 2);
}

{
  const requests = [], statuses = [];
  let resolveModule;
  const loader = createMenuActionsLoader({
    getLanguage: () => "en", setStatus: text => statuses.push(text),
    loadModule: attempt => { requests.push(attempt); return new Promise(resolve => { resolveModule = resolve; }); }
  });
  const first = loader.load(), second = loader.load();
  assert.equal(first, second, "Concurrent loads share one request");
  await Promise.resolve();
  resolveModule({ shareMenu() {}, completeNativeShare() {}, track() {} });
  await Promise.all([first, second]);
  assert.deepEqual(requests, [0]);
  assert.deepEqual(statuses, [], "Background loading does not announce a user action");
}

{
  let language = "en";
  const statuses = [], attempts = [];
  let rejectModule;
  const loader = createMenuActionsLoader({
    getLanguage: () => language, setStatus: text => statuses.push(text),
    loadModule: attempt => { attempts.push(attempt); return new Promise((_, reject) => { rejectModule = reject; }); }
  });
  const share = loader.share();
  await Promise.resolve(); language = "ru"; rejectModule(new Error("offline"));
  await share;
  assert.equal(statuses.at(-1), messages.ru, "Failure uses the language current when feedback is shown");
}

{
  const statuses = [], requests = [];
  const loader = createMenuActionsLoader({
    getLanguage: () => "en", setStatus: text => statuses.push(text),
    loadModule: async attempt => { requests.push(attempt); throw new Error("offline"); }
  });
  await loader.prefetch();
  await loader.track("instagram_booking_click");
  assert.deepEqual(statuses, [], "Failed background loading and analytics do not show share errors");
  await loader.completeNativeShare();
  assert.equal(statuses.at(-1), "Share options opened.", "A successful native share keeps success feedback when optional code fails");
  assert.deepEqual(requests, [0, 1, 2], "Background failure cannot poison the next explicit action");
}

{
  const statuses = [];
  const loader = createMenuActionsLoader({
    getLanguage: () => "en", setStatus: text => statuses.push(text),
    loadModule: async () => ({
      shareMenu() {},
      async completeNativeShare() { throw new Error("injected completion failure"); },
      async track() { throw new Error("injected analytics failure"); }
    })
  });
  await loader.completeNativeShare();
  await loader.track("instagram_booking_click");
  assert.deepEqual(statuses, ["Share options opened."], "Optional completion/analytics failures preserve native success and remain handled");
}

await new Promise(resolve => setImmediate(resolve));
process.removeListener("unhandledRejection", recordUnhandled);
assert.deepEqual(unhandled, [], "Handled optional-module failures must not escape as unhandled rejections");
console.log("Menu share loader: PASS (TR/EN/RU, two failures then recovery, healthy cache, concurrent loading, current language, native success, safe prefetch/analytics)");
