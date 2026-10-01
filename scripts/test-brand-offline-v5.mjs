import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// A fresh profile visits only index online. Other routes must render the active
// logo offline, not merely match a CSS filename or reuse a previsited image.
export async function verifyBrandOffline(browser, base, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const rows = [];
  try {
    await page.goto(`${base}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => navigator.serviceWorker.controller && document.documentElement.dataset.offlineReady === 'true', null, { timeout: 30000 });
    await context.setOffline(true);
    for (const [route, width, kind] of [['menu.html', 390, 'primary'], ['discover.html', 390, 'compact'], ['discover.html', 1200, 'header']]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/${route}`, { waitUntil: 'load' });
      const image = await page.evaluate(async () => {
        const logo = document.querySelector('.brand-copy');
        const background = getComputedStyle(logo).backgroundImage;
        const url = background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
        if (!url) return { background, decoded: false };
        const probe = new Image();
        probe.src = url;
        try { await probe.decode(); return { background, decoded: probe.naturalWidth > 0 }; }
        catch { return { background, decoded: false }; }
      });
      assert.equal(image.decoded, true, `${route} ${width}: offline logo must decode`);
      assert.ok(image.background.includes(`robys-${kind}-smooth-v5.svg?v=20261001-smooth-v5`), `${route}: wrong active variant`);
      rows.push({ route, width, kind, ...image });
      await page.locator(route === 'menu.html' ? '.menu-page-brand' : 'header').first().screenshot({ path: resolve(output, `offline-${kind}.png`) });
    }
    const assets = ['brand-refinement-v5.css', ...['compact', 'header', 'primary'].map(kind => `src/brand/robys-${kind}-smooth-v5.svg`)];
    for (const asset of assets) {
      const result = await page.evaluate(async path => {
        const ok = async revision => {
          try { return (await fetch(`${path}?v=${revision}`)).ok; } catch { return false; }
        };
        return { current: await ok('20261001-smooth-v5'), wrong: await ok('not-the-cached-revision') };
      }, `${base}/${asset}`);
      assert.deepEqual(result, { current: true, wrong: false }, `${asset}: offline cache must match the exact revision`);
      rows.push({ asset, ...result });
    }
    console.log(`PASS BRAND-OFFLINE-V5: ${rows.length} route/asset cases from a fresh index-only visit.`);
  } finally {
    await writeFile(resolve(output, 'offline-results.json'), JSON.stringify(rows, null, 2) + '\n');
    await context.close();
  }
}
