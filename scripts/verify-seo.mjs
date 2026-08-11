import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const checks = [];

function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const index = read('index.html');
const menu = read('menu.html');
const ru = read('ru/coffee-gazipasa.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');

check('homepage has canonical', index.includes('rel="canonical" href="https://safal207.github.io/robys-coffee-house-demo/"'));
check('homepage has local business structured data', index.includes('"@type": "CafeOrCoffeeShop"'));
check('menu has canonical', menu.includes('rel="canonical" href="https://safal207.github.io/robys-coffee-house-demo/menu.html"'));
check('menu has Menu structured data', menu.includes('"@type": "Menu"'));

check('Russian page declares lang=ru', /<html\s+lang="ru">/i.test(ru));
check('Russian page has exactly one H1', count(ru, /<h1\b/gi) === 1);
check('Russian page has title', /<title>[^<]{20,}<\/title>/i.test(ru));
check('Russian page has meta description', /<meta\s+name="description"\s+content="[^"]{60,}"/i.test(ru));
check('Russian page has self canonical', ru.includes('rel="canonical" href="https://safal207.github.io/robys-coffee-house-demo/ru/coffee-gazipasa.html"'));
check('Russian page has ru hreflang', ru.includes('hreflang="ru"'));
check('Russian page has FAQ structured data', ru.includes('"@type": "FAQPage"'));
check('Russian page has visible FAQ section', ru.includes('id="faq"'));
check('Russian page links to menu', ru.includes('href="../menu.html"'));
check('Russian page exposes visible address', ru.includes('<address>'));

check('robots allows crawling', /User-agent:\s*\*/i.test(robots) && /Allow:\s*\//i.test(robots));
check('robots references sitemap', robots.includes('Sitemap: https://safal207.github.io/robys-coffee-house-demo/sitemap.xml'));
check('sitemap contains homepage', sitemap.includes('<loc>https://safal207.github.io/robys-coffee-house-demo/</loc>'));
check('sitemap contains menu', sitemap.includes('<loc>https://safal207.github.io/robys-coffee-house-demo/menu.html</loc>'));
check('sitemap contains Russian landing page', sitemap.includes('<loc>https://safal207.github.io/robys-coffee-house-demo/ru/coffee-gazipasa.html</loc>'));

const failed = checks.filter((item) => !item.condition);

for (const item of checks) {
  console.log(`${item.condition ? 'PASS' : 'FAIL'}  ${item.name}`);
}

if (failed.length > 0) {
  console.error(`\nSEO verification failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`\nSEO verification passed: ${checks.length}/${checks.length} checks.`);
