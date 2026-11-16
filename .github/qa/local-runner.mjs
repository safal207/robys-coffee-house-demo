import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const allowed = ["counter-contracts", "menu-feed-browser", "source-contracts"];
const shaPattern = /^[a-f0-9]{40}$/;
const gitHead = () => execFileSync("git", ["rev-parse","HEAD"], {cwd:root,encoding:"utf8"}).trim();

async function execute(check, head) {
  const dir = resolve(root, ".artifacts/qa-workbench", randomBytes(12).toString("hex"));
  mkdirSync(dir,{recursive:true});
  const child = spawn(process.execPath, ["scripts/causal-regression.mjs","run-check","--check",check,"--head",head,"--output",dir],
    {cwd:root,stdio:"ignore",shell:false});
  const code = await new Promise((resolveResult,reject) => {
    child.once("error",reject); child.once("close",resolveResult);
  });
  const receipt = JSON.parse(readFileSync(resolve(dir,"receipt-"+check+".json"),"utf8"));
  if (receipt.checkId !== check || receipt.source?.revision !== head) throw Error("Receipt identity mismatch");
  const status = code === 0 && receipt.complete === true && receipt.source.dirty === false && receipt.status === "PASS" ? "PASS"
    : receipt.status === "INCOMPLETE" ? "INCOMPLETE" : "FAIL";
  return {check,head,status,registrySha256:receipt.registrySha256,durationMs:receipt.durationMs,artifact:dir.slice(root.length).replace(/^[/\\]/,"")};
}

// Loopback only. No shell, arbitrary command/path, CORS, or remote binding.
// The existing causal runner owns command timeout, log and clean-head checks.
export function createWorkbenchServer({ getHead=gitHead, run=execute }={}) {
  const token=randomBytes(32).toString("hex"); let busy=false;
  const server=createServer(async(req,res)=>{
    const address=server.address(), host="127.0.0.1:"+address.port, origin="http://"+host;
    res.setHeader("Cache-Control","no-store"); res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const json=(status,obj)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(obj));};
    if(req.headers.host!==host) return json(403,{error:"host"});
    if(req.method==="GET"&&req.url==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});return res.end(readFileSync(new URL("./state-workbench.html",import.meta.url)));}
    if(req.method==="GET"&&req.url==="/api/graph"){
      res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
      return res.end(readFileSync(resolve(root,"qa/causal-regression-graph.json")));
    }
    if(req.method==="GET"&&req.url==="/api/config") return json(200,{head:getHead(),token,allowed});
    if(req.method!=="POST"||req.url!=="/api/run") return json(404,{error:"not_found"});
    if(req.headers.origin!==origin||req.headers["x-qa-token"]!==token) return json(403,{error:"origin_or_token"});
    if(req.headers["content-type"]!=="application/json") return json(415,{error:"content_type"});
    if(busy) return json(409,{error:"already_running"});
    let size=0,body="";
    try {
      for await(const chunk of req){size+=chunk.length;if(size>1024){return json(413,{error:"body_limit"});}body+=chunk.toString("utf8");}
      const data=JSON.parse(body);
      if(!data||Object.keys(data).sort().join(",")!=="check,head"||!allowed.includes(data.check)||!shaPattern.test(data.head)) return json(400,{error:"invalid_selection"});
      if(data.head!==getHead()) return json(409,{error:"stale_head"});
      if(busy) return json(409,{error:"already_running"});
      busy=true;
      try {const result=await run(data.check,data.head);return json(200,result);}
      finally{busy=false;}
    } catch {return json(500,{error:"execution_or_input_error"});}
  });
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.platform!=="linux") throw Error("Use Linux/WSL; causal evidence runner requires Linux process and file semantics");
  const server=createWorkbenchServer();
  server.listen(0,"127.0.0.1",()=>console.log("Robys QA Workbench: http://127.0.0.1:"+server.address().port));
}
