// Fail-closed local receipt loading. A missing or corrupt receipt MUST be
// assessed alongside a valid active counterpart so rollback is not missed.
import { openSync, closeSync, fstatSync, readSync, constants } from "node:fs";

export function readBounded(path,limit=64*1024) {
  if(typeof path!=="string" || !path || !Number.isSafeInteger(limit) ||
     limit<1 || limit>64*1024 || !constants.O_NOFOLLOW)
    throw Error("Invalid bounded file read");
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile() || stat.size<1 || stat.size>limit)
      throw Error("Invalid private assessment input");
    const data=Buffer.alloc(stat.size);
    let cursor=0;
    while(cursor<data.length) {
      const bytes=readSync(fd,data,cursor,data.length-cursor,cursor);
      if(bytes<=0)throw Error("Short private assessment input");
      cursor+=bytes;
    }
    if(fstatSync(fd).size!==stat.size)throw Error("Assessment input changed");
    return data.toString("utf8");
  } finally {closeSync(fd);}
}

// null is an intentionally *invalid* proof, not authorization; passing it
// to the existing decision guard preserves ROLLBACK_REQUIRED when the other
// host has independently proven that it is already active.
export function readHostReceipt(path) {
  try { return JSON.parse(readBounded(path)); } catch { return null; }
}
