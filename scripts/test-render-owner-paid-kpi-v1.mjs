import test from "node:test";
import assert from "node:assert/strict";
import { renderOwnerPaidKpiHtml } from "./render-owner-paid-kpi-v1.mjs";
const report={schemaVersion:"robys.counter-paid-kpi.v1",authority:"cashier-acknowledged-and-audited",currency:"TRY",
 fromMs:1794300000000,toMs:1794400000000,paidOrders:2,grossMinor:48000,averageMinor:24000,
 byDay:[{day:"2026-11-11",paidOrders:2,grossMinor:48000}],attributionCoverage:null};
test("renders a self-contained accessible owner report without active scripts",()=>{
 for(const language of ["tr","en","ru"]) {
  const html=renderOwnerPaidKpiHtml(report,language);
  assert(html.includes('<html lang="'+language+'">'));
  assert(html.includes("2026-11-11"));
  assert(html.includes("48"));
  assert(!/<script|https?:\/\/|fetch\(/i.test(html));
  assert(html.includes("noindex,nofollow"));
 }
});
test("renders honest zero-data state without placeholder revenue",()=>{
 const empty={...report,paidOrders:0,grossMinor:0,averageMinor:null,byDay:[]};
 assert.match(renderOwnerPaidKpiHtml(empty,"ru"),/За период нет подтверждённых оплат/);
});
test("rejects invented, inconsistent or unsafe financial totals",()=>{
 assert.throws(()=>renderOwnerPaidKpiHtml({...report,paidOrders:3}),/Invalid/);
 assert.throws(()=>renderOwnerPaidKpiHtml({...report,grossMinor:50000}),/Invalid/);
 assert.throws(()=>renderOwnerPaidKpiHtml({...report,authority:"simulated"}),/Invalid/);
 assert.throws(()=>renderOwnerPaidKpiHtml(report,"de"),/Unsupported/);
});
