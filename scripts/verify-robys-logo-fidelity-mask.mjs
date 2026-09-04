#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const parse = (argv) => Object.fromEntries(argv.reduce((a,v,i,x)=>(v.startsWith('--')&&a.push([v.slice(2),x[i+1]]),a),[]));

function unpack(entry){
  const packed=Buffer.from(entry.bits_base64,'base64');
  const mask=new Uint8Array(entry.width*entry.height);
  for(let i=0;i<mask.length;i++) mask[i]=(packed[Math.floor(i/8)]>>(7-(i%8)))&1;
  return {mask,width:entry.width,height:entry.height};
}
function rgba(m){
  const out=Buffer.alloc(m.mask.length*4);
  for(let i=0;i<m.mask.length;i++){const v=m.mask[i]?17:255,o=i*4;out[o]=v;out[o+1]=v;out[o+2]=v;out[o+3]=255;}
  return out;
}
async function writeMask(m,file){await sharp(rgba(m),{raw:{width:m.width,height:m.height,channels:4}}).png().toFile(file);}
function logoPixel(r,g,b,a){return a>=48&&((r<155&&g<155&&b<155)||(r>120&&r>g*1.25&&r>b*1.25));}
async function imageMask(file){
  const {data,info}=await sharp(file).flatten({background:'#fff'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const mask=new Uint8Array(info.width*info.height);
  for(let i=0;i<mask.length;i++){const o=i*4;mask[i]=logoPixel(data[o],data[o+1],data[o+2],data[o+3])?1:0;}
  return {mask,width:info.width,height:info.height};
}
function components(m){
  const seen=new Uint8Array(m.mask.length),out=[],qx=new Int32Array(m.mask.length),qy=new Int32Array(m.mask.length);
  const minArea=Math.max(20,Math.floor(m.width*m.height*0.00004));
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
    const start=y*m.width+x;if(!m.mask[start]||seen[start])continue;
    let h=0,t=1,minX=x,maxX=x,minY=y,maxY=y,area=0;qx[0]=x;qy[0]=y;seen[start]=1;
    while(h<t){const cx=qx[h],cy=qy[h++];area++;minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=m.width||ny>=m.height)continue;const n=ny*m.width+nx;if(m.mask[n]&&!seen[n]){seen[n]=1;qx[t]=nx;qy[t++]=ny;}}
    }
    if(area>=minArea)out.push({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,area});
  }
  return out;
}
function glyphBoxes(m,order){
  const all=components(m),maxH=Math.max(...all.map(x=>x.height));
  const row=all.filter(x=>x.y<m.height*.72&&x.height>=maxH*.62).sort((a,b)=>a.x-b.x).slice(0,order.length);
  assert.equal(row.length,order.length,"must detect R/O/B/Y/S");
  return Object.fromEntries(order.map((g,i)=>[g,row[i]]));
}
function crop(m,b){
  const out=new Uint8Array(b.width*b.height);
  for(let y=0;y<b.height;y++)out.set(m.mask.subarray((b.y+y)*m.width+b.x,(b.y+y)*m.width+b.x+b.width),y*b.width);
  return {mask:out,width:b.width,height:b.height};
}
function resize(m,w,h){
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++){const sy=Math.min(m.height-1,Math.floor(y*m.height/h));for(let x=0;x<w;x++){const sx=Math.min(m.width-1,Math.floor(x*m.width/w));out[y*w+x]=m.mask[sy*m.width+sx];}}
  return {mask:out,width:w,height:h};
}
function dice(a,b){let aa=0,bb=0,ab=0;for(let i=0;i<a.mask.length;i++){aa+=a.mask[i];bb+=b.mask[i];ab+=a.mask[i]&&b.mask[i]?1:0;}return 2*ab/(aa+bb);}
function dilate(m,radius){
  const out=new Uint8Array(m.mask.length);
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(m.mask[y*m.width+x]){
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<m.width&&ny<m.height)out[ny*m.width+nx]=1;
    }
  }
  return {mask:out,width:m.width,height:m.height};
}
function tolerantDice(a,b,radius){
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  if(radius===0)return dice(a,b);
  const da=dilate(a,radius),db=dilate(b,radius);let aa=0,bb=0,matchedA=0,matchedB=0;
  for(let i=0;i<a.mask.length;i++){aa+=a.mask[i];bb+=b.mask[i];matchedA+=a.mask[i]&&db.mask[i]?1:0;matchedB+=b.mask[i]&&da.mask[i]?1:0;}
  return (matchedA+matchedB)/(aa+bb);
}
function union(boxes){const v=Object.values(boxes),x=Math.min(...v.map(b=>b.x)),y=Math.min(...v.map(b=>b.y)),r=Math.max(...v.map(b=>b.x+b.width)),d=Math.max(...v.map(b=>b.y+b.height));return{x,y,width:r-x,height:d-y};}
function geometry(g){
  const a=[g.R,g.B,g.Y],cap=a.reduce((s,b)=>s+b.y,0)/3,base=a.reduce((s,b)=>s+b.y+b.height,0)/3,h=base-cap;
  return {cap,baseline:base,cap_height:h,b_cap_deviation_ratio:Math.abs(g.B.y-cap)/h,b_baseline_deviation_ratio:Math.abs(g.B.y+g.B.height-base)/h,s_top_overshoot_ratio:Math.max(0,cap-g.S.y)/h,s_bottom_overshoot_ratio:Math.max(0,g.S.y+g.S.height-base)/h};
}
function mismatch(a,b){let n=0;for(let i=0;i<a.mask.length;i++)if(a.mask[i]!==b.mask[i])n++;return n/a.mask.length;}
async function diffPng(a,b,file){const out=new Uint8Array(a.mask.length);for(let i=0;i<out.length;i++)out[i]=a.mask[i]===b.mask[i]?0:1;await writeMask({mask:out,width:a.width,height:a.height},file);}
async function board(ref,actual,diff,file,label){
  const w=ref.width,h=ref.height,lh=24,total=(h+lh)*3,items=[];
  for(const [i,[name,img]] of [['REFERENCE',ref],['BROWSER',actual],['DIFF',diff]].entries()){
    const top=i*(h+lh);items.push({input:Buffer.from(`<svg width="${w}" height="${lh}"><rect width="100%" height="100%" fill="white"/><text x="8" y="17" font-size="13" font-family="Arial" font-weight="700">${label} · ${name}</text></svg>`),top,left:0});items.push({input:rgba(img),raw:{width:w,height:h,channels:4},top:top+lh,left:0});
  }
  await sharp({create:{width:w,height:total,channels:3,background:'#fff'}}).composite(items).png().toFile(file);
}
async function capture(browser,cfg,p,out){
  const ctx=await browser.newContext({viewport:p.viewport,deviceScaleFactor:p.device_scale_factor,isMobile:p.id==='mobile',hasTouch:p.id==='mobile'}),page=await ctx.newPage();
  await page.goto(cfg.target.url,{waitUntil:'networkidle',timeout:60000});const loc=page.locator(cfg.target.selector);await loc.waitFor({state:'visible'});const file=path.join(out,`${p.id}-actual.png`);await loc.screenshot({path:file,animations:'disabled'});
  const style=await loc.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{width:r.width,height:r.height,background_image:s.backgroundImage,background_size:s.backgroundSize};});await ctx.close();return{file,style};
}
async function main(){
  const a=parse(process.argv.slice(2));for(const k of ['config','chrome','output-dir'])if(!a[k])throw new Error(`--${k} required`);
  const cfg=JSON.parse(await fs.readFile(a.config,'utf8'));assert.equal(cfg.authority.merge,false);assert.equal(cfg.authority.deployment,false);assert(Number.isInteger(cfg.glyph_tolerance_radius_px)&&cfg.glyph_tolerance_radius_px>=0&&cfg.glyph_tolerance_radius_px<=2);
  assert.equal(new URL(cfg.target.url).searchParams.get('entry'),'off','logo fidelity capture must isolate the wordmark from the independently certified entry overlay');
  const refBytes=await fs.readFile(cfg.reference.mask_path);assert.equal(hash(refBytes),cfg.reference.mask_sha256);const rp=JSON.parse(refBytes);assert.equal(rp.source_sha256,cfg.reference.source_sha256);
  const ref={glyphs:Object.fromEntries(cfg.glyph_order.map(g=>[g,unpack(rp.glyphs[g])])),wordmark:unpack(rp.wordmark)};
  const out=a['output-dir'];await fs.mkdir(out,{recursive:true});const refFile=path.join(out,'reference-normalized.png');await writeMask(ref.wordmark,refFile);
  const browser=await chromium.launch({executablePath:a.chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
  try{for(const p of cfg.profiles){
    const cap=await capture(browser,cfg,p,out),m=await imageMask(cap.file),boxes=glyphBoxes(m,cfg.glyph_order),scores={},exactScores={};
    for(const g of cfg.glyph_order){const expected=ref.glyphs[g],actual=resize(crop(m,boxes[g]),expected.width,expected.height);exactScores[g]=dice(expected,actual);scores[g]=tolerantDice(expected,actual,cfg.glyph_tolerance_radius_px);}
    const actualWord=resize(crop(m,union(boxes)),ref.wordmark.width,ref.wordmark.height),actualFile=path.join(out,`${p.id}-actual-normalized.png`),diffFile=path.join(out,`${p.id}-diff.png`),boardFile=path.join(out,`${p.id}-comparison-board.png`);await writeMask(actualWord,actualFile);await diffPng(ref.wordmark,actualWord,diffFile);const diffMask=await imageMask(diffFile);await board(ref.wordmark,actualWord,diffMask,boardFile,p.id.toUpperCase());
    const geo=geometry(boxes),mm=mismatch(ref.wordmark,actualWord),fail=[];for(const g of cfg.glyph_order)if(scores[g]<cfg.minimum_dice[g])fail.push(`${g} tolerant Dice ${scores[g].toFixed(4)} < ${cfg.minimum_dice[g]}`);if(geo.b_cap_deviation_ratio>cfg.maximum_baseline_deviation_ratio)fail.push('B cap mismatch');if(geo.b_baseline_deviation_ratio>cfg.maximum_baseline_deviation_ratio)fail.push('B baseline mismatch');if(geo.s_top_overshoot_ratio>cfg.maximum_s_overshoot_ratio||geo.s_bottom_overshoot_ratio>cfg.maximum_s_overshoot_ratio)fail.push('S optical overshoot too large');if(mm>cfg.maximum_normalized_pixel_mismatch_ratio)fail.push(`pixel mismatch ${mm.toFixed(4)}`);
    results.push({profile:p.id,computed_style:cap.style,glyph_tolerance_radius_px:cfg.glyph_tolerance_radius_px,glyph_dice:scores,glyph_exact_dice:exactScores,geometry:geo,normalized_pixel_mismatch_ratio:mm,failures:fail,artifacts:{actual:path.basename(cap.file),actual_normalized:path.basename(actualFile),diff:path.basename(diffFile),comparison_board:path.basename(boardFile)}});
  }}finally{await browser.close();}
  const failures=results.flatMap(r=>r.failures.map(f=>`${r.profile}: ${f}`)),packet={schema_version:'robys-logo-fidelity-result-v0.1',generated_at:new Date().toISOString(),reference:cfg.reference,source_identity:{head_sha:process.env.GITHUB_HEAD_SHA||process.env.GITHUB_SHA||'local',run_id:process.env.GITHUB_RUN_ID||null,run_attempt:process.env.GITHUB_RUN_ATTEMPT||null},verdict:failures.length?'FIDELITY_FAIL':'READY_FOR_HUMAN_REVIEW',results,failures,authority:cfg.authority};
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(packet,null,2)+'\n');const lines=["# Roby's logo fidelity audit v0.1",'',`**Verdict:** \`${packet.verdict}\`  `,`**Source head:** \`${packet.source_identity.head_sha}\`  `,`**Glyph tolerance:** \`${cfg.glyph_tolerance_radius_px}px on 64×64 masks\``,'' ,'| Profile | R | O | B | Y | S | Pixel mismatch | Result |','|---|---:|---:|---:|---:|---:|---:|---|',...results.map(r=>`| ${r.profile} | ${r.glyph_dice.R.toFixed(3)} | ${r.glyph_dice.O.toFixed(3)} | **${r.glyph_dice.B.toFixed(3)}** | ${r.glyph_dice.Y.toFixed(3)} | ${r.glyph_dice.S.toFixed(3)} | ${r.normalized_pixel_mismatch_ratio.toFixed(3)} | ${r.failures.length?'FAIL':'PASS'} |`),'', '> Exact Dice remains in result.json; the pass gate uses a symmetric 1px anti-alias tolerance plus strict baseline and full-wordmark mismatch checks.','', '> Evidence only; no merge or deployment authority.',''];await fs.writeFile(path.join(out,'summary.md'),lines.join('\n'));console.log(lines.join('\n'));if(failures.length)throw new Error(failures.join('\n'));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
