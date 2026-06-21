import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const argv=process.argv.slice(2);
const arg=(name,fallback)=>{const i=argv.indexOf(`--${name}`);return i>=0?argv[i+1]:fallback};
const profile=arg('profile');const input=resolve(arg('input','.lighthouseci'));
const output=resolve(arg('output',profile?`lighthouse/reports/${profile}-summary.json`:'lighthouse/reports/summary.json'));
const heroPath=resolve(arg('hero',process.env.HERO_VIDEO_PATH??'src/robys-hero-mobile-lite.mp4'));
if(!['mobile','desktop'].includes(profile))throw new Error('--profile must be mobile or desktop');
if(!statSync(input,{throwIfNoEntry:false})?.isDirectory())throw new Error(`Lighthouse input not found: ${input}`);

function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=join(dir,e.name);return e.isDirectory()?walk(p):[p]})}
function median(values){const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return null;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2}
function lhrFrom(path){try{const x=JSON.parse(readFileSync(path,'utf8'));return x?.audits&&x?.categories&&x?.lighthouseVersion?x:null}catch{return null}}
const lhrs=walk(input).filter(p=>p.endsWith('.json')).map(lhrFrom).filter(Boolean);
if(!lhrs.length)throw new Error(`No Lighthouse result JSON files found in ${input}`);
const audit=id=>lhrs.map(l=>Number(l.audits?.[id]?.numericValue)).filter(Number.isFinite);
function scriptBytes(l){const row=(l.audits?.['resource-summary']?.details?.items??[]).find(x=>x.resourceType==='script');return Number(row?.size??row?.transferSize)}
function hero(l){return (l.audits?.['network-requests']?.details?.items??[]).find(x=>{const t=String(x.resourceType??'').toLowerCase();const u=String(x.url??'');return (t==='media'||/\.mp4(?:$|[?#])/i.test(u))&&/hero/i.test(u)})??null}
function duration(x){if(!x)return null;const a=Number(x.networkRequestTime??x.startTime),b=Number(x.networkEndTime??x.endTime);return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)*1000:null}
let manifest=[];try{manifest=JSON.parse(readFileSync(join(input,'manifest.json'),'utf8'))}catch{}
const publicUrl=Array.isArray(manifest)?manifest.map(x=>x.url).find(x=>typeof x==='string'&&/^https?:/.test(x))??null:null;
const heroes=lhrs.map(hero);
const values={
  performance:median(lhrs.map(l=>Number(l.categories?.performance?.score))),
  lcp:median(audit('largest-contentful-paint')),
  tbt:median(audit('total-blocking-time')),
  cls:median(audit('cumulative-layout-shift')),
  fcp:median(audit('first-contentful-paint')),
  speed_index:median(audit('speed-index')),
  total_js_bytes:median(lhrs.map(scriptBytes)),
  hero_file_bytes:statSync(heroPath,{throwIfNoEntry:false})?.size??null,
  hero_transfer_bytes:median(heroes.map(x=>Number(x?.transferSize??x?.resourceSize))),
  hero_request_duration:median(heroes.map(duration))
};
const summary={schema_version:1,profile,generated_at:new Date().toISOString(),url:lhrs[0].finalUrl??lhrs[0].requestedUrl??null,run_count:lhrs.length,lighthouse_version:lhrs[0].lighthouseVersion,chrome_user_agent:lhrs[0].userAgent??null,public_url:publicUrl,values};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${JSON.stringify(summary,null,2)}\n`);console.log(JSON.stringify(summary,null,2));
