// Deterministic offline ledger proof; never import into a public runtime.
// A trusted future transaction adapter must authenticate and authorize all events.
export function replayRewards(policy, events) {
  const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const id=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
  const deny=code=>{throw new Error(code)};
  if(!policy||!id(policy.id)||!integer(policy.stampsPerReward,2,100)||!integer(policy.maxRedemptions,0,100000)||!Array.isArray(events)||events.length>100000)deny("invalid-policy-or-log");
  const orders=new Map(),balances=new Map(),seen=new Map(),redemptions=new Map();
  let redeemed=0;
  const balance=m=>balances.get(m)??0;
  const adjust=(m,delta)=>balances.set(m,balance(m)+delta);
  // Only server-verified events may enter this function; it does not authenticate requests.
  for(const e of events){
    if(!e||e.policyId!==policy.id||!id(e.eventId)||!id(e.memberId)||!id(e.orderId)||!["earn","refund","redeem"].includes(e.type))deny("invalid-event");
    const signature=JSON.stringify([e.policyId,e.type,e.memberId,e.orderId]);
    if(seen.has(e.eventId)){
      if(seen.get(e.eventId)!==signature)deny("event-conflict");
      continue;
    }
    const previous=orders.get(e.orderId);
    if(e.type==="earn"){
      if(redemptions.has(e.orderId))deny("reward-order-not-eligible");
      if(previous){
        if(previous.memberId!==e.memberId)deny("order-conflict");
        // Replays with a different event ID cannot recreate an earned or refunded stamp.
      }else{
        orders.set(e.orderId,{memberId:e.memberId,refunded:false});
        adjust(e.memberId,1);
      }
    }else if(e.type==="refund"){
      if(!previous||previous.memberId!==e.memberId)deny("order-not-found");
      if(!previous.refunded){
        previous.refunded=true;
        // If the earlier stamp was spent, the debt remains; no new redemption until repaid.
        adjust(e.memberId,-1);
      }
    }else{
      if(previous)deny("reward-order-not-eligible");
      if(redemptions.has(e.orderId)){
        if(redemptions.get(e.orderId)!==e.memberId)deny("order-conflict");
      }else{
        if(balance(e.memberId)<policy.stampsPerReward)deny("insufficient-stamps");
        if(redeemed>=policy.maxRedemptions)deny("redemption-cap");
        adjust(e.memberId,-policy.stampsPerReward);
        redemptions.set(e.orderId,e.memberId);
        redeemed++;
      }
    }
    seen.set(e.eventId,signature);
  }
  return {policyId:policy.id,redemptions:redeemed,remainingRedemptions:policy.maxRedemptions-redeemed,members:[...balances].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([memberId,stamps])=>({memberId,stamps,availableRewards:Math.max(0,Math.floor(stamps/policy.stampsPerReward))}))};
}
