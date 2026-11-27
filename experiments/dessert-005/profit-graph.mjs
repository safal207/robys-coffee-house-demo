const products=["cake","san","lotus","latte","filter"], prices=[19000,19000,19000,18000,16000], actions=[0,1,2,3], contexts=[0,1];

export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}

export function sample(seed){
 const r=rng(seed),u=(a,b)=>a+(b-a)*r(),i=(a,b)=>Math.floor(u(a,b+1));
 return {n:i(500,3500),mix:u(.25,.75),cost:prices.map(p=>Math.round(p*u(.32,.85))),refund:prices.map(()=>u(0,.12)),shift:contexts.map(()=>[0,...[1,2,3].map(()=>u(-.35,.8))]),sub:contexts.map(()=>[0,...[1,2,3].map(()=>u(0,1))]),base:contexts.map(c=>[0,...[1,2,3].map(()=>u(c===0?.025:.015,c===0?.14:.08))]).map(a=>{a[0]=1-a.slice(1).reduce((s,v)=>s+v,0);return a}),coffee:contexts.map(c=>[u(c===0?.1:.25,c===0?.3:.65),...Array.from({length:3},()=>u(.15,.7))]),attach:contexts.map(()=>[0,...Array.from({length:3},()=>u(-.12,.25))]),latteShare:u(.25,.75),refundShift:u(-.02,.06),fee:i(0,150),fixed:i(0,15000),saving:i(0,700),available:[true,true,true]};
}

export function prepare(s){
 const prob=v=>Number.isFinite(v)&&v>=0&&v<=1, money=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000, shape=(a,n)=>Array.isArray(a)&&a.length===n;
 if(!Number.isSafeInteger(s.n)||s.n<0||s.n>100000||!prob(s.mix)||!shape(s.cost,5)||!s.cost.every(money)||!shape(s.refund,5)||!s.refund.every(prob)||!prob(s.latteShare)||![s.fee,s.fixed,s.saving].every(money)||!Number.isFinite(s.refundShift)||Math.abs(s.refundShift)>1||!shape(s.available,3)||!s.available.every(x=>typeof x==="boolean"))throw Error("invalid scenario");
 if(s.saving>Math.min(...s.cost.slice(0,3))+Math.min(...s.cost.slice(3)))throw Error("negative joint cost");
 for(const k of ["base","shift","sub","coffee","attach"])if(!shape(s[k],2)||!s[k].every(a=>shape(a,4)))throw Error("invalid graph dimension");
 for(const c of contexts){
 if(!s.base[c].every(prob)||Math.abs(s.base[c].reduce((a,b)=>a+b,0)-1)>1e-9||!s.sub[c].every(prob)||!s.coffee[c].every(prob)||!s.shift[c].every(v=>Number.isFinite(v)&&v>=-1&&v<=2)||!s.attach[c].every(v=>Number.isFinite(v)&&Math.abs(v)<=1))throw Error("invalid edge");
 }
 return {...s,graphs:contexts.map(c=>actions.map(a=>graph(s,c,a)))};
}

export function graph(s,c,a){
 const b=[...s.base[c]],edges=[];
 for(let d=1;d<=3;d++)if(!s.available[d-1]){b[0]+=b[d];b[d]=0}
 const p=[...b];
 const move=(from,to,v)=>{if(v>0){p[from]-=v;p[to]+=v;edges.push({from,to,weight:v})}};
 if(a&&s.available[a-1]){
 const delta=b[a]*s.shift[c][a],others=[1,2,3].filter(d=>d!==a&&s.available[d-1]),mass=others.reduce((sum,d)=>sum+b[d],0);
 if(delta>=0){
 const desired=Math.min(delta,1-b[a]),fromOther=Math.min(mass,desired*s.sub[c][a]),fromNone=Math.min(b[0],desired-fromOther);
 for(const d of others)move(d,a,mass?fromOther*b[d]/mass:0);
 move(0,a,fromNone);
 }else{
 const lost=Math.min(b[a],-delta),toOther=mass?lost*s.sub[c][a]:0;
 for(const d of others)move(a,d,mass?toOther*b[d]/mass:0);
 move(a,0,lost-toOther);
 }
 }
 const coffee=s.coffee[c].map((v,d)=>Math.max(0,Math.min(1,v+(a&&d===a&&s.available[a-1]?s.attach[c][a]:0))));
 const refund=s.refund.map((v,j)=>Math.max(0,Math.min(1,v+(a&&j===a-1&&s.available[j]?s.refundShift:0))));
 const fee=a&&s.available[a-1]?s.fee:0;
 if(p.some(v=>v< -1e-9||v>1+1e-9)||Math.abs(p.reduce((a,b)=>a+b,0)-1)>1e-9)throw Error("mass conservation");
 return {p,b,edges,coffee,refund,fee,active:a&&s.available[a-1]?a:0};
}

export function basket(s,g,u,v,w,rd,rc){
 let d=0,acc=0;for(let j=0;j<4;j++){acc+=g.p[j];if(u<acc||j===3){d=j;break}}
 const drink=v<g.coffee[d]?(w<s.latteShare?3:4):-1,di=d-1;
 const ids=[di,drink].filter(j=>j>=0),paid=ids.filter(j=>(j<3?rd:rc)>=g.refund[j]);
 const gross=ids.reduce((sum,j)=>sum+prices[j],0),net=paid.reduce((sum,j)=>sum+prices[j],0),rawCost=ids.reduce((sum,j)=>sum+s.cost[j],0),saving=ids.length===2?s.saving:0;
 return {ids,paid,d,drink,gross,net,refund:gross-net,rawCost,saving,cost:rawCost-saving,fee:g.fee,margin:net-rawCost+saving-g.fee,active:g.active};
}

export function blank(){return {n:0,ordered:[0,0,0,0,0],paid:[0,0,0,0,0],joint:Array(6).fill(0),gross:0,net:0,refund:0,rawCost:0,saving:0,cost:0,fee:0,margin:0,sq:0,actions:[0,0,0,0],orders:0,paidBaskets:0,fixed:0}}

export function add(t,b){
 t.n++;t.actions[b.active]++;for(const j of b.ids)t.ordered[j]++;for(const j of b.paid)t.paid[j]++;
 if(b.d&&b.drink>=0)t.joint[(b.d-1)*2+b.drink-3]++;
 for(const k of ["gross","net","refund","rawCost","saving","cost","fee","margin"])t[k]+=b[k];
 t.sq+=b.margin*b.margin;t.orders+=Number(b.ids.length>0);t.paidBaskets+=Number(b.paid.length>0);
}

export function graphMargin(t,s){return t.paid.reduce((a,n,j)=>a+n*prices[j],0)-t.ordered.reduce((a,n,j)=>a+n*s.cost[j],0)+t.joint.reduce((a,b)=>a+b,0)*s.saving-t.fee}

export function choose(stats,s,remaining,allowed){
 const a=stats[0],mean=t=>graphMargin(t,s)/t.n,variance=t=>Math.max(0,(t.sq-t.margin*t.margin/t.n)/(t.n-1));
 let best=0,bestLower=0;
 for(const i of allowed.filter(x=>x!==0)){
 const b=stats[i];if(a.n<30||b.n<30||remaining<=0)continue;
 // Conservative normal heuristic; not a calibrated simultaneous confidence interval.
 const lower=mean(b)-mean(a)-2.13*Math.sqrt(variance(a)/a.n+variance(b)/b.n);
 if(lower>bestLower){best=i;bestLower=lower;}
 }
 return {action:best,lower:bestLower};
}

export function simulate(input,seed){
 const s=prepare(input),r=rng(seed),policies=["A","B","adaptiveAB","profitGraph"],totals=Object.fromEntries(policies.map(k=>[k,blank()])),allowed=actions.filter(a=>a===0||s.available[a-1]),abAllowed=allowed.includes(1)?[0,1]:[0];
 const pilot=Math.floor(s.n*.4),abStats=actions.map(blank),gStats=contexts.map(()=>actions.map(blank)),abCounts=[0,0],gCounts=[0,0],abPerm=[...abAllowed],gPerm=contexts.map(()=>[...allowed]);
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}};
 const decide=()=>({ab:choose(abStats,s,s.n-pilot,abAllowed),graph:contexts.map(c=>choose(gStats[c],s,s.n-pilot,allowed))});
 let decision;
 for(let j=0;j<s.n;j++){
 if(j===pilot)decision=decide();
 const c=r()<s.mix?0:1,u=r(),v=r(),w=r(),rd=r(),rc=r();
 let ab,ga;
 if(j<pilot){
 if(j%abAllowed.length===0)shuffle(abPerm);
 ab=abPerm[j%abAllowed.length];abCounts[c]++;
 const i=gCounts[c]++;if(i%allowed.length===0)shuffle(gPerm[c]);
 ga=gPerm[c][i%allowed.length];
 }else{ab=decision.ab.action;ga=decision.graph[c].action}
 const picks={A:0,B:abAllowed.includes(1)?1:0,adaptiveAB:ab,profitGraph:ga};
 for(const k of policies){
 const b=basket(s,s.graphs[c][picks[k]],u,v,w,rd,rc);add(totals[k],b);
 if(j<pilot&&k==="adaptiveAB")add(abStats[ab],b);
 if(j<pilot&&k==="profitGraph")add(gStats[c][ga],b);
 }
 }
 if(!decision)decision=decide();
 for(const t of Object.values(totals)){t.fixed=t.actions.slice(1).filter(n=>n>0).length*s.fixed;t.margin-=t.fixed;}
 return {s,totals,pilot,abStats,gStats,decision,allowed,abAllowed};
}

export function validate(x){
 const {s,totals,pilot,abStats,gStats,decision,allowed,abAllowed}=x,ok=(v,m)=>{if(!v)throw Error(m)};
 for(const c of contexts)for(const a of actions){
 const g=s.graphs[c][a],v=[...g.b];for(const e of g.edges){v[e.from]-=e.weight;v[e.to]+=e.weight;}
 ok(v.every((n,i)=>Math.abs(n-g.p[i])<1e-9),"graph transfer conservation");
 for(let j=0;j<3;j++)if(!s.available[j])ok(Math.abs(g.p[j+1])<1e-9,"unavailable node");
 }
 for(const t of Object.values(totals)){
 for(const k of ["n","gross","net","refund","rawCost","saving","cost","fee","margin","orders","paidBaskets","fixed"])ok(Number.isSafeInteger(t[k]),"integer:"+k);
 ok(t.n===s.n&&t.actions.reduce((a,b)=>a+b,0)===s.n,"sessions");
 ok(t.paid.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&v<=t.ordered[i]&&t.ordered[i]<=s.n),"unit counts");
 ok(t.ordered.slice(0,3).reduce((a,b)=>a+b,0)<=s.n&&t.ordered.slice(3).reduce((a,b)=>a+b,0)<=s.n,"basket capacity");
 const joints=t.joint.reduce((a,b)=>a+b,0),units=t.ordered.reduce((a,b)=>a+b,0);
 ok(t.orders===units-joints&&t.paidBaskets<=t.orders&&t.orders<=s.n,"basket conservation");
 for(let d=0;d<3;d++)ok(t.joint[d*2]+t.joint[d*2+1]<=t.ordered[d],"edge dessert bound");
 for(let c=0;c<2;c++)ok(t.joint[c]+t.joint[c+2]+t.joint[c+4]<=t.ordered[3+c],"edge coffee bound");
 ok(t.gross===t.ordered.reduce((a,n,j)=>a+n*prices[j],0)&&t.net===t.paid.reduce((a,n,j)=>a+n*prices[j],0)&&t.gross===t.net+t.refund,"revenue");
 ok(t.rawCost===t.ordered.reduce((a,n,j)=>a+n*s.cost[j],0)&&t.saving===joints*s.saving&&t.cost===t.rawCost-t.saving&&t.cost>=0,"cost");
 ok(t.fee===t.actions.slice(1).reduce((a,b)=>a+b,0)*s.fee&&t.fixed===t.actions.slice(1).filter(n=>n>0).length*s.fixed,"campaign cost");
 ok(t.margin===t.net-t.cost-t.fee-t.fixed&&t.margin===graphMargin(t,s)-t.fixed,"margin");
 for(let i=0;i<3;i++)if(!s.available[i])ok(t.ordered[i]===0&&t.actions[i+1]===0,"stockout");
 }
 ok(totals.A.actions[0]===s.n,"control isolation");
 ok(abStats.reduce((a,b)=>a+b.n,0)===pilot&&gStats.flat().reduce((a,b)=>a+b.n,0)===pilot,"pilot only");
 for(const group of [abAllowed.map(i=>abStats[i]),...gStats.map(a=>allowed.map(i=>a[i]))])ok(Math.max(...group.map(t=>t.n))-Math.min(...group.map(t=>t.n))<=1,"balanced pilot");
 ok(JSON.stringify(decision)===JSON.stringify({ab:choose(abStats,s,s.n-pilot,abAllowed),graph:contexts.map(c=>choose(gStats[c],s,s.n-pilot,allowed))}),"no future input");
 return true;
}

export function stress(){
 const base={n:1200,mix:.5,cost:[9500,8000,10000,5000,4000],refund:[0,0,0,0,0],shift:[[0,0,0,0],[0,0,0,0]],sub:[[0,1,1,1],[0,1,1,1]],base:[[.4,.2,.2,.2],[.4,.2,.2,.2]],coffee:[[0,0,0,0],[0,0,0,0]],attach:[[0,0,0,0],[0,0,0,0]],latteShare:1,refundShift:0,fee:0,fixed:0,saving:0,available:[true,true,true]};
 const out=[],ok=(v,m)=>{if(!v)throw Error(m)},test=(name,patch,fn)=>{const x=simulate({...base,...patch},771);validate(x);fn(x);out.push(name)};
 test("zero traffic",{n:0},x=>ok(Object.values(x.totals).every(t=>t.margin===0),"zero"));
 test("identical arms",{},x=>ok(Object.values(x.totals).every(t=>t.margin===x.totals.A.margin),"identical"));
 test("all stockouts",{available:[false,false,false]},x=>ok(Object.values(x.totals).every(t=>t.margin===0&&t.actions[0]===x.s.n),"stockout"));
 test("single unavailable target",{available:[false,true,true]},x=>ok(x.totals.B.margin===x.totals.A.margin,"unavailable"));
 test("100% refunds",{refund:[1,1,1,1,1],coffee:[[1,1,1,1],[1,1,1,1]]},x=>ok(Object.values(x.totals).every(t=>t.net===0&&t.margin===-t.cost),"refund"));
 test("coffee-only",{base:[[1,0,0,0],[1,0,0,0]],coffee:[[1,1,1,1],[1,1,1,1]]},x=>ok(x.totals.A.margin===1200*13000&&x.totals.A.joint.every(n=>n===0),"coffee"));
 test("joint basket exact accounting",{base:[[0,1,0,0],[0,1,0,0]],coffee:[[1,1,1,1],[1,1,1,1]],saving:300},x=>ok(x.totals.A.margin===1200*(19000+18000-9500-5000+300),"joint"));
 test("partial line refund retains both costs",{base:[[0,1,0,0],[0,1,0,0]],coffee:[[1,1,1,1],[1,1,1,1]],refund:[1,0,0,0,0]},x=>ok(x.totals.A.margin===1200*(18000-9500-5000)&&x.totals.A.paid[0]===0,"partial"));
 test("substitution mass exact",{base:[[0,.1,.9,0],[0,.1,.9,0]],shift:[[0,2,0,0],[0,2,0,0]],cost:[18000,1000,10000,5000,4000]},x=>{const g=x.s.graphs[0][1];ok(Math.abs(g.p[1]-.3)<1e-9&&Math.abs(g.p[2]-.7)<1e-9&&x.totals.B.margin<x.totals.A.margin,"substitution")});
 test("complement raises margin",{base:[[0,1,0,0],[0,1,0,0]],attach:[[0,1,0,0],[0,1,0,0]]},x=>ok(x.totals.B.margin-x.totals.A.margin===1200*13000,"complement"));
 test("negative margin",{cost:[25000,25000,25000,5000,4000],base:[[0,1,0,0],[0,1,0,0]]},x=>ok(x.totals.A.margin===-7200000,"loss"));
 test("fee and fixed activation accounting",{fee:100,fixed:5000},x=>ok(x.totals.B.margin===x.totals.A.margin-125000&&x.decision.ab.action===0,"fee"));
 test("small pilot defaults control",{n:20},x=>ok(x.decision.graph.every(d=>d.action===0)&&x.decision.ab.action===0,"small"));
 test("strong context-dependent complement",{base:[[0,1,0,0],[0,0,1,0]],attach:[[0,1,0,0],[0,0,1,0]]},x=>ok(x.decision.graph[0].action===1&&x.decision.graph[1].action===2,"context"));
 for(const bad of [{n:-1},{base:[[1,1,0,0],[1,0,0,0]]},{refund:[0,0,0,0,2]},{saving:1000000},{cost:[1.5,2,3,4,5]},{fee:-1},{available:[true,false]},{mix:NaN}]){
 let caught=false;try{simulate({...base,...bad},1)}catch{caught=true}ok(caught,"reject");out.push("reject "+Object.keys(bad)[0]);
 }
 ok(JSON.stringify(simulate(base,4))===JSON.stringify(simulate(base,4)),"repeat");out.push("reproducible");
 return out;
}

export function run(previousSeeds=[],n=1000,masterSeed=20261205){
 const master=rng(masterSeed),seen=new Set(previousSeeds),rows=[];
 for(let i=0;i<n;i++){
 let seed;do{seed=Math.floor(master()*4294967296)}while(seen.has(seed));seen.add(seed);
 const x=simulate(sample(seed),(seed^0x85ebca6b)>>>0);validate(x);
 const row={id:i+1,seed,n:x.s.n,parameters:JSON.stringify(Object.fromEntries(Object.entries(x.s).filter(([k])=>k!=="graphs"))),decAB:x.decision.ab.action,decGraph0:x.decision.graph[0].action,decGraph1:x.decision.graph[1].action};
 for(const [k,t] of Object.entries(x.totals)){row[k]=t.margin;row[k+"_net"]=t.net;row[k+"_cost"]=t.cost;row[k+"_fee"]=t.fee;row[k+"_fixed"]=t.fixed;row[k+"_cake"]=t.paid[0];row[k+"_joint"]=t.joint.reduce((a,b)=>a+b,0);row[k+"_units"]=t.paid.join(":");row[k+"_actions"]=t.actions.join(":");}
 rows.push(row);
 }
 const q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
 const sum=k=>{const d=rows.map(r=>(r[k]-r.A)/r.n*10);return{mean:d.reduce((a,b)=>a+b,0)/n,p05:q(d,.05),median:q(d,.5),p95:q(d,.95),worst:Math.min(...d),best:Math.max(...d),wins:d.filter(v=>v>0).length,losses:d.filter(v=>v<0).length,ties:d.filter(v=>v===0).length}};
 const summary={scenarios:n,sessions:rows.reduce((a,b)=>a+b.n,0),seed:masterSeed,oldSeedsExcluded:previousSeeds.length,B:sum("B"),adaptiveAB:sum("adaptiveAB"),profitGraph:sum("profitGraph"),graphBeatsAB:rows.filter(r=>r.profitGraph>r.adaptiveAB).length,graphBeatsB:rows.filter(r=>r.profitGraph>r.B).length,graphSelectsOther:rows.filter(r=>r.decGraph0>=2||r.decGraph1>=2).length,graphDifferentContexts:rows.filter(r=>r.decGraph0!==r.decGraph1).length,moreCakeLessMargin:rows.filter(r=>r.B_cake>r.A_cake&&r.B<r.A).length};
 return{rows,summary,stress:stress()};
}
