// Isolated fixtures only. Execute after a real CI packet has been inspected.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [recordArg, summaryArg, outArg] = process.argv.slice(2);
assert(recordArg && summaryArg && outArg, 'Arguments: reviewed-record.json actual-CI-summary.json output-directory');
const root = process.cwd(), recordFile = path.resolve(recordArg), summaryFile = path.resolve(summaryArg), out = path.resolve(outArg);
const record = JSON.parse(readFileSync(recordFile, 'utf8'));
assert.equal(record.version, 1);
assert.equal(record.reviewedChanges.length, 1, 'One freshly inspected change per new document');
const originalSummary = JSON.parse(readFileSync(summaryFile, 'utf8'));
assert(originalSummary.results.some(row => !row.passed), 'Controls require an actual failing comparison set');
const change = record.reviewedChanges[0], verifier = 'scripts/verify-reviewed-visual-change.mjs';
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const baselineApprovals = JSON.parse(readFileSync('qa/reviewed-visual-changes.json', 'utf8'));
const supplemental = readdirSync('qa/reviewed-visual-changes.d').filter(file => file.endsWith('.json'))
  .map(file => path.join('qa/reviewed-visual-changes.d', file)).filter(file => path.resolve(file) !== recordFile);
const allDocuments = [baselineApprovals, ...supplemental.map(file => JSON.parse(readFileSync(file, 'utf8'))), record];
const boundPaths = new Set(allDocuments.flatMap(document => document.reviewedChanges.flatMap(row => Object.keys(row.contentBindings ?? {}))));
const sourceIdentity = () => Object.fromEntries([...new Set([...boundPaths, verifier])].filter(file => existsSync(file)).sort().map(file => [file, sha(file)]));
const before = sourceIdentity();
mkdirSync(out, {recursive:true});
const fixtureParent = mkdtempSync(path.join(tmpdir(), 'robys-visual-review-controls-'));
const report = {kind:'actual-shipped-verifier-isolated-fixtures', fixtureScope:'Positive uses the inspected actual CI summary and new record; negative cases are separately synthetic and never modify the repository.', observedRepositoryHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), capturedSourceHead:change.sourceHead, actualSummarySha256:sha(summaryFile), recordSha256:sha(recordFile), verifierSha256:sha(verifier), cases:[]};
const cloned = value => JSON.parse(JSON.stringify(value));
const dimension = change.expectedFailures.find(row => typeof row.reason === 'string');
const ratio = change.expectedFailures.find(row => Number.isFinite(row.maxDiffPixelRatio));
const css = ['discover-deck.css','menu-premium.css'].find(file => change.contentBindings[file]) ?? Object.keys(change.contentBindings).find(file => file.endsWith('.css') && !file.startsWith('qa/'));
const runtime = ['menu-app.js','order-storage.js'].find(file => change.contentBindings[file]);
const rendered = ['menu.html','index.html'].find(file => change.contentBindings[file]) ?? Object.keys(change.contentBindings).find(file => file.endsWith('.html') && !file.startsWith('src/')); 
assert(css && rendered && change.contentBindings['integrity-manifest.json'], 'New packet must bind actual rendered files, CSS and public manifest');

function runCase(id, expectedExit, mutate = () => {}) {
 const dir = path.join(fixtureParent,id), summary = cloned(originalSummary), next = cloned(record);
 mkdirSync(dir,{recursive:true});
 for (const file of new Set([...boundPaths,verifier])) {
  assert(!path.isAbsolute(file) && !file.split('/').includes('..'), `Safe bound path required: ${file}`);
  if(!existsSync(path.join(root,file))) continue;
  mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});
  cpSync(path.join(root,file),path.join(dir,file));
 }
 mkdirSync(path.join(dir,'qa/reviewed-visual-changes.d'),{recursive:true});
 writeFileSync(path.join(dir,'qa/reviewed-visual-changes.json'),JSON.stringify(baselineApprovals));
 for(const file of supplemental)cpSync(path.join(root,file),path.join(dir,file));
 const reviewedPath = path.join(dir,'qa/reviewed-visual-changes.d/__current-test-record.json');
 mutate({dir,summary,record:next,change:next.reviewedChanges[0]});
 writeFileSync(reviewedPath,JSON.stringify(next));
 mkdirSync(path.join(dir,'results'),{recursive:true});
 writeFileSync(path.join(dir,'results/summary.json'),JSON.stringify(summary));
 const result = spawnSync(process.execPath,[verifier],{cwd:dir,env:{...process.env,VISUAL_RESULTS_DIR:path.join(dir,'results')},encoding:'utf8'});
 const passed = expectedExit === 0 ? result.status === 0 : result.status !== 0 && result.stderr.includes('[VISUAL-001] Expected exactly one content-bound reviewed change');
 const row={id,kind:id==='positive'?'actual-CI-summary-positive':'synthetic-negative-control',expected:expectedExit===0?'accept':'reject',exitCode:result.status,passed,stdout:result.stdout,stderr:result.stderr,fixtureRecordSha256:sha(reviewedPath),fixtureSummarySha256:sha(path.join(dir,'results/summary.json'))};
 report.cases.push(row);
 writeFileSync(path.join(out,`${id}.log`),result.stdout+result.stderr);
 console.log(passed?'PASS':'FAIL',id,result.status);
 assert(passed,`${id} violated expected verifier outcome`);
 rmSync(dir,{recursive:true,force:true});
}
try {
 runCase('positive',0);
 runCase('changed-bound-css',1,({dir})=>writeFileSync(path.join(dir,css),readFileSync(path.join(dir,css),'utf8')+'\n/* synthetic changed byte */\n'));
 if(change.contentBindings['menu-runtime.css'])runCase('changed-bound-menu-bundle',1,({dir})=>writeFileSync(path.join(dir,'menu-runtime.css'),readFileSync(path.join(dir,'menu-runtime.css'),'utf8')+'\n/* synthetic changed bundle byte */\n'));
 runCase('changed-bound-rendered-page',1,({dir})=>writeFileSync(path.join(dir,rendered),readFileSync(path.join(dir,rendered),'utf8')+'\n<!-- synthetic changed byte -->\n'));
 if(runtime)runCase('changed-bound-runtime',1,({dir})=>writeFileSync(path.join(dir,runtime),readFileSync(path.join(dir,runtime),'utf8')+'\n/* synthetic changed byte */\n'));
 runCase('changed-public-manifest',1,({dir})=>writeFileSync(path.join(dir,'integrity-manifest.json'),readFileSync(path.join(dir,'integrity-manifest.json'),'utf8')+'\n'));
 runCase('missing-expected-failure',1,({change})=>change.expectedFailures.pop());
 runCase('extra-actual-failure',1,({summary})=>{const row=summary.results.find(row=>row.passed);assert(row);row.passed=false;row.diffPixels=Math.max(1,row.diffPixels??0);row.diffPixelRatio=Math.max(.5,row.diffPixelRatio??0);summary.failures+=1;});
 runCase('duplicate-expected-entry',1,({change})=>{assert(change.expectedFailures.length>1);change.expectedFailures[1]=cloned(change.expectedFailures[0]);});
 runCase('duplicate-matching-record',1,({record})=>record.reviewedChanges.push({...cloned(record.reviewedChanges[0]),id:'synthetic-duplicate-matching-record'}));
 runCase('empty-content-bindings',1,({change})=>{change.contentBindings={};});
 if(dimension)runCase('changed-dimension-reason',1,({summary})=>{summary.results.find(row=>row.id===dimension.capture&&row.viewport===dimension.viewport).reason+=' synthetic mismatch';});
 if(ratio){
  runCase('ratio-one-pixel-above-bound',1,({summary})=>{const row=summary.results.find(row=>row.id===ratio.capture&&row.viewport===ratio.viewport);row.diffPixelRatio=ratio.maxDiffPixelRatio+1/(row.totalPixels||1e8);});
  runCase('changed-crop-pixel-total',1,({summary})=>{const row=summary.results.find(row=>row.id===ratio.capture&&row.viewport===ratio.viewport);assert(Number.isFinite(ratio.totalPixels));row.totalPixels+=1;});
 }
 report.passed=report.cases.every(row=>row.passed);
} finally {
 const after = sourceIdentity();
 report.repositoryBoundBytesUnchanged=JSON.stringify(before)===JSON.stringify(after);
 report.repositorySourceIdentityBefore=before;
 report.repositorySourceIdentityAfter=after;
 report.finishedAt=new Date().toISOString();
 writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 rmSync(fixtureParent,{recursive:true,force:true});
 assert(report.repositoryBoundBytesUnchanged,'Repository bytes changed during isolated controls');
}
