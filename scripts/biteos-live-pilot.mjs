import {createServer} from "node:http";
import {readFileSync,realpathSync} from "node:fs";
import {readFile,realpath,stat} from "node:fs/promises";
import {resolve,sep,extname} from "node:path";
import {pathToFileURL} from "node:url";
import {compileMenuRuntime} from "./menu-runtime-source.mjs";
import {patchFeed} from "./biteos-pilot-patch.mjs";

export function createPilotServer(root=process.cwd()){
 root=realpathSync(root);
 if(root!==realpathSync(process.cwd()))throw Error("Run from Robys checkout root");
 const manifest=JSON.parse(readFileSync(resolve(root,"integrity-manifest.json"),"utf8"));
 const publicFiles=new Set(manifest.files.map(e=>e.path).filter(p=>typeof p==="string"&&!p.startsWith(".")&&!/^(counter|scripts|docs|qa|node_modules)\//.test(p)&&!p.includes("\\")&&p.split("/").every(s=>s&&s!==".."&&!s.startsWith("."))));
 const patched=compileMenuRuntime(patchFeed(readFileSync(resolve(root,"src/menu-feed.js"),"utf8")));
 const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".webp":"image/webp",".avif":"image/avif",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".svg":"image/svg+xml",".woff2":"font/woff2",".mp4":"video/mp4",".webm":"video/webm",".webmanifest":"application/manifest+json"};
 const server=createServer(async(req,res)=>{
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
  try{
   if(req.headers.host!=="127.0.0.1:"+server.address().port||!["GET","HEAD"].includes(req.method)){res.writeHead(403).end();return}
   let u=new URL(req.url,"http://127.0.0.1");if(u.origin!=="http://127.0.0.1"){res.writeHead(403).end();return}
   let name=decodeURIComponent(u.pathname.slice(1))||"menu-feed.html";
   if(name==="sw.js"||name==="counter-config.json"||name.startsWith("api/")){res.writeHead(404).end();return}
   if(!publicFiles.has(name)){res.writeHead(404).end();return}
   let bytes;if(name==="menu-feed.js")bytes=Buffer.from(patched);
   else{const file=resolve(root,name);if(!file.startsWith(root+sep)||await realpath(file)!==file||!(await stat(file)).isFile()){res.writeHead(404).end();return}bytes=await readFile(file)}
   res.writeHead(200,{"Content-Type":mime[extname(name)]??"application/octet-stream","Content-Length":bytes.length});res.end(req.method==="HEAD"?undefined:bytes);
  }catch{if(!res.headersSent)res.writeHead(404);res.end()}
 });
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const server=createPilotServer();server.listen(8789,"127.0.0.1",()=>console.log("Local-only Robys pilot: http://127.0.0.1:8789/menu-feed.html?lang=en&utm_source=instagram&utm_medium=social&utm_campaign=story"));
}
