import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=process.cwd();
const MIN_FILE_BYTES=20_000;
const MAX_FILE_BYTES=1024*1024;
const MAX_DURATION_SECONDS=8;
const MAX_EDGE_PIXELS=1280;
const MAX_PIXEL_AREA=1280*720;

function decodeHtmlAttribute(value){return value.replace(/&amp;/gi,'&').replace(/&#0*38;/gi,'&').replace(/&#x0*26;/gi,'&')}
function cleanReference(reference){return decodeURIComponent(decodeHtmlAttribute(reference).split(/[?#]/)[0])}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=join(dir,e.name);return e.isDirectory()?walk(p):[p]})}
function repoPath(p){return relative(ROOT,p).split(sep).join('/')}
function boxesOf(buffer){
  const boxes=[];let offset=0;
  while(offset<buffer.length){
    if(offset+8>buffer.length)throw new Error(`Truncated MP4 header at ${offset}`);
    let size=buffer.readUInt32BE(offset);const type=buffer.toString('ascii',offset+4,offset+8);let header=8;
    if(size===1){if(offset+16>buffer.length)throw new Error(`Truncated extended box ${type}`);const big=buffer.readBigUInt64BE(offset+8);if(big>BigInt(Number.MAX_SAFE_INTEGER))throw new Error(`Box ${type} too large`);size=Number(big);header=16}
    else if(size===0)size=buffer.length-offset;
    if(size<header||offset+size>buffer.length)throw new Error(`Invalid MP4 box ${type} at ${offset}`);
    boxes.push({type,size,payloadSize:size-header});offset+=size;
  }
  return boxes;
}

const indexHtml=readFileSync(join(ROOT,'index.html'),'utf8');
const activeSource=indexHtml.match(/<video\b[^>]*\bclass=["'][^"']*\bhero-video\b[^"']*["'][^>]*>[\s\S]*?<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
if(!activeSource)throw new Error('Active .hero-video MP4 source is missing from index.html');
const ACTIVE_HERO_VIDEO=cleanReference(activeSource);
if(!ACTIVE_HERO_VIDEO.toLowerCase().endsWith('.mp4'))throw new Error(`Active hero source must be an MP4: ${ACTIVE_HERO_VIDEO}`);

const qaRuntime=readFileSync(join(ROOT,'qa.js'),'utf8');
const runtimeSource=qaRuntime.match(/\bHERO_VIDEO\s*=\s*["']([^"']+)["']/)?.[1];
if(!runtimeSource)throw new Error('HERO_VIDEO is missing from qa.js');
const runtimeHeroVideo=cleanReference(runtimeSource);
if(runtimeHeroVideo!==ACTIVE_HERO_VIDEO)throw new Error(`Hero source drift: index.html=${ACTIVE_HERO_VIDEO}, qa.js=${runtimeHeroVideo}`);

const requestedVideo=process.argv[2]??process.env.HERO_VIDEO_PATH??ACTIVE_HERO_VIDEO;
const HERO_VIDEO=cleanReference(requestedVideo);
const sourceFiles=walk(join(ROOT,'src')).map(repoPath);
const forbidden=sourceFiles.filter(p=>p==='src/hero-video-data.bin'||p==='src/hero-video.ts'||p.startsWith('src/hero-video-hex/')||p.startsWith('src/hero-video-parts/')||/hero-video.*\.(?:bin|hex|b64)$/i.test(p));
if(statSync(join(ROOT,'hero-video.js'),{throwIfNoEntry:false}))forbidden.push('hero-video.js');
if(forbidden.length)throw new Error(`Forbidden text/chunk video artifacts:\n${forbidden.sort().map(p=>`- ${p}`).join('\n')}`);

const absoluteVideo=resolve(ROOT,HERO_VIDEO);const relativeVideo=relative(ROOT,absoluteVideo);
if(relativeVideo==='..'||relativeVideo.startsWith(`..${sep}`))throw new Error(`Hero path must stay inside repository: ${HERO_VIDEO}`);
if(!statSync(absoluteVideo,{throwIfNoEntry:false})?.isFile())throw new Error(`Hero video not found: ${HERO_VIDEO}`);
const bytes=readFileSync(absoluteVideo);
if(bytes.length<MIN_FILE_BYTES)throw new Error(`${HERO_VIDEO} is suspiciously small: ${bytes.length}`);
if(bytes.length>MAX_FILE_BYTES)throw new Error(`${HERO_VIDEO} exceeds ${MAX_FILE_BYTES} bytes: ${bytes.length}`);
const boxes=boxesOf(bytes);
for(const type of ['ftyp','moov','mdat'])if(!boxes.some(box=>box.type===type))throw new Error(`${HERO_VIDEO} is missing top-level box ${type}`);
const mdatPayloadBytes=boxes.filter(box=>box.type==='mdat').reduce((sum,box)=>sum+box.payloadSize,0);
if(mdatPayloadBytes<=0)throw new Error(`${HERO_VIDEO} has an empty mdat payload`);

const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=index,codec_type,codec_name,width,height','-show_entries','format=format_name,duration,size','-of','json',absoluteVideo],{encoding:'utf8'});
if(probe.error)throw probe.error;if(probe.status!==0)throw new Error(`ffprobe failed (${probe.status}): ${probe.stderr.trim()}`);
const metadata=JSON.parse(probe.stdout);const streams=metadata.streams??[];
const videoStreams=streams.filter(s=>s.codec_type==='video');const audioStreams=streams.filter(s=>s.codec_type==='audio');
if(videoStreams.length!==1)throw new Error(`${HERO_VIDEO} must contain exactly one video stream; found ${videoStreams.length}`);
if(audioStreams.length)throw new Error(`${HERO_VIDEO} must not contain audio; found ${audioStreams.length}`);
const stream=videoStreams[0];
if(stream.codec_name!=='h264')throw new Error(`${HERO_VIDEO} must use H.264; found ${stream.codec_name??'unknown'}`);
if(!Number.isFinite(stream.width)||!Number.isInteger(stream.width)||stream.width<=0||!Number.isFinite(stream.height)||!Number.isInteger(stream.height)||stream.height<=0)throw new Error(`${HERO_VIDEO} has invalid dimensions`);
const longestEdge=Math.max(stream.width,stream.height);const pixelArea=stream.width*stream.height;
if(longestEdge>MAX_EDGE_PIXELS||pixelArea>MAX_PIXEL_AREA)throw new Error(`${HERO_VIDEO} exceeds the 720p portrait/landscape budget: ${stream.width}x${stream.height}`);
const duration=Number(metadata.format?.duration);if(!Number.isFinite(duration)||duration<1)throw new Error(`${HERO_VIDEO} has invalid duration`);
if(duration>MAX_DURATION_SECONDS)throw new Error(`${HERO_VIDEO} exceeds ${MAX_DURATION_SECONDS}s: ${duration}s`);
const reportedSize=Number(metadata.format?.size);
if(!Number.isSafeInteger(reportedSize)||reportedSize<=0)throw new Error(`${HERO_VIDEO} ffprobe did not report a valid format.size`);
if(reportedSize!==bytes.length)throw new Error(`${HERO_VIDEO} ffprobe size mismatch: ${reportedSize} != ${bytes.length}`);
console.log(JSON.stringify({file:repoPath(absoluteVideo),activeHeroVideo:ACTIVE_HERO_VIDEO,bytes:bytes.length,maxBytes:MAX_FILE_BYTES,duration,maxDurationSeconds:MAX_DURATION_SECONDS,codec:stream.codec_name,width:stream.width,height:stream.height,maxEdgePixels:MAX_EDGE_PIXELS,maxPixelArea:MAX_PIXEL_AREA,videoStreams:1,audioStreams:0,boxes:{ftyp:true,moov:true,mdat:true,mdatPayloadBytes}},null,2));
