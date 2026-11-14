import { test } from "node:test";
import assert from "node:assert/strict";
import { replayRewards } from "./club-reward-ledger.mjs";

const policy = {"id":"pilot-v1","stampsPerReward":3,"maxRedemptions":2};
const e=(type,orderId,eventId=type+"-"+orderId,memberId="guest-a")=>({type,orderId,eventId,memberId,policyId:policy.id});
const earn=[e("earn","a"),e("earn","b"),e("earn","c")], redeem=e("redeem","r");
test("idempotent event and semantic order retries do not multiply stamps",()=>{
  const result=replayRewards(policy,[...earn,earn[0],e("earn","a","retry"),redeem,redeem,e("redeem","r","retry-redeem")]);
  assert.equal(result.redemptions,1);
  assert.deepEqual(result.members,[{memberId:"guest-a",stamps:0,availableRewards:0}]);
});
test("refund before redemption removes credit; after redemption creates debt",()=>{
  assert.throws(()=>replayRewards(policy,[...earn,e("refund","a"),redeem]),/insufficient-stamps/);
  const log=[...earn,redeem,e("refund","a"),e("refund","a","retry"),e("earn","a","late-retry")];
  assert.equal(replayRewards(policy,log).members[0].stamps,-1);
  const repaired=replayRewards(policy,[...log,e("earn","d")]);
  assert.equal(repaired.members[0].stamps,0);
  assert.throws(()=>replayRewards(policy,[...log,e("redeem","r2")]),/insufficient-stamps/);
});
test("different members cannot claim the same paid or reward order",()=>{
  assert.throws(()=>replayRewards(policy,[...earn,e("earn","a","other","guest-b")]),/order-conflict/);
  assert.throws(()=>replayRewards(policy,[...earn,redeem,e("redeem","r","other","guest-b")]),/order-conflict/);
  assert.throws(()=>replayRewards(policy,[...earn,e("refund","a","other","guest-b")]),/order-not-found/);
});
test("redemption order cannot generate paid stamps or replace previous paid order",()=>{
  assert.throws(()=>replayRewards(policy,[...earn,redeem,e("earn","r")]),/reward-order-not-eligible/);
  assert.throws(()=>replayRewards(policy,[...earn,e("redeem","a")]),/reward-order-not-eligible/);
});
test("budget count is global, not per member; member balances isolated",()=>{
  const b=["d","e","f"].map(id=>e("earn",id,"earn-"+id,"guest-b"));
  assert.throws(()=>replayRewards({...policy,maxRedemptions:1},[...earn,redeem,...b,e("redeem","s","redeem-s","guest-b")]),/redemption-cap/);
  const result=replayRewards(policy,[...earn,redeem,...b]);
  assert.deepEqual(result.members.map(x=>x.stamps),[0,3]);
  assert.equal(result.remainingRedemptions,1);
});
test("conflicting event ID and policy version rejected",()=>{
  assert.throws(()=>replayRewards(policy,[...earn,e("earn","z",earn[0].eventId)]),/event-conflict/);
  assert.throws(()=>replayRewards(policy,[{...earn[0],policyId:"different"}]),/invalid-event/);
  assert.throws(()=>replayRewards({...policy,stampsPerReward:0},[]),/invalid-policy/);
});
test("replay is deterministic and does not mutate inputs",()=>{
  const log=Object.freeze([...earn,redeem,e("refund","a")].map(Object.freeze));
  assert.deepEqual(replayRewards(policy,log),replayRewards(policy,log));
  assert.equal(log.length,5);
});
