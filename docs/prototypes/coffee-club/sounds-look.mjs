// Explicit device-local appearance preference. No automatic writes or activity journal.
import {moods,musicStyles,layouts} from "./sounds-model.mjs";
export const preferenceKey="robys-sounds-look-v1";
export const ttl=30*86400000;
export const defaultLook=Object.freeze({mood:"morning",music:"auto",layout:"classic"});
const exact=(o,keys)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const validLook=o=>exact(o,["mood","music","layout"])&&moods.some(m=>m.id===o.mood)&&musicStyles.some(m=>m.id===o.music)&&layouts.some(l=>l.id===o.layout);
const clock=n=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER-ttl;
export function readLook(raw,now){
 if(!clock(now)||typeof raw!=="string"||raw.length>512)return null;
 try{
  const r=JSON.parse(raw);
  if(!exact(r,["schema","savedAt","look"])||r.schema!=="robys.sounds-look.v1"||!clock(r.savedAt)||r.savedAt>now||now-r.savedAt>=ttl||!validLook(r.look))return null;
  return {...r.look};
 }catch{return null}
}
export function encodeLook(look,now){
 if(!clock(now)||!validLook(look))throw Error("Invalid saved look");
 return JSON.stringify({schema:"robys.sounds-look.v1",savedAt:now,look:{...look}});
}
export function createLookStore(getStorage,now=()=>Date.now()){
 return {
  load(){try{return {ok:true,look:readLook(getStorage().getItem(preferenceKey),now())}}catch{return {ok:false,look:null}}},
  save(look){try{getStorage().setItem(preferenceKey,encodeLook(look,now()));return true}catch{return false}},
  forget(){try{getStorage().removeItem(preferenceKey);return true}catch{return false}}
 };
}
