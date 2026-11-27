import { createAssignment, createLedger } from "./revenue-engine.mjs";

function runContract(createAssignment,createLedger){
  const cases=[];const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error("expected "+JSON.stringify(b)+" received "+JSON.stringify(a));};
  const throws=fn=>{let failed=false;try{fn()}catch{failed=true}if(!failed)throw Error("expected rejection");};
  const test=(name,fn)=>{fn();cases.push(name);};
  const token=(i,b=0)=>(b?"ff":"00")+i.toString(16).padStart(30,"0");
  const mem=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}};
  const assign=(i,b=0)=>createAssignment({enabled:true,storage:mem(),randomToken:()=>token(i,b)})({eligible:true});
  const setup=()=>{const l=createLedger({enabled:true});const a=assign(1),b=assign(2,1);l.register(a);l.register(b);return {l,a,b};};
  const receipt=(a,over={})=>({orderToken:token(99),sessionToken:a.token,revision:1,status:"fulfilled_paid",cakeUnits:1,netRevenue:19000,variableCost:9500,...over});
  test("disabled never touches storage or RNG",()=>eq(createAssignment()({eligible:true}),{status:"disabled"}));
  test("disabled ledger rejects all writes",()=>{const l=createLedger();eq(l.register({}),"disabled");eq(l.stage("",""),"disabled");eq(l.reconcile({}),"disabled");eq(l.snapshot().A.assigned,0)});
  test("ineligible session not assigned",()=>eq(createAssignment({enabled:true,storage:mem(),randomToken:()=>{throw Error("RNG")}})(),{status:"ineligible"}));
  test("blocked reads fail closed",()=>eq(createAssignment({enabled:true,storage:{getItem(){throw Error("blocked")}}})({eligible:true}),{status:"unavailable"}));
  test("blocked writes fail closed",()=>eq(createAssignment({enabled:true,storage:{getItem:()=>null,setItem(){throw Error("blocked")}},randomToken:()=>token(1)})({eligible:true}),{status:"unavailable"}));
  test("silent failed writes fail closed",()=>eq(createAssignment({enabled:true,storage:{getItem:()=>null,setItem(){}},randomToken:()=>token(1)})({eligible:true}),{status:"unavailable"}));
  test("corrupt assignment fails closed",()=>eq(createAssignment({enabled:true,storage:{getItem:()=>"{bad"}})({eligible:true}),{status:"unavailable"}));
  test("invalid token fails closed",()=>eq(createAssignment({enabled:true,storage:mem(),randomToken:()=>"email@example.com"})({eligible:true}),{status:"unavailable"}));
  test("reload / view / locale preserve assignment and ITT",()=>{const s=mem();const a=createAssignment({enabled:true,storage:s,randomToken:()=>token(2,1)})({eligible:true});const b=createAssignment({enabled:true,storage:s,randomToken:()=>{throw Error("new token")}})({eligible:false,view:"grid",locale:"ru"});eq(a,b)});
  test("all 256 first-byte values split exactly 128/128",()=>{const counts={A:0,B:0};for(let i=0;i<256;i++){const a=createAssignment({enabled:true,storage:mem(),randomToken:()=>i.toString(16).padStart(2,"0")+"0".repeat(30)})({eligible:true});counts[a.arm]++;}eq(counts,{A:128,B:128})});
  test("registration idempotent and arm tampering rejected",()=>{const {l,a}=setup();eq(l.register(a),"duplicate");throws(()=>l.register({...a,arm:"B"}));eq(l.snapshot().A.assigned,1)});
  test("unique stages and control isolation",()=>{const {l,a,b}=setup();eq(l.stage(a.token,"exposure"),"accepted");eq(l.stage(a.token,"exposure"),"duplicate");throws(()=>l.stage(a.token,"story_completed"));eq(l.stage(b.token,"story_completed"),"accepted");eq(l.snapshot().A.exposure,1)});
  test("QR and pending never become paid conversion",()=>{const {l,a}=setup();l.stage(a.token,"qr_created");l.reconcile(receipt(a,{status:"pending",cakeUnits:0,netRevenue:0,variableCost:0}));eq(l.snapshot().A.paidSessions,0);eq(l.snapshot().A.netRevenue,0)});
  test("receipt duplicate and older revision ignored",()=>{const {l,a}=setup();const r=receipt(a,{revision:2});eq(l.reconcile(r),"accepted");eq(l.reconcile(r),"duplicate");eq(l.reconcile({...r,revision:1}),"stale");eq(l.snapshot().A.cakeUnits,1)});
  test("revision conflict rejected",()=>{const {l,a}=setup();const r=receipt(a);l.reconcile(r);throws(()=>l.reconcile({...r,netRevenue:20000}));eq(l.snapshot().A.netRevenue,19000)});
  test("cross-session ownership rejected",()=>{const {l,a,b}=setup();l.reconcile(receipt(a));throws(()=>l.reconcile(receipt(b,{revision:2})));eq(l.snapshot().B.paidSessions,0)});
  test("multiple orders count one converted session",()=>{const {l,a}=setup();l.reconcile(receipt(a));l.reconcile(receipt(a,{orderToken:token(100)}));eq(l.snapshot().A.paidSessions,1);eq(l.snapshot().A.cakeUnits,2);eq(l.snapshot().A.netRevenue,38000)});
  test("full refund removes conversion and retains costs",()=>{const {l,a}=setup();l.reconcile(receipt(a));l.reconcile(receipt(a,{revision:2,status:"refunded",cakeUnits:0,netRevenue:0}));const s=l.snapshot().A;eq([s.paidSessions,s.cakeUnits,s.netRevenue,s.contribution],[0,0,0,-9500])});
  test("partial refund recomputes from latest revision",()=>{const {l,a}=setup();l.reconcile(receipt(a,{cakeUnits:2,netRevenue:38000,variableCost:19000}));l.reconcile(receipt(a,{revision:2,cakeUnits:1,netRevenue:19000,variableCost:19000}));const s=l.snapshot().A;eq([s.paidSessions,s.cakeUnits,s.contribution],[1,1,0])});
  test("non-cake basket included in contribution not conversion",()=>{const {l,a}=setup();l.reconcile(receipt(a,{cakeUnits:0,netRevenue:10000,variableCost:3000}));const s=l.snapshot().A;eq([s.paidSessions,s.contribution],[0,7000])});
  test("cancelled order cannot resurrect",()=>{const {l,a}=setup();l.reconcile(receipt(a,{status:"cancelled",cakeUnits:0,netRevenue:0,variableCost:1000}));throws(()=>l.reconcile(receipt(a,{revision:2})));eq(l.snapshot().A.contribution,-1000)});
  test("invalid money and unknown session rejected",()=>{const {l,a}=setup();for(const n of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])throws(()=>l.reconcile(receipt(a,{netRevenue:n})));throws(()=>l.reconcile(receipt(a,{sessionToken:token(888)})));eq(l.snapshot().A.netRevenue,0)});
  test("unassigned and treatment-free sessions retained in denominator",()=>{const {l,a}=setup();l.register(assign(3));l.reconcile(receipt(a));eq(l.snapshot().A.paidConversion,.5);eq(l.snapshot().B.paidConversion,0);eq(createLedger().snapshot().A.paidConversion,null)});
  test("snapshots are independent and expose no tokens",()=>{const {l,a}=setup();l.reconcile(receipt(a));const s=l.snapshot();s.A.assigned=100;eq(l.snapshot().A.assigned,1);if(JSON.stringify(l.snapshot()).includes(a.token))throw Error("token leak")});
  test("synthetic 1000 per arm: 5% vs 6.5%, integer reconciliation",()=>{const l=createLedger({enabled:true});for(let i=1;i<=1000;i++)for(let b=0;b<2;b++){const a=assign(i,b);l.register(a);if(i<=(b?65:50)){const r=receipt(a,{orderToken:token(i+10000,b)});l.reconcile(r);l.reconcile(r);}}const s=l.snapshot();eq([s.A.assigned,s.B.assigned,s.A.paidConversion,s.B.paidConversion,s.B.netRevenue-s.A.netRevenue,s.B.contribution-s.A.contribution],[1000,1000,.05,.065,285000,142500]);});
  return cases;
}

const cases=runContract(createAssignment,createLedger);
console.log(JSON.stringify({passed:cases.length,cases},null,2));
