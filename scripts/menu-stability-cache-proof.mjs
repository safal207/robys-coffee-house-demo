import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Reproduce a returning client whose installed worker still ignores query strings.
// The update endpoint stays unavailable so the first menu navigation must work
// before the new worker can activate.
export async function verifyMenuStabilityLegacyWorker(browser) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const approvedCss = await readFile(resolve(root, "menu-stability.css"), "utf8");
  const legacyCss = '.full-menu-grid[data-ready]{display:grid}body{--robys-stale-menu-stability:yes}';
  const landingStyles = ["final-qa", "community-reel"];
  const cacheName = "robys-menu-stability-legacy-proof";
  const legacyWorker = `
const CACHE_NAME = ${JSON.stringify(cacheName)};
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(new URL("menu-stability.css?v=cls-20260622-1", self.location),
    new Response(${JSON.stringify(legacyCss)}, {headers:{"Content-Type":"text/css"}}));
  for (const name of ${JSON.stringify(landingStyles)}) {
    await cache.put(new URL(name + ".css?v=legacy", self.location),
      new Response(${JSON.stringify(legacyCss)}, {headers:{"Content-Type":"text/css"}}));
  }
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => event.respondWith((async () => {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(event.request, {ignoreSearch:true})) || fetch(event.request);
})()));`;
  const contentTypes = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".woff2": "font/woff2" };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (pathname === "/legacy-worker.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(legacyWorker);
      return;
    }
    if (pathname === "/legacy-setup.html") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Returning client cache proof</title>");
      return;
    }
    if (pathname === "/sw.js") {
      response.writeHead(503);
      response.end("The returning client's worker update has not arrived yet.");
      return;
    }
    const file = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream" });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/legacy-setup.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/legacy-worker.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const queryOnlyResponse = await page.evaluate(async () =>
      (await fetch("/menu-stability.css?v=new-content-revision")).text());
    assert.equal(queryOnlyResponse, legacyCss, "Control must prove the old worker defeats a query-only revision bump");

    for (const name of landingStyles) {
      const stale = await page.evaluate(async (asset) =>
        (await fetch(`/${asset}.css?v=new-content-revision`)).text(), name);
      assert.equal(stale, legacyCss, `Old worker must defeat a query-only bump for ${name}`);
    }
    const landingResponses = landingStyles.map((name) => page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/${name}-v2.css`));
    await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
    for (const [index, name] of landingStyles.entries()) {
      const response = await landingResponses[index];
      assert.equal(response.fromServiceWorker(), true, `${name} must pass through the unchanged legacy worker`);
      assert.equal(await response.text(), await readFile(resolve(root, `${name}.css`), "utf8"),
        `First landing navigation must receive approved ${name} bytes`);
    }

    const cssResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/menu-stability-v2.css");
    await page.goto(`${origin}/menu.html`, { waitUntil: "domcontentloaded" });
    const cssResponse = await cssResponsePromise;
    assert.equal(cssResponse.fromServiceWorker(), true, "The first menu navigation must still pass through the legacy worker");
    assert.equal(await cssResponse.text(), approvedCss, "First navigation under the legacy worker must receive the approved CSS bytes");
    await page.locator("#menu-root[data-ready='true']").waitFor({ state: "visible", timeout: 15000 });
    const rendered = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector("#menu-root")).columnCount,
      stale: getComputedStyle(document.body).getPropertyValue("--robys-stale-menu-stability"),
      controller: navigator.serviceWorker.controller.scriptURL
    }));
    assert.equal(rendered.columns, "2", "Approved desktop column packing must render on the first returning-client navigation");
    assert.equal(rendered.stale, "", "The stale stylesheet must not be applied");
    assert.equal(rendered.controller, `${origin}/legacy-worker.js`, "The proof must not depend on a replacement worker activating");
    console.log("✅ Menu stability cache proof passed: query-only control stays stale; the new pathname delivers approved bytes and two-column packing under the unchanged legacy worker.");
  } finally {
    try {
      await context?.close();
    } finally {
      server.closeAllConnections();
      await new Promise((accept) => server.close(accept));
    }
  }
}
