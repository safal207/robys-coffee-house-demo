import test from 'node:test';
import assert from 'node:assert/strict';
import { canWarmMenuView, menuWarmAsset } from '../src/menu-view-warmup.js';
import { createFeedEngagement } from '../src/menu-feed-engagement.js';

test('menu warmup honors reduced-data and slow connections without requiring the Network Information API', () => {
  assert.equal(canWarmMenuView(undefined), true);
  assert.equal(canWarmMenuView({effectiveType:'4g'}), true);
  for (const connection of [{saveData:true}, {effectiveType:'2g'}, {effectiveType:'slow-2g'}]) {
    assert.equal(canWarmMenuView(connection), false);
  }
});
test('warmup allows only known same-directory menu resources, never arbitrary URLs or the photo catalog', () => {
  const base='https://example.test/cafe/menu.html?view=list';
  assert.deepEqual(menuWarmAsset('menu-feed.js?v=abc',base),{href:'https://example.test/cafe/menu-feed.js?v=abc',as:'script'});
  assert.deepEqual(menuWarmAsset('menu-feed.css?v=abc#discard',base),{href:'https://example.test/cafe/menu-feed.css?v=abc',as:'style'});
  for (const href of ['https://evil.test/menu-feed.js','//evil.test/menu-feed.js','../menu-feed.js','/menu-feed.js',
    'javascript:alert(1)','data:text/html,test','https://user:password@example.test/cafe/menu-feed.js',
    'src/products/menu-v1/hot-coffee--espresso.webp','order-storage.js','menu-feed.js/other','']) {
    assert.equal(menuWarmAsset(href,base),null,href);
  }
});
test('local likes and seen changes identify exactly one product; full synchronization still refreshes all', () => {
  const values=new Map(), updates=[];
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const state=createFeedEngagement({validIds:['coffee:a','coffee:b'],getStorage:()=>storage,onChange:id=>updates.push(id)});
  state.setLiked('coffee:a',true); state.markSeen('coffee:b');
  assert.deepEqual(updates,['coffee:a','coffee:b']);
  state.markSeen('coffee:b'); assert.equal(updates.length,2,'No-op writes must not invalidate cards');
  values.set('robys-feed-like-v1:coffee:b','1'); state.sync('robys-feed-like-v1:coffee:b');
  assert.equal(updates.at(-1),'coffee:b');
  values.clear(); state.sync(); assert.equal(updates.at(-1),null);
});
