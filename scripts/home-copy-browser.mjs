import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, open, mkdir, writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {chromium} from 'playwright';

const root=resolve('.'),out=resolve(process.env.HOME_COPY_RESULTS_DIR||'.artifacts/home-copy');
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('src/i18n.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const copy=JSON.parse(JSON.stringify(exports.dictionaries));
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 files:Object.fromEntries(['app.js','index.html','src/i18n.ts'].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),
 scope:'Built site in Chromium; CSP enforced; service workers blocked for deterministic translation inspection. Not a device or live-site result.',checks:[],passed:false};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
 let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 let handle=await open(file,'r');let bytes;
 try{if((await handle.stat()).isDirectory()){await handle.close();file=resolve(file,'index.html');handle=await open(file,'r');}bytes=await handle.readFile();}finally{await handle.close();}
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
}catch{res.writeHead(404).end();}});
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,bypassCSP:false,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html?entry=off`,{waitUntil:'load'});
 for(const language of ['tr','en','ru']){
  await page.locator(`[data-lang="${language}"]`).click();
  await page.locator('html').filter({has:page.locator(`[data-lang="${language}"][aria-pressed="true"]`)}).waitFor();
  const nodes=await page.locator('[data-i18n],[data-i18n-rich]').evaluateAll(elements=>elements.map(node=>({key:node.getAttribute('data-i18n')||node.getAttribute('data-i18n-rich'),text:node.textContent,rich:node.hasAttribute('data-i18n-rich'),tags:[...node.querySelectorAll('*')].map(child=>child.tagName)})));
  assert.equal(new Set(nodes.map(node=>node.key)).size,30);
  for(const node of nodes){
   assert.ok(copy[language][node.key],language+': missing '+node.key);
   assert.equal(node.text,node.rich?copy[language][node.key].replace(/<br\s*\/?>|<\/?em>/gi,''):copy[language][node.key]);
   assert.ok(node.tags.every(tag=>tag==='BR'||tag==='EM'));
  }
  report.checks.push({id:language+'-all-live-translations',passed:true,nodes:nodes.length,keys:30});
  await page.screenshot({path:resolve(out,'home-'+language+'.png')});
 }
 // New content must still be translated by the existing mutation observer.
 await page.evaluate(()=>{const node=document.createElement('p');node.id='home-copy-dynamic';node.dataset.i18n='navMenu';document.querySelector('main').append(node);});
 await page.locator('#home-copy-dynamic').filter({hasText:copy.ru.navMenu}).waitFor({state:'attached'});
 report.checks.push({id:'dynamic-localized-content',passed:true});
 await page.locator('[data-lang="en"]').click();
 await page.locator('#home-copy-dynamic').filter({hasText:copy.en.navMenu}).waitFor({state:'attached'});
 report.checks.push({id:'dynamic-content-retranslation',passed:true});
 assert.deepEqual(errors,[]);report.checks.push({id:'no-runtime-errors',passed:true});
 await context.close();report.passed=report.checks.length===6;
}catch(error){report.error=String(error.stack);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
