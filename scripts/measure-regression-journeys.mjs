import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { captureIdentity, sameIdentity } from './regression-pipeline-lib.mjs';

// The candidate harness is deliberately outside ROBYS_REGRESSION_ROOT so that
// exact base/head bytes are exercised by the same measuring implementation.
const harnessRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = resolve(process.env.ROBYS_REGRESSION_ROOT ?? harnessRoot);
const out = resolve(process.env.ROBYS_REGRESSION_OUTPUT ?? '.artifacts/causal-regression/metrics');
const configBytes = readFileSync(join(harnessRoot, 'qa/regression-journeys.json'));
const config = JSON.parse(configBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const engine = process.env.ROBYS_REGRESSION_BROWSER ?? 'chromium';
const profile = process.env.ROBYS_REGRESSION_PROFILE ?? (engine === 'chromium' ? 'throttled' : 'native');
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), 'Unsupported browser');
assert.ok(['native', 'throttled'].includes(profile), 'Unsupported profile');
assert.ok(profile !== 'throttled' || engine === 'chromium', 'CDP throttling is Chromium only');
const cycles = Number(process.env.ROBYS_REGRESSION_CYCLES ?? config.cycles);
assert.ok(Number.isInteger(cycles) && cycles > 0 && cycles <= 10, 'Invalid cycle count');
mkdirSync(out, { recursive: true });
const initial = captureIdentity(root);
const expectedHead = process.env.ROBYS_SOURCE_REVISION ?? initial.head;
assert.equal(initial.head, expectedHead, 'Measurement root does not match the expected immutable source');
const { menuCategories } = await import(pathToFileURL(join(root, 'menu-catalog.js')));
const hot = menuCategories.find(category => category.id === 'hot-coffee');
const items = category => category.items ?? category.groups.flatMap(group => group.items);
const espresso = items(hot).find(item => item.id === 'espresso' || item.name.en === 'Espresso');
assert.ok(espresso?.price > 0, 'Independent menu catalog oracle is missing Espresso');
const price = espresso.price;
const certificate = mkdtempSync(join(tmpdir(), 'robys-regression-'));
execFileSync('openssl', ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-keyout', join(certificate, 'key'), '-out', join(certificate, 'cert'), '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' });
const publicKey = execFileSync('openssl', ['x509', '-in', join(certificate, 'cert'), '-pubkey', '-noout']);
const pin = digest(execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: publicKey }));
const spki = Buffer.from(pin, 'hex').toString('base64');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const server = createServer({ key: readFileSync(join(certificate, 'key')), cert: readFileSync(join(certificate, 'cert')) }, (req, res) => {
  try {
    let file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'https://localhost').pathname));
    if (!file.startsWith(root + sep)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=600' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
let browser;
const report = { protocol: 1, kind: 'journey-run', label: process.env.ROBYS_REGRESSION_LABEL ?? 'candidate',
  identity: { expectedHead, initial, final: null, status: 'HOLD' },
  harnessDigest: digest(Buffer.concat(['scripts/measure-regression-journeys.mjs', 'scripts/regression-pipeline-lib.mjs'].map(file => readFileSync(join(harnessRoot, file))))),
  configDigest: digest(configBytes),
  environment: { browser: engine, browserVersion: 'unavailable', profile, widths: config.widths, cycles,
    cpu: profile === 'throttled' ? 4 : 1, latencyMs: profile === 'throttled' ? 150 : 0,
    downloadMbps: profile === 'throttled' ? 1.6 : null, serviceWorkers: 'blocked',
    cache: 'fresh context per width/cycle; warmed within sequence', motion: 'no-preference' },
  metric: config.metric, startedAt: new Date().toISOString(), journeys: [], applicationErrors: [], externalErrors: [], status: 'FAIL',
  limitations: ['Local lab action-to-state metric, not field INP or full animation-settled duration.',
    'Native OS share sheet, actual sound quality, real-phone touch and field network remain outside this harness.',
    'Two widths and three cycles give bounded regression evidence, not universal device coverage.'] };

function installProbe() {
  const key = '__robys_regression_probe';
  const load = () => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  let active = load(), last = null, checking = false;
  const decoded = new WeakMap(), decoding = new WeakMap(), longTasks = [];
  try { new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime + performance.timeOrigin, duration: entry.duration })))).observe({ type: 'longtask', buffered: true }); } catch { /* Unsupported browsers report no observer support explicitly. */ }
  const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
  function matches(expectation) {
    if (expectation.path && location.pathname !== expectation.path) return false;
    if (expectation.lang && document.documentElement.lang !== expectation.lang) return false;
    for (const [name, value] of Object.entries(expectation.storage ?? {})) if (localStorage.getItem(name) !== value) return false;
    return (expectation.conditions ?? []).every(condition => {
      const nodes = [...document.querySelectorAll(condition.selector)], node = nodes[0];
      if (condition.count !== undefined && nodes.length !== condition.count) return false;
      if (condition.minCount !== undefined && nodes.length < condition.minCount) return false;
      if (condition.visible && !visible(node)) return false;
      if (condition.hidden && visible(node)) return false;
      if (condition.text !== undefined && node?.textContent.trim() !== condition.text) return false;
      if (condition.includes !== undefined && !node?.textContent.includes(condition.includes)) return false;
      if (condition.value !== undefined && node?.value !== condition.value) return false;
      if (condition.money !== undefined && Number(node?.textContent.replace(/[^\d]/g, '')) !== condition.money) return false;
      if (condition.attribute && node?.getAttribute(condition.attribute[0]) !== condition.attribute[1]) return false;
      if (condition.enabled && (!node || node.disabled)) return false;
      if (condition.focused && document.activeElement !== node) return false;
      if (condition.decoded) {
        if (!(node instanceof HTMLImageElement) || !node.complete || !node.naturalWidth) return false;
        const src = node.currentSrc;
        if (decoded.get(node) !== src) {
          if (decoding.get(node) !== src) { decoding.set(node, src); node.decode().then(() => {
            if (node.currentSrc === src) decoded.set(node, src);
          }).catch(() => {}); }
          return false;
        }
      }
      return true;
    });
  }
  window.__regressionArm = pending => { active = pending; last = null; checking = false; sessionStorage.setItem(key, JSON.stringify(active)); };
  for (const type of ['click', 'input', 'change', 'keydown']) document.addEventListener(type, event => {
    if (!active || active.start !== null || active.result || !event.isTrusted || !active.events.includes(type)) return;
    if (active.target && !event.target.closest(active.target)) return;
    active.start = performance.timeOrigin + performance.now();
    sessionStorage.setItem(key, JSON.stringify(active));
  }, true);
  function tick(now) {
    if (active?.start !== null && active?.start !== undefined && !active.result) {
      if (last !== null) active.frameGaps.push(now - last);
      last = now;
      if (!checking && matches(active.expected)) {
        checking = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!active || active.result) return;
          if (!matches(active.expected)) { checking = false; return; }
          const end = performance.timeOrigin + performance.now();
          active.result = { durationMs: end - active.start, frameGaps: active.frameGaps,
            longTasks: longTasks.filter(task => task.start >= active.start && task.start <= end),
            longTaskObserverSupported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
            resources: performance.getEntriesByType('resource').filter(entry =>
              entry.startTime + performance.timeOrigin <= end && entry.responseEnd + performance.timeOrigin >= active.start)
              .filter(entry => new URL(entry.name).origin === location.origin).slice(0, 40)
              .map(entry => ({ path: new URL(entry.name).pathname, initiatorType: entry.initiatorType,
                durationMs: entry.duration, transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize })),
            assertions: { expectedState: true } };
          sessionStorage.setItem(key, JSON.stringify(active));
        }));
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

try {
  browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true,
    ...(engine === 'chromium' ? { args: [`--ignore-certificate-errors-spki-list=${spki}`] } : {}) });
  report.environment.browserVersion = browser.version();
  for (const width of config.widths) for (let cycle = 0; cycle < cycles; cycle++) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'no-preference', ...(engine !== 'chromium' ? { ignoreHTTPSErrors: true } : {}) });
    await context.addInitScript(installProbe);
    await context.addInitScript(() => { if (!localStorage.getItem('robys-language')) localStorage.setItem('robys-language', 'en'); });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    if (profile === 'throttled') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: .75 * 1024 * 1024 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const url = message.location().url;
      if (url && /^https?:/.test(url) && new URL(url).origin !== origin) {
        report.externalErrors.push({ width, cycle, origin: new URL(url).origin, message: message.text() });
      } else errors.push(`console.error: ${message.text()}`);
    });
    const ready = async mode => { await page.locator(mode === 'feed' ? '#feed[data-ready="true"]' : '#menu-root[data-ready="true"]').waitFor(); };
    const conditions = (...entries) => ({ conditions: entries });
    const click = selector => () => page.locator(selector).first().click();
    async function measure(id, target, expected, action, events = ['click']) {
      const priorErrors = errors.length;
      const pending = { id, target, expected, events, start: null, frameGaps: [], result: null };
      try {
        await page.evaluate(pending => window.__regressionArm(pending), pending);
        await action();
        await page.waitForFunction(id => { try { const value = JSON.parse(sessionStorage.getItem('__robys_regression_probe')); return value?.id === id && !!value.result; } catch { return false; } }, id);
        const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__robys_regression_probe')).result);
        const actionErrors = errors.slice(priorErrors);
        const status = actionErrors.length ? 'FAIL' : 'PASS';
        const budget = config.journeys.find(journey => journey.id === id);
        report.journeys.push({ id, width, cycle, ...result, errors: actionErrors, status, withinBudget: result.durationMs <= budget.maxMs });
        console.log(`${engine}/${profile}/${width}/${cycle} ${id}: ${status} ${result.durationMs.toFixed(1)}ms`);
      } catch (error) {
        const diagnostic = await page.evaluate(expected => ({ path: location.pathname,
          language: document.documentElement.lang,
          probe: JSON.parse(sessionStorage.getItem('__robys_regression_probe') ?? 'null'),
          observed: expected.conditions?.map(condition => ({ selector: condition.selector, count: document.querySelectorAll(condition.selector).length,
            text: document.querySelector(condition.selector)?.textContent.trim().slice(0,100),
            value: document.querySelector(condition.selector)?.value })) }), expected).catch(() => null);
        report.journeys.push({ id, width, cycle, status: 'FAIL', durationMs: null, frameGaps: [], longTasks: [], errors: [...errors.slice(priorErrors), String(error.message)], assertions: { expectedState: false }, diagnostic });
        console.error(JSON.stringify({ id, observed: diagnostic?.observed }));
        throw error;
      } finally {
        await page.evaluate(() => { sessionStorage.removeItem('__robys_regression_probe'); window.__regressionArm(null); }).catch(() => {});
      }
    }
    try {
      await page.goto(`${origin}/index.html?entry=off`, { waitUntil: 'domcontentloaded' });
      await measure('home-menu', '.hero-actions a[href="menu.html"]', { path: '/menu.html', ...conditions({ selector: '#menu-root[data-ready="true"]', visible: true }, { selector: '[data-product-id="hot-coffee:espresso"]', visible: true }) }, click('.hero-actions a[href="menu.html"]'));
      const allCount = await page.locator('#menu-root [data-product-id]').count();
      await measure('list-search', '#menu-search', conditions({ selector: '#menu-empty', visible: true }, { selector: '#menu-root [data-product-id]', count: 0 }), () => page.locator('#menu-search').fill('missing-zx984'), ['input']);
      await measure('list-search-clear', '#menu-search', conditions({ selector: '#menu-root [data-product-id]', count: allCount }, { selector: '#menu-empty', hidden: true }), () => page.locator('#menu-search').fill(''), ['input']);
      const category = '#menu-category-nav [data-category="hot-coffee"]';
      await measure('list-category', category, conditions({ selector: category, attribute: ['aria-pressed', 'true'] }, { selector: '#menu-root [data-product-id]', count: items(hot).length }), click(category));
      await measure('list-language', '[data-lang="ru"]', { lang: 'ru', storage: { 'robys-language': 'ru' }, ...conditions({ selector: '[data-product-id="hot-coffee:espresso"]', includes: espresso.name.ru }) }, click('[data-lang="ru"]'));
      const product = '[data-product-id="hot-coffee:espresso"] .full-menu-item-media';
      await measure('list-product-open', product, conditions({ selector: '#menu-product-dialog[open]', visible: true, includes: espresso.name.ru }, { selector: '#menu-add-to-cart', enabled: true }), click(product));
      await measure('list-product-add', '#menu-add-to-cart', conditions({ selector: '#menu-cart-count', text: '1' }, { selector: '#menu-cart-total', money: price }), click('#menu-add-to-cart'));
      // Adding may open the cart. Close any open dialog before timing its opener.
      while (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
      await measure('cart-open', '#menu-cart-trigger', conditions({ selector: '#menu-cart-dialog[open]', visible: true }, { selector: '.menu-cart-line', count: 1 }, { selector: '#menu-cart-dialog-total', money: price }), click('#menu-cart-trigger'));
      await measure('cart-quantity', '.menu-cart-step', conditions({ selector: '#menu-cart-count', text: '2' }, { selector: '#menu-cart-dialog-total', money: price * 2 }), () => page.locator('.menu-cart-step').nth(1).click());
      await measure('cart-checkout', '#menu-checkout-trigger', conditions({ selector: '.order-checkout-dialog[open]', visible: true }, { selector: '.order-ticket-qr', count: 1, visible: true }, { selector: '.order-ticket-total', money: price * 2 }), click('#menu-checkout-trigger'));
      await page.keyboard.press('Escape');
      await measure('cart-remove', '.menu-cart-remove', conditions({ selector: '#menu-cart-count', text: '0' }, { selector: '#menu-cart-total', money: 0 }, { selector: '.menu-cart-line', count: 0 }), click('.menu-cart-remove'));
      while (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
      await measure('list-combos', '#menu-combos-trigger', conditions({ selector: '#menu-combos:not([hidden])', visible: true }, { selector: '#menu-combos-content button', minCount: 1 }), click('#menu-combos-trigger'));
      await measure('list-family', '#menu-family-trigger', conditions({ selector: '#menu-family:not([hidden])', visible: true }, { selector: '#menu-family-content img', minCount: 1 }), click('#menu-family-trigger'));
      // A fresh explicit list removes category/product deep links before switch.
      await page.goto(`${origin}/menu.html?view=list&lang=en`); await ready('list');
      await measure('list-to-feed', '.menu-view-switch [data-menu-view="feed"]', { path: '/menu-feed.html', ...conditions({ selector: '#feed[data-ready="true"]', visible: true }, { selector: '.feed-card', minCount: 1 }) }, click('.menu-view-switch [data-menu-view="feed"]'));
      await measure('feed-language', '[data-lang="ru"]', { lang: 'ru', storage: { 'robys-language': 'ru' }, ...conditions({ selector: '[data-product-id="hot-coffee:espresso"] h3', text: espresso.name.ru }) }, click('[data-lang="ru"]'));
      await page.locator('#feed-discover-open').click(); await page.locator('#feed-discover[open]').waitFor();
      await page.locator('#feed-categories [data-category="all"]').click();
      await measure('feed-search', '#feed-search', conditions({ selector: '#feed .feed-card', count: 1 }, { selector: '#feed [data-product-id="hot-coffee:cortado"]', count: 1 }), () => page.locator('#feed-search').fill('Cortado'), ['input']);
      await page.locator('#feed-search-clear').click();
      await page.locator('#feed-categories [data-category="hot-coffee"]').click();
      await page.locator('#feed-discover-done').click();
      await measure('feed-like', '.feed-like', conditions({ selector: '.feed-like[aria-pressed="true"]', count: 1 }, { selector: '#feed-liked-count', text: '1' }), click('.feed-like'));
      const sharePath = '/share/ru/hot-coffee--espresso.html';
      // Native OS sheets are covered as an explicit gap; measure the real local fallback.
      await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
      await measure('feed-share', '.feed-share', conditions({ selector: '#feed-share[open]', visible: true }, { selector: '#feed-share-url', value: `${origin}${sharePath}` }), click('.feed-share'));
      await page.locator('#feed-share-close').click();
      await measure('feed-reels', '#feed-reels-open', conditions({ selector: '#feed-viewer[open][data-mode="reels"][data-state="ready"]', visible: true }, { selector: '#feed-viewer-image', decoded: true }), click('#feed-reels-open'));
      await page.locator('#feed-viewer-close').click();
      await measure('feed-stories', '#feed-stories .feed-story', conditions({ selector: '#feed-viewer[open][data-mode="stories"][data-state="ready"]', visible: true }, { selector: '#feed-viewer-image', decoded: true }), click('#feed-stories .feed-story'));
      await page.locator('#feed-viewer-close').click();
      await measure('sound-toggle', '.menu-sound-toggle', { storage: { 'robys-menu-sound': 'on' }, ...conditions({ selector: '.menu-sound-toggle', attribute: ['aria-pressed', 'true'] }) }, click('.menu-sound-toggle'));
      await measure('feed-to-list', '.feed-view-switch [data-menu-view="list"]', { path: '/menu.html', lang: 'ru', ...conditions({ selector: '#menu-root[data-ready="true"]', visible: true }, { selector: '#menu-cart-count', text: '0' }, { selector: '#menu-search', value: '' }) }, click('.feed-view-switch [data-menu-view="list"]'));
    } catch (error) {
      console.error(`Stopped dependent menu sequence ${width}/${cycle}: ${error.message.split('\n')[0]}`);
    }
    // The recommendation flow has independent preconditions and still runs if
    // an earlier menu action failed. Its missing predecessor cannot fake PASS.
    try {
      await page.goto(`${origin}/smart-choice/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#smart-choice-app[aria-busy="false"]').waitFor();
      await measure('smart-start', '#smart-choice-app .qb-help', conditions({ selector: '#question-intent', visible: true }), click('#smart-choice-app .qb-help'));
      await measure('smart-answer', '.option-grid .option-button', conditions({ selector: '.option-grid .option-button[aria-pressed="true"]', count: 1 }, { selector: '.actions .primary-button', enabled: true }), click('.option-grid .option-button'));
      await measure('smart-next', '.actions .primary-button', conditions({ selector: '#question-temperature', visible: true }, { selector: '#question-intent', count: 0 }), click('.actions .primary-button'));
    } catch (error) {
      console.error(`Stopped dependent recommendation sequence ${width}/${cycle}: ${error.message.split('\n')[0]}`);
    } finally {
      // Preserve missing coverage as NOT_RUN instead of silently shrinking scope.
      for (const journey of config.journeys) if (!report.journeys.some(row => row.id === journey.id && row.width === width && row.cycle === cycle)) {
        report.journeys.push({ id: journey.id, width, cycle, status: 'NOT_RUN', durationMs: null, frameGaps: [], longTasks: [], errors: ['Precondition sequence failed; action did not run'], assertions: { expectedState: false } });
      }
      report.applicationErrors.push(...errors.map(message => ({ width, cycle, message })));
      await context.close();
      writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
} catch (error) {
  report.applicationErrors.push({ phase: 'browser-or-context-startup', message: error.message });
} finally {
  if (browser) await browser.close().catch(error => report.applicationErrors.push({ phase: 'browser-shutdown', message: error.message }));
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
  report.identity.final = captureIdentity(root);
  report.identity.status = sameIdentity(initial, report.identity.final) ? 'PASS' : 'HOLD';
  report.finishedAt = new Date().toISOString();
  report.status = report.identity.status === 'PASS' && !report.applicationErrors.length && report.journeys.length === config.journeys.length * config.widths.length * config.cycles && report.journeys.every(row => row.status === 'PASS' && row.withinBudget) ? 'PASS' : 'FAIL';
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const summaries = config.journeys.map(journey => {
    const rows = report.journeys.filter(row => row.id === journey.id), values = rows.map(row => row.durationMs).filter(Number.isFinite).sort((a,b) => a-b);
    return `| ${journey.id} | ${rows.filter(row=>row.status==='PASS').length}/${rows.length} | ${values.length ? values[Math.ceil(values.length/2)-1].toFixed(1) : '—'} | ${values.length ? Math.max(...values).toFixed(1) : '—'} | ${rows.every(row=>row.status==='PASS'&&row.withinBudget) ? 'PASS' : 'FAIL'} |`;
  });
  writeFileSync(join(out, 'report.md'), `# Regression action measurements\n\nStatus: ${report.status}; source: ${expectedHead}; ${engine}/${profile}.\n\n${config.metric}.\n\n| Action | Correct samples | Median ms | Max ms | Budget |\n| --- | ---: | ---: | ---: | --- |\n${summaries.join('\n')}\n\n${report.limitations.map(text=>`- ${text}`).join('\n')}\n`);
}
process.exitCode = report.status === 'PASS' ? 0 : 1;
