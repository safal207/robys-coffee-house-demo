import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { captureDocumentRegion } from "./capture-document-region.mjs";

const out = process.env.CAPTURE_RESULTS_DIR || "visual-results/capture-evidence/reachability";
mkdirSync(out, { recursive: true });
const checks = [];
const record = (name, data = {}) => checks.push({ name, passed: true, ...data });
const browser = await chromium.launch({ headless: true });
const server = spawn("python3", ["-m", "http.server", "4199", "--bind", "127.0.0.1"], { stdio: "ignore" });
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch("http://127.0.0.1:4199/menu.html")).ok) break; } catch {}
    if (attempt >= 40) throw new Error("probe server not ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Independent fixture reproduces the old obstruction and exact crop recovery.
  // DPR 2 proves output dimensions remain CSS pixels, not device pixels.
  for (const height of [640, 900, 1000]) {
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 320, height }, deviceScaleFactor: dpr });
      await page.setContent('<style>html,body{margin:0}header{position:sticky;top:0;height:240px;background:rgb(255,0,0);z-index:3}main{height:1200px}section{margin:0 20px;width:280px;height:512px;background:rgb(0,255,0)}footer{height:600px}</style><header></header><main></main><section id="target"></section><footer></footer>');
      const target = page.locator("#target");
      const old = PNG.sync.read(await target.screenshot({ scale: "css" }));
      const image = PNG.sync.read(await captureDocumentRegion(page, target));
      assert.deepEqual([image.width, image.height], [280, 512]);
      assert.deepEqual([...image.data.subarray(0, 3)], [0, 255, 0]);
      assert.deepEqual([...image.data.subarray(image.data.length - 4, image.data.length - 1)], [0, 255, 0]);
      if (height < 1000) assert.deepEqual([...old.data.subarray(0, 3)], [255, 0, 0]);
      assert.equal(await page.locator("header").evaluate(el => getComputedStyle(el).position), "sticky");
      record(`fixture-${height}-dpr${dpr}`, { oldTopPixel: [...old.data.subarray(0, 3)], fixedTopPixel: [...image.data.subarray(0, 3)] });
      await page.close();
    }
  }
  for (const [width, height] of [[320, 900], [360, 640], [390, 1000], [768, 1024], [1366, 768], [1440, 1100]]) {
    for (const touch of [false, true]) {
      const label = `${width}-${touch ? "touch" : "fine"}`;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce", bypassCSP: true, serviceWorkers: "block", locale: "tr-TR" });
      await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4199/menu.html", { waitUntil: "domcontentloaded" });
      await page.locator(".full-menu-item").first().waitFor();
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;scroll-behavior:auto!important}html{scrollbar-width:none!important}' });
      const card = page.locator(".menu-share-card");
      await card.screenshot({ path: `${out}/${label}-locator.png`, animations: "disabled" });
      const before = await card.evaluate(el => {
        const b = el.getBoundingClientRect();
        const controls = document.querySelector(".menu-controls");
        const c = controls.getBoundingClientRect();
        return { cardTop: b.top, controlsBottom: c.bottom, controlsPosition: getComputedStyle(controls).position };
      });
      await captureDocumentRegion(page, card, `${out}/${label}-document.png`);
      // Actual viewport reachability: scroll each action to the center, then hit-test.
      // Never hide or reposition overlays, or activate external links/share actions.
      const actions = card.locator("button, a[href]");
      const count = await actions.count();
      assert.ok(count >= 2, `${label}: missing share actions`);
      for (let index = 0; index < count; index++) {
        const action = actions.nth(index);
        const hit = await action.evaluate(el => {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
          const b = el.getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          const top = document.elementFromPoint(x, y);
          return { text: el.textContent.trim(), hit: !!top && (el === top || el.contains(top)), x, y };
        });
        assert.ok(hit.hit, `${label}: action obstructed: ${JSON.stringify(hit)}`);
      }
      const headingHit = await card.locator("h2").evaluate(el => {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        const b = el.getBoundingClientRect();
        const top = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
        return !!top && (el === top || el.contains(top));
      });
      assert.ok(headingHit, `${label}: heading permanently obscured`);
      record(`product-${label}`, { before, actionCount: count, headingReachable: headingHit });
      await context.close();
    }
  }
  console.log(`CAPTURE-REGION: ${checks.length}/${checks.length} PASS`);
} finally {
  writeFileSync(`${out}/summary.json`, JSON.stringify({ scope: "capture layout and separately tested viewport reachability; not full app certification", passed: checks.length, expected: 18, complete: checks.length === 18, checks }, null, 2) + "\n");
  await browser.close();
  server.kill("SIGTERM");
}
