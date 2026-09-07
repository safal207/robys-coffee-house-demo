import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const origin='https://example.test/coffee/';
let cachedURL,matchingOptions;
const stale={revision:'old'};
const context=vm.createContext({URL,Request,Response,self:{registration:{scope:origin},addEventListener(){}},caches:{async open(){return{async match(request,options){matchingOptions=options;return request.url===cachedURL || options?.ignoreSearch ? stale : undefined;}};}}});
vm.runInContext(readFileSync('sw.js','utf8'),context);
const lookup=vm.runInContext('cachedResponse',context);
for(const path of ['order-launcher.js','order-store.js','order-shell.js','order-shell.css','pairing-posters.js','pairing-posters.css','menu-app.js','menu-catalog.js','smart-choice/app-v2.js','smart-choice/cart-v2.js']){
 cachedURL=new URL(path+'?v=old',origin).href;
 assert.equal(await lookup(new Request(new URL(path+'?v=new',origin))),undefined,`${path}: never satisfy a new module revision with old bytes`);
 assert.ok(!matchingOptions?.ignoreSearch);
 assert.equal(await lookup(new Request(cachedURL)),stale,`${path}: an exact cached revision remains usable offline`);
}
console.log('Order cache revisions: PASS (10 exact-revision assets, stale rejection and offline exact matches)');
