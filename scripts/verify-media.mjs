import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=process.cwd();
const HERO_VIDEO=process.argv[2]??process.env.HERO_VIDEO_PATH??'src/robys-hero-mobile-lite.mp4';
const MIN_FILE_BYTES=20_000;
const MAX_FILE_BYTES=250*1024;

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
if(!Number.isInteger(stream.width)||stream.width<=0||!Number.isInteger(stream.height)||stream.height<=0)throw new Error(`${HERO_VIDEO} has invalid dimensions`);
const duration=Number(metadata.format?.duration);if(!Number.isFinite(duration)||duration<1)throw new Error(`${HERO_VIDEO} has invalid duration`);
console.log(JSON.stringify({file:repoPath(absoluteVideo),bytes:bytes.length,maxBytes:MAX_FILE_BYTES,duration,codec:stream.codec_name,width:stream.width,height:stream.height,videoStreams:1,audioStreams:0,boxes:{ftyp:true,moov:true,mdat:true,mdatPayloadBytes}},null,2));
