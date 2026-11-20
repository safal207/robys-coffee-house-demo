import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SHA=/^[a-f0-9]{40}$/;
const STATUS=new Set(["queued","pending","in_progress","requested","waiting","completed"]);
const CONCLUSION=new Set(["success","failure","timed_out","cancelled","skipped","neutral","action_required","stale","startup_failure"]);
const host="https://api.github.com";
const repository="safal207/robys-coffee-house-demo";
const compareText=(a,b)=>a<b?-1:a>b?1:0;

function checkSha(sha){
  if(typeof sha!=="string"||!SHA.test(sha))throw Error("invalid_head_sha");
  return sha;
}
function normalizeRun(run,sha){
  if(!run||typeof run!=="object"||run.head_sha!==sha||
    !Number.isSafeInteger(run.id)||run.id<1||
    !Number.isSafeInteger(run.workflow_id)||run.workflow_id<1||
    typeof run.name!=="string"||!run.name.trim()||run.name.length>160||
    !STATUS.has(run.status)||
    run.status==="completed"&&!CONCLUSION.has(run.conclusion)||
    run.status!=="completed"&&run.conclusion!==null||
    !Number.isSafeInteger(run.run_attempt)||run.run_attempt<1||
    run.html_url!=="https://github.com/"+repository+"/actions/runs/"+run.id)
    throw Error("invalid_github_workflow_run");
  const verdict=run.status!=="completed"?"PENDING":
    run.conclusion==="success"?"PASS":
    ["failure","timed_out","startup_failure"].includes(run.conclusion)?"FAIL":"INCOMPLETE";
  return {workflowId:run.workflow_id,name:run.name,runId:run.id,attempt:run.run_attempt,
    head:sha,status:run.status,conclusion:run.conclusion,verdict,url:run.html_url};
}
export function normalizeGithubWorkflows(data,sha){
  checkSha(sha);
  if(!data||typeof data!=="object"||!Array.isArray(data.workflow_runs)
    ||!Number.isSafeInteger(data.total_count)||data.total_count<0
    ||data.total_count>100||data.workflow_runs.length!==data.total_count)
    throw Error("incomplete_github_workflow_page");
  const selected=new Map();
  for(const raw of data.workflow_runs){
    const row=normalizeRun(raw,sha),old=selected.get(row.workflowId);
    // Runs sharing the workflow ID are attempts of the same workflow. The
    // greatest Actions run ID is the most recently created run.
    if(!old||row.runId>old.runId||row.runId===old.runId&&row.attempt>old.attempt)selected.set(row.workflowId,row);
  }
  return {head:sha,origin:"GITHUB_ACTIONS_API_OBSERVATION_NOT_ATTESTATION",
    workflows:[...selected.values()].sort((a,b)=>a.workflowId-b.workflowId)};
}
export function compareGithubWorkflows(before,after){
  checkSha(before?.head);checkSha(after?.head);
  if(before.origin!=="GITHUB_ACTIONS_API_OBSERVATION_NOT_ATTESTATION"
    ||after.origin!=="GITHUB_ACTIONS_API_OBSERVATION_NOT_ATTESTATION"
    ||!Array.isArray(before.workflows)||!Array.isArray(after.workflows))
    throw Error("invalid_workflow_observation");
  const previous=new Map(before.workflows.map(row=>[row.workflowId,row]));
  const current=new Map(after.workflows.map(row=>[row.workflowId,row]));
  if(previous.size!==before.workflows.length||current.size!==after.workflows.length)throw Error("duplicate_workflow_id");
  const rows=[...new Set([...previous.keys(),...current.keys()])].sort((a,b)=>a-b).map(id=>{
    const a=previous.get(id),b=current.get(id);
    if(a&&a.head!==before.head||b&&b.head!==after.head)throw Error("head_mismatch");
    const from=a?.verdict??"NOT_PRESENT",to=b?.verdict??"NOT_PRESENT";
    const change=from==="PASS"&&to==="FAIL"?"REGRESSION":
      from==="FAIL"&&to==="PASS"?"RECOVERED":
      to==="PENDING"?"AWAITING_CI":
      to==="INCOMPLETE"?"INCOMPLETE":
      from==="NOT_PRESENT"?"NEW_WORKFLOW":
      to==="NOT_PRESENT"?"MISSING_WORKFLOW":
      from===to?"UNCHANGED":"CHANGED";
    return {workflowId:id,name:b?.name??a?.name??"unknown",from,to,change,
      beforeRun:a?.url??null,afterRun:b?.url??null,afterRunId:b?.runId??null};
  });
  return {schemaVersion:1,type:"GITHUB_WORKFLOW_OBSERVATION_DIFF",beforeHead:before.head,afterHead:after.head,
    provenance:"GITHUB_ACTIONS_API_OBSERVATION_NOT_ATTESTATION",
    warning:"Workflow conclusions are not individual test-case results or proof of a defect. Pending runs never count as PASS or FAIL.",
    summary:{regressions:rows.filter(x=>x.change==="REGRESSION").length,
      recovered:rows.filter(x=>x.change==="RECOVERED").length,
      awaiting:rows.filter(x=>x.change==="AWAITING_CI").length,
      missing:rows.filter(x=>x.change==="MISSING_WORKFLOW").length},
    rows};
}
export async function getGithubWorkflows(sha,{fetcher=fetch,token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||""}={}){
  checkSha(sha);
  const url=host+"/repos/"+repository+"/actions/runs?head_sha="+sha+"&per_page=100";
  const headers={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  if(token)headers.Authorization="Bearer "+token;
  const response=await fetcher(url,{headers,redirect:"error"});
  if(!response?.ok)throw Error("github_api_http_"+(response?.status??"unknown"));
  const data=await response.json();
  return normalizeGithubWorkflows(data,sha);
}
export async function compareGithubHeads(beforeHead,afterHead,options={}){
  checkSha(beforeHead);checkSha(afterHead);
  const [before,after]=await Promise.all([
    getGithubWorkflows(beforeHead,options),getGithubWorkflows(afterHead,options)
  ]);
  return compareGithubWorkflows(before,after);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [before,after,...extra]=process.argv.slice(2);
  if(extra.length||!SHA.test(before??"")||!SHA.test(after??"")){
    process.stderr.write("Usage: node .github/qa/github-workflow-diff.mjs <before SHA40> <after SHA40>\n");
    process.exitCode=2;
  }else{
    compareGithubHeads(before,after).then(report=>{
      process.stdout.write(JSON.stringify(report,null,2)+"\n");
      if(report.summary.regressions)process.exitCode=1;
    }).catch(error=>{process.stderr.write("Workflow comparison unavailable: "+error.message+"\n");process.exitCode=2;});
  }
}
