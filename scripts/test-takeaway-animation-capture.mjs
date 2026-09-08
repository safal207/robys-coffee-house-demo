import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('./takeaway-browser-contract.mjs',import.meta.url),'utf8');
const start=source.indexOf('export async function contextFor');
const end=source.indexOf('\nexport async function done',start);
assert(start>=0&&end>start,'Missing contextFor source');
const context=source.slice(start,end);

test('pending sampler captures the returned Web Animation instead of querying getAnimations in rAF',()=>{
  assert.doesNotMatch(context,/content\.getAnimations\s*\(/,'content.getAnimations() can force style/layout in the measured rAF');
  assert.match(context,/const nativeAnimate = Element\.prototype\.animate;/);
  assert.match(context,/const animation = nativeAnimate\.apply\(this, args\);/);
  assert.match(context,/return animation;/);
});
test('animation capture is scoped to the takeaway content, not every animation',()=>{
  assert.match(context,/this\.classList\?\.contains\("robys-takeaway-content"\)/);
  assert.match(context,/entranceAnimation = animation;/);
});
test('pending path still performs no computed style sampling',()=>{
  const pendingBranch=context.slice(context.indexOf('const frame = {'),context.indexOf('probe.frames.push(frame);'));
  const conditional=pendingBranch.indexOf('if (entranceAnimation?.pending === false');
  const computed=pendingBranch.indexOf('getComputedStyle(content)');
  assert(conditional>=0&&computed>conditional,'Computed style must remain behind the started-animation condition');
});
