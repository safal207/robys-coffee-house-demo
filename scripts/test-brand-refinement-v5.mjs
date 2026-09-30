import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const output = resolve(root, 'visual-results/brand-refinement-v5');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const rows = [];
const pageErrors = [];
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const name of ['index.html', 'menu.html', 'discover.html']) {
    for (const width of [320, 360, 390, 414, 420, 421, 480, 680, 768, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/${name}`, { waitUntil: 'domcontentloaded' });
      for (const language of ['tr', 'en', 'ru']) {
        await page.locator(`header .lang-button[data-lang="${language}"]`).click();
        await page.waitForFunction(lang => document.documentElement.lang === lang, language);
        const state = await page.evaluate(() => {
          const rect = element => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
          };
          const control = document.querySelector('header .language-switcher');
          const buttons = [...control.querySelectorAll('.lang-button')];
          const bounds = rect(control), targets = buttons.map(rect);
          const logo = document.querySelector('.brand-copy');
          return { language: document.documentElement.lang, bounds, targets,
            leftGap: targets[0].x - bounds.x, rightGap: bounds.right - targets.at(-1).right,
            active: buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.dataset.lang),
            logo: getComputedStyle(logo).backgroundImage };
        });
        const label = `${name} ${width} ${language}`;
        assert.equal(state.language, language, label);
        assert.deepEqual(state.active, [language], `${label}: active language`);
        assert.ok(state.leftGap >= 0 && state.leftGap <= 8 && state.rightGap >= 0 && state.rightGap <= 8, `${label}: empty space inside language border`);
        assert.ok(state.bounds.x >= 0 && state.bounds.right <= width + 1, `${label}: control exceeds viewport`);
        assert.ok(state.targets.every(target => target.width >= 44 && target.height >= 44), `${label}: touch targets`);
        assert.match(state.logo, /smooth-v5\.svg\?v=20261001-smooth-v5/, `${label}: active refined asset`);
        rows.push({ page: name, width, language, ...state });
        if (width === 390 && language === 'tr') {
          await page.locator('header').first().screenshot({ path: resolve(output, `${name.replace('.html', '')}-390.png`) });
        }
      }
    }
  }
  assert.deepEqual(pageErrors, [], 'Unexpected JavaScript errors on the three entry pages');
  console.log(`PASS BRAND-REFINEMENT-V5 browser: ${rows.length} language/viewport/page cases`);
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ rows, pageErrors }, null, 2) + '\n');
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
