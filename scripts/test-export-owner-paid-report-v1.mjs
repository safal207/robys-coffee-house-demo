import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync,readFileSync,statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { exportOwnerPaidReport } from "./export-owner-paid-report-v1.mjs";

test("exports a private read-only report from actual audit-confirmed Counter rows",t=>{
 const dir=mkdtempSync(join(tmpdir(),"robys-owner-export-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const dbPath=join(dir,"counter.sqlite"), outputPath=join(dir,"report.html");
 const db=new DatabaseSync(dbPath);
 db.exec("CREATE TABLE orders(id TEXT,paid_at INTEGER,total_minor INTEGER); CREATE TABLE audit(order_id TEXT, action TEXT)");
 const paid=Date.parse("2026-11-10T10:00:00Z");
 db.prepare("INSERT INTO orders VALUES(?,?,?)").run("order-1",paid,37000);
 db.prepare("INSERT INTO orders VALUES(?,?,?)").run("order-2",null,80000);
 db.prepare("INSERT INTO audit VALUES(?,?)").run("order-1","pay");
 db.close();
 const result=exportOwnerPaidReport({dbPath,fromMs:paid-1000,toMs:paid+1000,language:"tr",outputPath});
 assert.equal(result.paidOrders,1);
 const html=readFileSync(outputPath,"utf8");
 assert(html.includes("2026-11-10"));
 assert(html.includes("370"));
 assert(!/<script|https?:\/\//i.test(html));
 if(process.platform!=="win32")assert.equal(statSync(outputPath).mode&0o777,0o600);
 assert.throws(()=>exportOwnerPaidReport({dbPath,fromMs:paid-1000,toMs:paid+1000,outputPath}),/EEXIST/);
 assert.throws(()=>exportOwnerPaidReport({dbPath,fromMs:paid-1000,toMs:paid+1000,outputPath:join(dir,"report.txt")}),/Explicit/);
});
