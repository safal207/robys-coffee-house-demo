import { normalizeHistorySnapshot, compareHistorySnapshots } from "./history-store.mjs";

// These links guide triage. They are not evidence of causality or severity.
const CASE_COMPONENTS={
  "ST-01":["counter-service","counter-staff"],"ST-02":["counter-service","counter-staff"],
  "ST-03":["counter-auth","counter-service"],"ST-04":["counter-service"],
  "PAG-01":["menu-feed","catalog"],"PAG-02":["menu-feed","catalog"],"PAG-03":["menu-feed"],
  "PAG-04":["counter-service","counter-staff"],
  "CART-01":["order-model","order-ui"],"CART-02":["order-model","order-ui"],
  "QR-01":["ticket-qr","checkout"],"PROP-CART":["order-model"],
  "PROP-API":["counter-service"],"CHAOS-01":["counter-service","counter-auth"]
};
const HEX64=/^[0-9a-f]{64}$/;
const sortStrings=(a,b)=>a<b?-1:a>b?1:0;
const order=(value)=>value.sort(sortStrings);
const normalizeRecord=record=>{
  if(record?.trust!=="LOCAL_UNVERIFIED_IMPORT"||!HEX64.test(record.id??""))throw Error("untrusted_history_record");
  return normalizeHistorySnapshot({head:record.head,registrySha256:record.registrySha256,
    checks:record.checks,cases:record.cases});
};
export function buildRegressionCards(beforeRecord,afterRecord,registry,registrySha256){
  const before=normalizeRecord(beforeRecord),after=normalizeRecord(afterRecord);
  const delta=compareHistorySnapshots(before,after);
  const graphCompatible=Boolean(before.registrySha256&&before.registrySha256===after.registrySha256
    &&before.registrySha256===registrySha256&&registry
    &&Array.isArray(registry.components)&&Array.isArray(registry.checks)&&Array.isArray(registry.journeys));
  const componentMap=new Map(graphCompatible?registry.components.map(item=>[item.id,item]):[]);
  const checkMap=new Map(graphCompatible?registry.checks.map(item=>[item.id,item]):[]);
  const cards=delta.rows.filter(row=>row.change==="REGRESSION").map(row=>{
    const mapped=row.kind==="checks"?checkMap.get(row.id)?.components:CASE_COMPONENTS[row.id];
    const components=graphCompatible?order([...(mapped??[])].filter(id=>componentMap.has(id))):[];
    const distance=new Map(components.map(id=>[id,0])),queue=[...components];
    for(let i=0;i<queue.length;i++)for(const component of componentMap.values()){
      if(component.dependsOn?.includes(queue[i])&&!distance.has(component.id)){
        distance.set(component.id,distance.get(queue[i])+1);queue.push(component.id);
      }
    }
    const downstream=order([...distance.keys()].filter(id=>!components.includes(id)));
    const journeys=graphCompatible?order(registry.journeys.filter(journey=>
      row.kind==="checks"&&journey.checks?.includes(row.id)
      || journey.components?.some(id=>distance.has(id))).map(j=>j.id)):[];
    return {
      id:"REG-"+row.kind+"-"+row.id+"-"+afterRecord.id.slice(0,12),
      type:"REGRESSION_OBSERVATION",review:"NEEDS_TRIAGE",severity:"UNASSESSED",
      scope:row.kind==="checks"?"SUITE":"CASE",testId:row.id,
      beforeStatus:"PASS",afterStatus:"FAIL",
      evidence:{beforeHead:before.head,afterHead:after.head,
        beforeSnapshot:beforeRecord.id,afterSnapshot:afterRecord.id,
        provenance:"LOCAL_UNVERIFIED_IMPORT"},
      linkedComponents:components,potentialDownstream:downstream,relatedJourneys:journeys,
      componentLinks:"HYPOTHESIS_ONLY",
      nextAction:"Re-run the exact scenario on the same head, inspect receipts, then assign cause and severity."
    };
  });
  return {schemaVersion:1,type:"QA_REGRESSION_TRIAGE_DRAFT",beforeHead:before.head,afterHead:after.head,
    registryCompatible:graphCompatible,registryChanged:delta.registryChanged,
    warning:"Imported observations are not authenticated CI attestations or confirmed product defects.",
    cards};
}
