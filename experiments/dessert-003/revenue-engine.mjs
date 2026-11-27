// Offline experiment prototype. Not imported by the website.
export function createAssignment({enabled=false,storage,randomToken}={}) {
  const key="robys-dessert-experiment.v1";
  const valid=t=>typeof t==="string"&&/^[a-f0-9]{32}$/.test(t);
  const arm=t=>parseInt(t.slice(0,2),16)<128?"A":"B";
  return function assign({eligible=false}={}) {
    if(!enabled)return {status:"disabled"};
    try {
      const saved=storage.getItem(key);
      if(saved!==null){
        const a=JSON.parse(saved);
        if(!a||!valid(a.token)||a.arm!==arm(a.token))return {status:"unavailable"};
        return {status:"assigned",token:a.token,arm:a.arm};
      }
      if(!eligible)return {status:"ineligible"};
      const token=randomToken();
      if(!valid(token))return {status:"unavailable"};
      const a={token,arm:arm(token)};
      const serialized=JSON.stringify(a);
      storage.setItem(key,serialized);
      if(storage.getItem(key)!==serialized)return {status:"unavailable"};
      return {status:"assigned",...a};
    } catch {return {status:"unavailable"};}
  };
}

export function createLedger({enabled=false}={}) {
  const sessions=new Map(),orders=new Map();
  const valid=t=>typeof t==="string"&&/^[a-f0-9]{32}$/.test(t);
  const arm=t=>parseInt(t.slice(0,2),16)<128?"A":"B";
  const stages=["exposure","story_completed","add_to_cart","qr_created"];
  const integer=x=>Number.isSafeInteger(x)&&x>=0;
  const maxMoney=1000000000;
  function register(a){
    if(!enabled)return "disabled";
    if(a?.status!=="assigned"||!valid(a.token)||a.arm!==arm(a.token))throw Error("invalid assignment");
    if(sessions.has(a.token))return "duplicate";
    sessions.set(a.token,{arm:a.arm,stages:new Set()});return "accepted";
  }
  function stage(token,name){
    if(!enabled)return "disabled";
    const s=sessions.get(token);
    if(!s||!stages.includes(name)||(name==="story_completed"&&s.arm!=="B"))throw Error("invalid stage");
    if(s.stages.has(name))return "duplicate";
    s.stages.add(name);return "accepted";
  }
  // Trusted POS adapter boundary only. No browser event can establish payment.
  // Amounts in integer kurus, after refunds/discounts; variable costs retained.
  // The caller must authenticate POS data before passing it here.
  function reconcile(input){
    if(!enabled)return "disabled";
    const {orderToken,sessionToken,revision,status,cakeUnits,netRevenue,variableCost}=input??{};
    if(!valid(orderToken)||!sessions.has(sessionToken)||!integer(revision)||revision<1||
      !["pending","fulfilled_paid","cancelled","refunded"].includes(status)||
      ![cakeUnits,netRevenue,variableCost].every(integer)||cakeUnits>10000||netRevenue>maxMoney||variableCost>maxMoney||
      (status!=="fulfilled_paid"&&(cakeUnits!==0||netRevenue!==0))||
      (status==="pending"&&variableCost!==0))throw Error("invalid receipt");
    const row={orderToken,sessionToken,revision,status,cakeUnits,netRevenue,variableCost};
    const old=orders.get(orderToken);
    if(old){
      if(old.sessionToken!==sessionToken)throw Error("order ownership conflict");
      if(revision<old.revision)return "stale";
      if(revision===old.revision){
        if(JSON.stringify(old)!==JSON.stringify(row))throw Error("revision conflict");
        return "duplicate";
      }
      if(old.status==="cancelled"||old.status==="refunded"){
        if(status!==old.status)throw Error("terminal order");
      }else if(old.status==="fulfilled_paid"&&!["fulfilled_paid","refunded"].includes(status))throw Error("invalid transition");
    }
    orders.set(orderToken,row);return "accepted";
  }
  function snapshot(){
    const init=()=>({assigned:0,exposure:0,story_completed:0,add_to_cart:0,qr_created:0,paidSessions:0,cakeUnits:0,netRevenue:0,variableCost:0,contribution:0,pendingOrders:0,cancelledOrders:0,refundedOrders:0,paidConversion:null,contributionPerSession:null});
    const result={A:init(),B:init()};
    for(const s of sessions.values()){const a=result[s.arm];a.assigned++;for(const name of s.stages)a[name]++;}
    const paid=new Set();
    function add(a,key,value){const next=a[key]+value;if(!Number.isSafeInteger(next))throw Error("aggregate overflow");a[key]=next;}
    for(const o of orders.values()){
      const a=result[sessions.get(o.sessionToken).arm];
      if(o.status==="pending"){a.pendingOrders++;continue;}
      if(o.status==="cancelled")a.cancelledOrders++;
      if(o.status==="refunded")a.refundedOrders++;
      if(o.status==="fulfilled_paid"&&o.cakeUnits>0)paid.add(o.sessionToken);
      add(a,"cakeUnits",o.cakeUnits);add(a,"netRevenue",o.netRevenue);add(a,"variableCost",o.variableCost);
    }
    for(const t of paid)result[sessions.get(t).arm].paidSessions++;
    for(const a of Object.values(result)){
      a.contribution=a.netRevenue-a.variableCost;
      a.paidConversion=a.assigned?a.paidSessions/a.assigned:null;
      a.contributionPerSession=a.assigned?a.contribution/a.assigned:null;
    }
    return result;
  }
  return {register,stage,reconcile,snapshot};
}
