import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REVISION = '20261001-smooth-v5';
const LETTERS_SHA256 = '561b84909f0b803ab47fafefcc49122b42bbb4b015602b01397bea69495aa245';
const read = path => readFileSync(path, 'utf8');
const tag = (svg, id) => {
  const value = svg.match(new RegExp(`<path\\b[^>]*id="${id}"[^>]*\\/?>`))?.[0];
  assert.ok(value, `Missing path: ${id}`);
  return value;
};
const letters = svg => tag(svg, 'robys-letters').match(/\bd="([^"]+)"/)[1];
const geometry = svg => svg.replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, '').replace(/\s+/g, ' ').trim();
let canonical;
for (const kind of ['compact', 'header', 'primary']) {
  const original = read(`src/brand/robys-${kind}-master-v1.svg`);
  const refined = read(`src/brand/robys-${kind}-smooth-v5.svg`);
  assert.doesNotMatch(refined, /<image\b|<text\b|<script\b|<filter\b|data:image|font-family|onload=/i);
  for (const id of ['robys-o', 'robys-apostrophe']) {
    assert.equal(tag(refined, id), tag(original, id), `${kind}: ${id} must be unchanged`);
  }
  const d = letters(refined);
  assert.match(d, /C/);
  assert.match(d, /Q/);
  assert.equal(createHash('sha256').update(d).digest('hex'), LETTERS_SHA256, `${kind}: refined letters changed`);
  assert.equal(geometry(refined.replace(d, letters(original))), geometry(original), `${kind}: only black contours may change`);
  const group = refined.match(/<g id="robys-wordmark"[\s\S]*?<\/g>/)[0];
  if (canonical) assert.equal(group, canonical, `${kind}: inconsistent wordmark`);
  canonical = group;
}
const css = read('brand-refinement-v5.css');
for (const kind of ['compact', 'header', 'primary']) {
  assert.ok(css.includes(`robys-${kind}-smooth-v5.svg?v=${REVISION}`));
}
assert.match(css, /width:max-content!important/);
assert.match(css, /flex:0 0 auto!important/);
assert.doesNotMatch(css, /filter\s*:|scaleX\(|(?:^|[;{\n])\s*width:100%\s*!important/);
for (const page of ['index.html', 'menu.html', 'discover.html']) {
  const html = read(page);
  const base = html.indexOf('href="brand-photo-logo.css?');
  const refined = html.indexOf(`href="brand-refinement-v5.css?v=${REVISION}"`);
  assert.ok(base >= 0 && refined > base, `${page}: refined stylesheet must follow base identity`);
  assert.equal((html.match(/href="brand-refinement-v5\.css/g) || []).length, 1);
  const kind = page === 'menu.html' ? 'primary' : 'compact';
  assert.ok(html.includes(`href="src/brand/robys-${kind}-smooth-v5.svg?v=${REVISION}"`), `${page}: preload active asset`);
}
console.log('PASS BRAND-REFINEMENT-V5: shared smooth contours, original red geometry, active preloads and bounded language control.');

// Offline navigation must not depend on having visited each logo surface online.
const serviceWorker = read('sw-core-v64.js');
for (const asset of ['brand-refinement-v5.css', ...['compact', 'header', 'primary'].map(kind => `src/brand/robys-${kind}-smooth-v5.svg`)]) {
  assert.ok(serviceWorker.includes(`"./${asset}?v=${REVISION}"`), `${asset}: active revision must be precached`);
  assert.ok(serviceWorker.includes(`url.pathname.endsWith("/${asset}")`), `${asset}: cache matching must include the revision`);
}
assert.match(serviceWorker, /brand-v5-/);
