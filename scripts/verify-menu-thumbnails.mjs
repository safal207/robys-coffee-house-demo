import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync('qa/menu-thumbnail-assets.json', 'utf8'));
const previewSource = readFileSync('src/smart-choice/photo-previews.ts', 'utf8');
const previews = JSON.parse(previewSource.slice(previewSource.indexOf('{'), previewSource.lastIndexOf('}') + 1));
const expected = ['menu-v1', 'sets-v1', 'quick-choice-v1'].flatMap(folder =>
  readdirSync(`src/products/${folder}`).filter(name => name.endsWith('.webp')).sort()
    .map(name => `src/products/${folder}/${name}`));
assert.deepEqual(manifest.assets.map(asset => asset.source), expected, 'Every menu, set and inspiration photo must have delivery copies');
assert.deepEqual(manifest.widths, [256, 512]);
assert.deepEqual(Object.keys(previews), expected, 'Every photo needs an immediate same-photo preview');
function dimensions(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'No truncated photo');
  const type = bytes.toString('ascii', 12, 16);
  if (type === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (type === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  throw new Error(`Unexpected delivery format ${type}`);
}
const totals = { original: 0, small: 0, large: 0 };
for (const asset of manifest.assets) {
  const original = readFileSync(asset.source);
  assert.equal(digest(original), asset.sha256, `Stale thumbnail: ${asset.source}`);
  assert.equal(original.length, asset.bytes);
  const [originalWidth, originalHeight] = dimensions(original);
  assert.match(previews[asset.source], /^data:image\/webp;base64,/);
  const preview = Buffer.from(previews[asset.source].split(',')[1], 'base64');
  assert.equal(digest(preview), asset.preview.sha256);
  assert.equal(preview.length, asset.preview.bytes);
  assert.deepEqual(dimensions(preview), [32, asset.preview.height]);
  assert(Math.abs(asset.preview.height - originalHeight / originalWidth * 32) <= 1);
  assert.deepEqual(asset.variants.map(v => v.width), manifest.widths);
  for (const variant of asset.variants) {
    assert.equal(variant.path, asset.source.replace('/products/', '/products/quick-v1/').replace(/\.webp$/, `-${variant.width}.webp`));
    const bytes = readFileSync(variant.path);
    assert.equal(digest(bytes), variant.sha256, `Changed delivery photo: ${variant.path}`);
    assert.equal(bytes.length, variant.bytes);
    assert.deepEqual(dimensions(bytes), [variant.width, variant.height]);
    assert(Math.abs(variant.height - originalHeight / originalWidth * variant.width) <= 1, 'Keep the original framing without cropping');
    assert(bytes.length < original.length, 'A delivery copy must be smaller than its source');
    totals[variant.width === 256 ? 'small' : 'large'] += bytes.length;
  }
  totals.original += original.length;
}
assert(totals.small < totals.original * .3, 'Small photos must save at least 70% of transfer bytes');
assert(totals.large < totals.original * .55, 'Retina delivery copies must save at least 45%');
assert(Buffer.byteLength(previewSource) < 50_000, 'Inline previews must stay a small initial payload');
console.log(`Menu thumbnails PASS: ${expected.length} originals preserved, ${expected.length * 2} verified responsive copies; ${JSON.stringify(totals)} bytes.`);
