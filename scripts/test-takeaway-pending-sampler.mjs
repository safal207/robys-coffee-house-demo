import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {cadence} from './takeaway-browser-contract.mjs';

const fixture=JSON.parse(readFileSync(new URL('../qa/evidence/pr-346-motion-startup-probe.json',import.meta.url),'utf8')).probe;
const fresh=()=>structuredClone(fixture);
const first=p=>p.frames.findIndex(f=>f.state==='brand-frame'&&f.entrancePending===false&&f.entranceTime>0&&f.opacity>0);
function pendingLight(){
  const p=fresh(),i=first(p);
  for(let j=0;j<i;j++){
    const f=p.frames[j];
    if(f.state!=='brand-frame')continue;
    f.sampledStyle=false;
    delete f.transform;delete f.opacity;delete f.overlayOpacity;delete f.overlayTransform;
  }
  for(const f of p.frames.slice(i))if(f.state==='brand-frame'||f.state==='handoff')f.sampledStyle=true;
  return p;
}

test('legacy recorded fixture remains valid',()=>{const r=cadence(fresh());assert.equal(r.frames.length,24);assert(r.startupMs<=150);});
test('pending frames may omit computed style without weakening visible evidence',()=>{const p=pendingLight(),r=cadence(p);assert(r.startup.every(f=>f.sampledStyle===false));assert.equal(r.frames.length,24);assert(r.frames.every(f=>f.sampledStyle===true));});
test('pending-light probe still rejects delayed startup beyond 150 ms',()=>{const p=pendingLight(),i=p.frames.findIndex(f=>f.sampledStyle===true&&f.state==='brand-frame');p.frames.slice(i).forEach(f=>{f.at+=200;});assert.throws(()=>cadence(p),/startup.*exceeded 150/);});
test('first sampled style must actually be visible',()=>{const p=pendingLight(),i=p.frames.findIndex(f=>f.sampledStyle===true&&f.state==='brand-frame');p.frames[i].opacity=0;assert.throws(()=>cadence(p),/never visibly started|first visible/i);});
test('pending-light probe still rejects a visible transform freeze',()=>{const p=pendingLight(),i=p.frames.findIndex(f=>f.sampledStyle===true&&f.state==='brand-frame')+5;for(let j=1;j<=3;j++)p.frames[i+j].transform=p.frames[i].transform;assert.throws(()=>cadence(p),/Entrance stepped/);});
test('pending-light probe still rejects visible opacity reversal',()=>{const p=pendingLight(),i=p.frames.findIndex(f=>f.sampledStyle===true&&f.state==='brand-frame');p.frames[i+8].opacity=0;assert.throws(()=>cadence(p),/opacity reversed/);});
test('pending-light probe still rejects slow visible cadence',()=>{const p=pendingLight(),i=p.frames.findIndex(f=>f.sampledStyle===true&&f.state==='brand-frame'),at=p.frames[i].at;p.frames.slice(i).forEach((f,j)=>{if(f.state==='brand-frame')f.at=at+j*33.333;});assert.throws(()=>cadence(p),/Median cadence/);});
test('missing visible style samples cannot become a pass',()=>{const p=pendingLight();for(const f of p.frames)if(f.state==='brand-frame')f.sampledStyle=false;assert.throws(()=>cadence(p),/never visibly started/);});
