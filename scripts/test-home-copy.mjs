import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// The removed copy belonged to retired sections. Keep every live translation
// byte-identical and fail when a newly declared key has no complete locale copy.
const source=readFileSync('src/i18n.ts','utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const dictionaries=JSON.parse(JSON.stringify(exports.dictionaries));
const keysIn = text => [...new Set([...text.matchAll(/\bdata-i18n(?:-rich)?\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]))].sort();
const documents=readdirSync('.').filter(file=>file.endsWith('.html')).map(file=>({file,text:readFileSync(file,'utf8')})).filter(({text})=>/\bsrc=["'](?:\.\/)?app\.js(?:\?[^"']*)?["']/.test(text));
const keys=[...new Set(documents.flatMap(({text})=>keysIn(text)))].sort();
const approvedHashes={
  "tr": "84ac48e3034c7f9f9d4cd67ae5f75f83efce7470fac40d17f5413dcc9e3244b7",
  "en": "24b0516d02e5b5828c8859fea6a0e7ae7c0ed7227dc58db888e21fc313e640d4",
  "ru": "206080646c4d38e8e25e8ea55f839c90276330634bf3b8ce67328bc701c7ec66"
};
function validate(copy, requestedKeys) {
 assert.deepEqual(Object.keys(copy).sort(), ['en','ru','tr']);
 for(const language of ['tr','en','ru']) {
  assert.deepEqual(Object.keys(copy[language]).sort(),requestedKeys,language+': declared keys must exactly match the active copy');
  for(const key of requestedKeys) assert.ok(typeof copy[language][key]==='string' && copy[language][key].trim(),language+': missing '+key);
 }
}
test('the actual homepage declares 30 unique translation keys',()=>{
 assert.deepEqual(documents.map(item=>item.file),['index.html']); assert.equal(keys.length,30); validate(dictionaries,keys);
});
for(const language of ['tr','en','ru']) {
 test(language+': retained text is byte-identical to the reviewed parent',()=>{
  const digest=createHash('sha256').update(JSON.stringify(keys.map(key=>[key,dictionaries[language][key]]))).digest('hex');
  assert.equal(digest,approvedHashes[language]);
 });
 test(language+': missing translation fails closed',()=>{
  const invalid=structuredClone(dictionaries);delete invalid[language].heroTitle;assert.throws(()=>validate(invalid,keys));
 });
 test(language+': empty translation fails closed',()=>{
  const invalid=structuredClone(dictionaries);invalid[language].navMenu=' ';assert.throws(()=>validate(invalid,keys));
 });
}
test('new untranslated markup is rejected, including rich text',()=>{
 for(const attribute of ['data-i18n','data-i18n-rich']) {
  const requested=[...keys,...keysIn(`<p ${attribute}="newKey"></p>`)].sort();
  assert.throws(()=>validate(dictionaries,requested));
 }
});
test('single/double quoted and rich markup are detected',()=>assert.deepEqual(keysIn(`<p data-i18n="a"></p><h2 data-i18n-rich='b'></h2>`),['a','b']));
test('retired sections no longer contribute translation keys',()=>{
 for(const language of ['tr','en','ru']) for(const key of ['passportVisits','matcherText','reviewsTitle','storyTerrace']) assert.ok(!(key in dictionaries[language]));
});
