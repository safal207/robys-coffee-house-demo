import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cadence } from './takeaway-browser-contract.mjs';

const fixture=JSON.parse(readFileSync(new URL('../qa/evidence/pr-346-motion-startup-probe.json',import.meta.url),'utf8')).probe;
const fresh=()=>structuredClone(fixture);
const first=p=>p.frames.findIndex(f=>f.state==='brand-frame'&&f.entrancePending===false&&f.entranceTime>0&&f.opacity>0);

test('real trace separates three invisible startup frames from 24 moving frames',()=>{
  const result=cadence(fresh());
  assert.equal(result.startup.length,3);
  assert.equal(result.frames.length,24);
  assert.equal(result.uniqueTransforms,24);
  assert.equal(result.longestIdenticalRun,1);
  assert(result.startupMs<=150);
});
test('a visible four-frame freeze still fails',()=>{
  const p=fresh(),i=first(p)+5;
  for(let j=1;j<=3;j++)p.frames[i+j].transform=p.frames[i].transform;
  assert.throws(()=>cadence(p),/Entrance stepped/);
});
test('a mid-animation opacity drop is retained and fails',()=>{
  const p=fresh();p.frames[first(p)+8].opacity=0;
  assert.throws(()=>cadence(p),/opacity reversed/);
});
test('slow visible cadence still fails the unchanged 60 Hz limit',()=>{
  const p=fresh(),i=first(p),at=p.frames[i].at;
  p.frames.slice(i).forEach((f,j)=>{f.at=at+j*33.333;});
  assert.throws(()=>cadence(p),/Median cadence/);
});
test('a delayed visible start fails its separate budget',()=>{
  const p=fresh();p.frames.slice(first(p)).forEach(f=>{f.at+=200;});
  assert.throws(()=>cadence(p),/startup.*exceeded 150/);
});
test('a never-started entrance cannot pass',()=>{
  const p=fresh();p.frames.forEach(f=>{f.entrancePending=true;f.entranceTime=0;f.opacity=0;});
  assert.throws(()=>cadence(p),/never visibly started/);
});
test('fewer than 24 visible entrance samples cannot pass',()=>{
  const p=fresh(),i=first(p);p.frames=p.frames.slice(0,i+23);
  assert.throws(()=>cadence(p),/Only 23\/24/);
});
