import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {run} from "./profit-graph.mjs";
const old=readFileSync(new URL("../../qa/evidence/dessert-004/scenarios.csv",import.meta.url),"utf8").trim().split("\n").slice(1).map(l=>Number(l.split(",")[1]));
if(old.length!==1000||new Set(old).size!==1000)throw Error("prior seeds");
const r=run(old);const dir=new URL("../../qa/evidence/dessert-005/",import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(new URL("scenarios.jsonl",dir),r.rows.map(row=>JSON.stringify(row)).join("\n")+"\n");
writeFileSync(new URL("results.json",dir),JSON.stringify({summary:r.summary,stress:r.stress},null,2)+"\n");
console.log(JSON.stringify({summary:r.summary,stressPassed:r.stress.length},null,2));
