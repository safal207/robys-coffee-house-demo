// Offline paired Monte Carlo. All monetary values in integer kurus.
export function rng(seed) {
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

export function sampleScenario(seed){
  const r=rng(seed),u=(a,b)=>a+(b-a)*r(),i=(a,b)=>Math.floor(u(a,b+1));
  const cakeA=u(.02,.12),otherA=u(.08,.30),effect=u(-.35,.70),cakeB=Math.max(0,cakeA*(1+effect)),substitution=u(0,1);
  return {n:i(400,3000),cakeA,cakeB,otherA,otherB:Math.max(0,otherA-(cakeB-cakeA)*substitution),
    cakePrice:19000,cakeCost:i(6500,17000),otherPrice:i(10000,24000),otherCostRatio:u(.3,.8),
    refundA:u(0,.12),refundB:0,otherRefund:u(0,.10),storyCost:i(0,150),fixedCost:i(0,15000),substitution,effect,refundShift:u(-.025,.07)};
}

export function prepare(s){
  const p={...s};
  if("refundShift" in p)p.refundB=Math.max(0,Math.min(1,p.refundA+p.refundShift));
  p.otherCost=Math.round(p.otherPrice*p.otherCostRatio);
  const probs=["cakeA","cakeB","otherA","otherB","refundA","refundB","otherRefund"];
  const amounts=["cakePrice","cakeCost","otherPrice","otherCost","storyCost","fixedCost"];
  if(!Number.isSafeInteger(p.n)||p.n<0||p.n>100000||probs.some(k=>!Number.isFinite(p[k])||p[k]<0||p[k]>1)||p.cakeA+p.otherA>1||p.cakeB+p.otherB>1||amounts.some(k=>!Number.isSafeInteger(p[k])||p[k]<0||p[k]>100000000))throw Error("invalid scenario");
  return p;
}

export function outcome(p,arm,u,v){
  const b=arm==="B",pc=b?p.cakeB:p.cakeA,po=b?p.otherB:p.otherA;
  const cake=u<pc,other=!cake&&u<pc+po;
  const sold=cake||other,refund=sold&&v<(cake?(b?p.refundB:p.refundA):p.otherRefund);
  const gross=cake?p.cakePrice:other?p.otherPrice:0;
  const cost=cake?p.cakeCost:other?p.otherCost:0;
  const net=refund?0:gross, fee=b?p.storyCost:0;
  return {cake: cake&&!refund?1:0,other:other&&!refund?1:0,orders:sold?1:0,refunds:refund?1:0,paid:sold&&!refund?1:0,gross,refundAmount:refund?gross:0,net,cost,fee,margin:net-cost-fee,b:b?1:0};
}

export function choose(stats){
  if(stats.A.n<30||stats.B.n<30)return {arm:"A",reason:"insufficient",lower:null};
  const mean=s=>s.sum/s.n,variance=s=>Math.max(0,(s.sq-s.sum*s.sum/s.n)/(s.n-1));
  const delta=mean(stats.B)-mean(stats.A);
  const lower=delta-1.645*Math.sqrt(variance(stats.A)/stats.A.n+variance(stats.B)/stats.B.n);
  return {arm:lower>0?"B":"A",reason:lower>0?"positive_lower_bound":"risk_guard",lower};
}

export function simulate(input,seed){
  const p=prepare(input),r=rng(seed);
  const init=()=>({n:0,cake:0,other:0,orders:0,refunds:0,paid:0,gross:0,refundAmount:0,net:0,cost:0,fee:0,margin:0,b:0,fixed:0});
  const totals={A:init(),B:init(),adaptive:init()},stats={A:{n:0,sum:0,sq:0},B:{n:0,sum:0,sq:0}};
  const pilot=Math.min(p.n,2*Math.floor(p.n*.2)); // 40%, even; balanced randomized pairs
  const add=(t,o)=>{t.n++;for(const k of Object.keys(o))t[k]+=o[k];};
  let decision={arm:"A",reason:"insufficient",lower:null},pairFirst="A";
  for(let j=0;j<p.n;j++){
    if(j===pilot)decision=choose(stats);
    if(j%2===0)pairFirst=r()<.5?"A":"B";
    const u=r(),v=r(),a=outcome(p,"A",u,v),b=outcome(p,"B",u,v);
    add(totals.A,a);add(totals.B,b);
    const arm=j<pilot?(j%2===0?pairFirst:pairFirst==="A"?"B":"A"):decision.arm;
    const o=arm==="A"?a:b;
    add(totals.adaptive,o);
    if(j<pilot){const s=stats[arm];s.n++;s.sum+=o.margin;s.sq+=o.margin*o.margin;}
  }
  if(p.n===pilot)decision=choose(stats);
  for(const t of Object.values(totals)){t.fixed=t.b?p.fixedCost:0;t.margin-=t.fixed;}
  return {p,pilot,stats,decision,totals};
}

export function validate(result){
  const {p,totals,pilot,stats,decision}=result;
  const ok=(x,m)=>{if(!x)throw Error(m)};
  for(const t of Object.values(totals)){
    ok(Object.values(t).every(Number.isSafeInteger),"integer money/count");
    ok(t.n===p.n&&t.b>=0&&t.b<=t.n,"session conservation");
    ok(t.orders===t.paid+t.refunds&&t.paid===t.cake+t.other&&t.orders<=t.n,"order conservation");
    ok(t.gross===t.net+t.refundAmount&&t.net===t.cake*p.cakePrice+t.other*p.otherPrice,"revenue conservation");
    ok(t.margin===t.net-t.cost-t.fee-t.fixed&&t.fee===t.b*p.storyCost&&t.fixed===(t.b?p.fixedCost:0),"contribution identity");
    ok(t.net>=0&&t.cost>=0&&t.gross>=t.net&&t.refundAmount>=0,"nonnegative financial fields");
  }
  ok(totals.A.b===0&&totals.B.b===p.n,"control isolation");
  ok(stats.A.n===pilot/2&&stats.B.n===pilot/2,"balanced pilot");
  ok(totals.adaptive.b===pilot/2+(decision.arm==="B"?p.n-pilot:0),"adaptive decision exposure");
  ok(JSON.stringify(decision)===JSON.stringify(choose(stats)),"no future decision input");
  return true;
}

export function stress(){
 const base={n:1000,cakeA:.05,cakeB:.065,otherA:.2,otherB:.185,cakePrice:19000,cakeCost:9500,otherPrice:20000,otherCostRatio:.4,refundA:0,refundB:0,otherRefund:0,storyCost:0,fixedCost:0};
 const out=[],check=(x,m)=>{if(!x)throw Error(m)},test=(name,patch,assertion)=>{const x=simulate({...base,...patch},771);validate(x);assertion(x.totals,x);out.push({name,deltaB:x.totals.B.margin-x.totals.A.margin,deltaAdaptive:x.totals.adaptive.margin-x.totals.A.margin});};
 test("zero traffic",{n:0},t=>check(t.A.margin===0&&t.B.margin===0&&t.adaptive.margin===0,"zero traffic"));
 test("zero cake demand",{cakeA:0,cakeB:0,otherB:.2},t=>check(t.A.cake===0&&t.B.cake===0&&t.A.margin===t.B.margin,"stockout/no demand"));
 test("identical arms",{cakeB:.05,otherB:.2},t=>check(t.A.margin===t.B.margin&&t.adaptive.margin===t.A.margin,"identical arms"));
 test("100% refunds",{cakeA:1,cakeB:1,otherA:0,otherB:0,refundA:1,refundB:1},t=>check(t.A.net===0&&t.A.margin===-9500000&&t.A.refunds===1000,"refund losses"));
 test("negative cake uplift",{cakeA:1,cakeB:0,otherA:0,otherB:0},(t,x)=>check(t.B.margin===0&&x.decision.arm==="A","negative uplift"));
 test("pure cannibalization",{cakeA:0,cakeB:1,otherA:1,otherB:0},(t,x)=>check(t.B.cake===1000&&t.B.margin<t.A.margin&&x.decision.arm==="A","substitution loss"));
 test("cost exceeds price",{cakeA:1,cakeB:1,otherA:0,otherB:0,cakeCost:25000},t=>check(t.A.margin===-6000000,"negative margin"));
 test("treatment fee only",{cakeA:0,cakeB:0,otherA:0,otherB:0,storyCost:150,fixedCost:15000},(t,x)=>check(t.B.margin===-165000&&x.decision.arm==="A"&&t.adaptive.margin===-45000,"fee"));
 test("strong profitable uplift",{cakeA:0,cakeB:1,otherA:0,otherB:0},(t,x)=>check(x.decision.arm==="B"&&t.B.margin>t.adaptive.margin&&t.adaptive.margin>t.A.margin,"profitable switch"));
 test("tiny pilot",{n:20},(t,x)=>check(x.decision.arm==="A"&&x.decision.reason==="insufficient","small sample"));
 test("zero margin",{cakeA:1,cakeB:1,otherA:0,otherB:0,cakeCost:19000},t=>check(t.A.margin===0&&t.B.margin===0,"break even"));
 test("refund asymmetry",{cakeA:1,cakeB:1,otherA:0,otherB:0,refundB:1},(t,x)=>check(t.B.margin===-9500000&&x.decision.arm==="A","asymmetric refunds"));
 for(const bad of [{n:-1},{cakeA:1,otherA:1},{cakeCost:.5},{refundB:1.1},{storyCost:-1},{cakePrice:Infinity}]){
   let caught=false;try{simulate({...base,...bad},1)}catch{caught=true}check(caught,"reject invalid input");out.push({name:"reject "+Object.keys(bad)[0]});
 }
 const a=simulate(base,123),b=simulate(base,123);check(JSON.stringify(a)===JSON.stringify(b),"reproducibility");out.push({name:"reproducible seed"});
 return out;
}

export function run(n=1000,masterSeed=20261127){
 const master=rng(masterSeed),rows=[],seeds=new Set();
 for(let j=0;j<n;j++){
   let seed;do{seed=Math.floor(master()*4294967296)}while(seeds.has(seed));seeds.add(seed);
   const p=sampleScenario(seed),x=simulate(p,(seed^0x9e3779b9)>>>0);validate(x);
   const {A,B,adaptive:C}=x.totals;
   rows.push({id:j+1,seed,n:p.n,cakeA:p.cakeA,cakeB:p.cakeB,otherA:p.otherA,otherB:p.otherB,cakeCost:p.cakeCost,otherPrice:p.otherPrice,otherCost:x.p.otherCost,refundA:p.refundA,refundB:x.p.refundB,otherRefund:p.otherRefund,storyCost:p.storyCost,fixedCost:p.fixedCost,substitution:p.substitution,decision:x.decision.arm,A:A.margin,B:B.margin,adaptive:C.margin,netA:A.net,netB:B.net,netAdaptive:C.net,paidCakeA:A.cake,paidCakeB:B.cake,paidCakeAdaptive:C.cake,otherPaidA:A.other,otherPaidB:B.other,refundsA:A.refunds,refundsB:B.refunds});
 }
 const q=(a,p)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*p)]};
 const summarize=k=>{const deltas=rows.map(r=>(r[k]-r.A)/r.n*10);return {wins:deltas.filter(x=>x>0).length,losses:deltas.filter(x=>x<0).length,ties:deltas.filter(x=>x===0).length,mean:deltas.reduce((a,b)=>a+b,0)/n,p05:q(deltas,.05),median:q(deltas,.5),p95:q(deltas,.95),worst:Math.min(...deltas),best:Math.max(...deltas),totalMargin:rows.reduce((a,r)=>a+r[k],0)/100}};
 return {masterSeed,rows,summary:{scenarios:n,sessions:rows.reduce((a,r)=>a+r.n,0),A:summarize("A"),B:summarize("B"),adaptive:summarize("adaptive"),switchB:rows.filter(r=>r.decision==="B").length,adaptiveBeatsB:rows.filter(r=>r.adaptive>r.B).length,adaptiveWorseB:rows.filter(r=>r.adaptive<r.B).length,moreCakeLessMargin:rows.filter(r=>r.paidCakeB>r.paidCakeA&&r.B<r.A).length},stress:stress()};
}
