import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";
import { ORIGINAL_STARTUP_SEQUENCE, EARLY_GEOMETRY_STARTUP_SEQUENCE,
  buildEarlyGeometryCandidate, assertSynchronousEarlyGeometry
} from "./menu-early-geometry-candidate.mjs";

test("Only existing startup calls change order, published runtime still matches verified source",()=>{
  const original=readFileSync("src/menu-app.js","utf8");
  const compiled=readFileSync("menu-app.js","utf8");
  assert.equal(compileMenuRuntime(original),compiled,
    "Do not test a stale or modified production build");
  const candidate=buildEarlyGeometryCandidate(original);
  assert.notEqual(candidate,original);
  assert.equal(candidate.length,original.length);
  assert.equal(candidate.replace(EARLY_GEOMETRY_STARTUP_SEQUENCE,
    ORIGINAL_STARTUP_SEQUENCE),original);
  assert.notEqual(compileMenuRuntime(candidate),compiled,
    "QA-only alternate bundle must not equal original");
  const audit=assertSynchronousEarlyGeometry(original,candidate);
  assert.equal(audit.initialGeometryCallBeforeMenuDom,true);
  assert.equal(audit.sameSynchronousCalls,true);
  assert.equal(audit.productionSafe,false);
  assert.ok(audit.requiredBrowserEvidence.length>=5);
});
test("Fail closed on a missing, duplicate, or pre-reordered source anchor",()=>{
  assert.throws(()=>buildEarlyGeometryCandidate(""),/anchor missing or repeated/);
  assert.throws(()=>buildEarlyGeometryCandidate(
    ORIGINAL_STARTUP_SEQUENCE+"\n"+ORIGINAL_STARTUP_SEQUENCE),
    /anchor missing or repeated/);
  assert.throws(()=>buildEarlyGeometryCandidate(EARLY_GEOMETRY_STARTUP_SEQUENCE),
    /anchor missing or repeated/);
});
test("Ordering is synchronous: no timing gap between geometry init and menu rendering",()=>{
  const src=ORIGINAL_STARTUP_SEQUENCE;
  const candidate=buildEarlyGeometryCandidate(src);
  const calls=text=>text.split("\n").slice(0,4);
  const recorded=[];
  const handlers={
    translateStaticPage:()=>recorded.push("translate"),
    renderCategoryNav:()=>recorded.push("category-nav"),
    renderMenu:()=>recorded.push("menu"),
    initializeMenuScrollMetrics:()=>recorded.push("geometry")
  };
  const execute=text=>new Function(...Object.keys(handlers),
    text.split("\n").slice(0,4).join("\n"))(...Object.values(handlers));
  execute(candidate);
  assert.deepEqual(recorded,["translate","category-nav","geometry","menu"]);
  assert.deepEqual(calls(candidate),[
    "translateStaticPage();","renderCategoryNav();",
    "initializeMenuScrollMetrics();","renderMenu();"]);
  const audit=assertSynchronousEarlyGeometry(src,candidate);
  assert.equal(audit.sameFunctionBody,true);
});
test("Any extra rAF / delayed CSS writes are excluded from QA-only alternative",()=>{
  const src=ORIGINAL_STARTUP_SEQUENCE;
  const candidate=buildEarlyGeometryCandidate(src);
  assert.throws(()=>assertSynchronousEarlyGeometry(src,
    candidate+"\nrequestAnimationFrame(()=>{});"),/Unexpected extra changes/);
  assert.throws(()=>assertSynchronousEarlyGeometry(src,
    candidate.replace("renderMenu();","setTimeout(renderMenu, 0);")),
    /Initial geometry must precede renderMenu|Unexpected extra changes/);
});
