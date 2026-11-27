import {writeFileSync} from "node:fs";
import {run} from "./adaptive-simulator.mjs";
const r=run();
const keys=Object.keys(r.rows[0]);
writeFileSync(new URL("./scenarios.csv",import.meta.url),keys.join(",")+"\n"+r.rows.map(row=>keys.map(k=>row[k]).join(",")).join("\n")+"\n");
writeFileSync(new URL("./results.json",import.meta.url),JSON.stringify({masterSeed:r.masterSeed,summary:r.summary,stress:r.stress},null,2)+"\n");
console.log(JSON.stringify({summary:r.summary,stressPassed:r.stress.length},null,2));
