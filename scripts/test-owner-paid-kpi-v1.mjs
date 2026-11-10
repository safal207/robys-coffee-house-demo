import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync,rmSync,mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportVerifiedPayments, PAID_REPORT_SCHEMA_VERSION } from "./owner-paid-kpi-v1.mjs";
const anchor=Date.parse("2026-11-10T22:30:00.000Z");
function fixture(t) {
 const dir=mkdtempSync(join(tmpdir(),"robys-paid-report-")),path=join(dir,"private.sqlite");
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const db=new DatabaseSync(path);
 db.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY, paid_at INTEGER, total_minor INTEGER);
 CREATE TABLE audit (order_id TEXT, action TEXT);`);
 const insert=db.prepare("INSERT INTO orders(id,paid_at,total_minor) VALUES(?,?,?)");
 insert.run("paid-a",anchor,37000); insert.run("paid-b",anchor+3600000,11000);
 insert.run("unpaid",null,99900); insert.run("forged",anchor,990000);
 db.prepare("INSERT INTO audit(order_id,action) VALUES(?,?)").run("paid-a","pay");
 db.prepare("INSERT INTO audit(order_id,action) VALUES(?,?)").run("paid-b","pay");
 db.prepare("INSERT INTO audit(order_id,action) VALUES(?,?)").run("forged","create");
 db.close();
 return path;
}
test("reports only audited payments; never infers UTM sales",t=>{
 const path=fixture(t);
 const result=reportVerifiedPayments(path,{fromMs:anchor-1000,toMs:anchor+7200000});
 assert.equal(result.schemaVersion,PAID_REPORT_SCHEMA_VERSION);
 assert.equal(result.paidOrders,2);assert.equal(result.grossMinor,48000);
 assert.equal(result.averageMinor,24000); assert.equal(result.attributionCoverage,null);
 assert.deepEqual(result.byDay,[
   {day:"2026-11-11",paidOrders:2,grossMinor:48000}]);
 assert.equal(result.authority,"cashier-acknowledged-and-audited");
});
test("date boundaries and guardrails prevent unbounded reporting",t=>{
 const path=fixture(t);
 assert.equal(reportVerifiedPayments(path,{fromMs:anchor+1,toMs:anchor+7200000}).paidOrders,1);
 const empty=reportVerifiedPayments(path,{fromMs:anchor-7200000,toMs:anchor-1});
 assert.equal(empty.paidOrders,0);assert.equal(empty.averageMinor,null);assert.deepEqual(empty.byDay,[]);
 assert.throws(()=>reportVerifiedPayments(path,{fromMs:0,toMs:anchor}),/Invalid/);
 assert.throws(()=>reportVerifiedPayments(path,{fromMs:anchor+1000,toMs:anchor}),/Invalid/);
 assert.throws(()=>reportVerifiedPayments(path,{fromMs:anchor-366*86400000,toMs:anchor+86400000}),/Invalid/);
});
