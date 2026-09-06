import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { captureDocumentRegion } from "./capture-document-region.mjs";
import { captureAlignedShare } from "./capture-aligned-share.mjs";

const out = process.env.RASTER_RESULTS_DIR || ".artifacts/share-raster";
mkdirSync(out, { recursive: true });
const config = JSON.parse(readFileSync("qa/visual-regression.json", "utf8"));
const limit = config.captures.find(c => c.id === "menu-share").maxDiffPixelRatio;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 400, height: 600 }, deviceScaleFactor: 1 });
const results = [];
const compare = (left, right) => {
  const a = PNG.sync.read(readFileSync(left)), b = PNG.sync.read(readFileSync(right));
  if (a.width !== b.width || a.height !== b.height) return 1;
  return pixelmatch(a.data, b.data, null, a.width, a.height,
    { threshold: config.pixelThreshold }) / (a.width * a.height);
};
const setup = async phase => {
  await page.setContent(`<style>html,body{margin:0}main{height:${1000 + phase}px}
    .menu-share-card{margin:0 20px;width:280px;height:300px;background:#fffaf3;border:1px solid #eee;border-radius:22px}
    h2,p,button{margin:20px;font-family:Arial}h2{font-size:30px;line-height:1}p{font-size:16px}
    button{width:230px;height:56px;color:white;background:#e21b23;border:0;border-radius:30px}</style>
    <main></main><section class="menu-share-card"><h2>Share this menu with friends</h2><p>Open the menu or our social pages.</p><button>Share menu</button></section>`);
};
try {
  const card = page.locator(".menu-share-card");
  let rawFailures = 0;
  for (const phase of [0, .03125, .1875, .328125, .4375, .75, .765625, .8125]) {
    await setup(phase);
    await captureDocumentRegion(page, card, `${out}/raw-${phase}.png`);
    const alignment = await captureAlignedShare(page, card, `${out}/aligned-${phase}.png`);
    const raw = compare(`${out}/raw-0.png`, `${out}/raw-${phase}.png`);
    const aligned = compare(`${out}/aligned-0.png`, `${out}/aligned-${phase}.png`);
    rawFailures += Number(raw > limit);
    assert.equal(aligned, 0, `origin ${phase} changed component pixels`);
    results.push({ phase, raw, aligned, alignment });
  }
  assert.ok(rawFailures > 0, "fixture must reproduce the original false positive");
  for (const [name, change] of [
    ["text", () => document.querySelector("h2").textContent = "A different menu title"],
    ["color", () => document.querySelector("button").style.background = "blue"],
    ["button-position", () => document.querySelector("button").style.marginLeft = "32px"],
    ["width", () => document.querySelector("section").style.width = "270px"]
  ]) {
    await setup(.4375);
    await page.evaluate(change);
    await captureAlignedShare(page, card, `${out}/${name}.png`);
    const diff = compare(`${out}/aligned-0.png`, `${out}/${name}.png`);
    assert.ok(diff > limit, `${name} was hidden by origin alignment`);
    results.push({ negative: name, diff, rejected: true });
  }
  await setup(.4375);
  const initial = await card.evaluate(el => ({ html: el.outerHTML, box: el.getBoundingClientRect().toJSON() }));
  const brokenPage = { evaluate: page.evaluate.bind(page), screenshot: async () => { throw new Error("injected capture failure"); } };
  await assert.rejects(captureAlignedShare(brokenPage, card), /injected capture failure/);
  await page.evaluate(() => scrollTo(0, 0));
  assert.deepEqual(await card.evaluate(el => ({ html: el.outerHTML, box: el.getBoundingClientRect().toJSON() })), initial);
  results.push({ negative: "capture-error", restored: true });
  console.log(`RASTER-ORIGIN: ${results.length}/${results.length} PASS; ${rawFailures} original failures reproduced; thresholds unchanged`);
} finally {
  writeFileSync(`${out}/summary.json`, JSON.stringify({ expected: 13, complete: results.length === 13, results }, null, 2) + "\n");
  await browser.close();
}
