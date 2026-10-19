import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { webkit } from "playwright";

// Diagnostic only: use unchanged feature assets and its exact HTML CSP.
// This is for an ephemeral QA branch; it makes no app-source modifications.
const repo = process.cwd();
const output = resolve(process.env.PROBE_REPORT_DIR ?? ".artifacts/webkit-media-probe");
mkdirSync(output, { recursive: true });
const protectedFiles = ["menu.html", "src/menu-combos-ui.js", "menu-combos-ui.js", "menu-combos.css",
  "src/products/occasion-sets-v1/family-motion-v1.mp4", "src/products/occasion-sets-v1/family-motion-v1.webm"];
const hashes = () => Object.fromEntries(protectedFiles.map(file => [file, createHash("sha256").update(readFileSync(join(repo, file))).digest("hex")]));
const html = readFileSync(join(repo, "menu.html"), "utf8");
const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i)?.[0];
if (!csp) throw new Error("The feature menu CSP must be present");
const sourceBytes = Object.fromEntries(["mp4", "webm"].map(ext => [ext, readFileSync(join(repo, `src/products/occasion-sets-v1/family-motion-v1.${ext}`))]));
const certificate = mkdtempSync(join(tmpdir(), "robys-webkit-probe-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const report = { purpose: "DIAGNOSTIC_ONLY: not an app test approval", startedAt: new Date().toISOString(), headStart: head(),
  featureHead: process.env.PROBE_FEATURE_HEAD ?? "f8f1c1e9fb0f17386f06ade15e45105cc9f09210",
  runtime: { node: process.version, platform: process.platform, arch: process.arch }, csp, hashesStart: hashes(), serverRequests: [], serverErrors: [], cases: [] };
const client = `"use strict";
const variant = new URL(location.href).searchParams.get("variant");
const probe = window.__probe = { variant, ready: true, events: [], samples: [], playPromise: "not-called", userAgent: navigator.userAgent,
  secureContext: isSecureContext, sourceUrls: [], cspViolations: [], start: null };
document.addEventListener("securitypolicyviolation", event => probe.cspViolations.push({directive:event.effectiveDirective,blockedURI:event.blockedURI}));
const typeProbe=document.createElement("video");
probe.support=Object.fromEntries(["video/mp4",'video/mp4; codecs="avc1.64001e"',"video/webm",'video/webm; codecs="vp9"','video/webm; codecs="vp8"'].map(type=>[type,typeProbe.canPlayType(type)]));
const snapshot=media=>({time:performance.now(),src:media.currentSrc,networkState:media.networkState,readyState:media.readyState,currentTime:media.currentTime,
  width:media.videoWidth,height:media.videoHeight,paused:media.paused,ended:media.ended,error:media.error?{code:media.error.code,message:media.error.message}:null});
document.getElementById("start").addEventListener("click",event=>{
  probe.start={trusted:event.isTrusted,userActivation:navigator.userActivation?.isActive,time:performance.now()};
  const media=document.createElement("video");window.__probeMedia=media;
  media.controls=true;media.muted=true;media.defaultMuted=true;media.playsInline=true;media.preload="none";media.width=688;media.height=464;
  for(const type of ["loadstart","loadedmetadata","loadeddata","canplay","canplaythrough","playing","play","pause","waiting","stalled","suspend","progress","timeupdate","error","abort","emptied","ended"])
    media.addEventListener(type,()=>probe.events.push({event:type,...snapshot(media)}));
  document.getElementById("stage").replaceChildren(media);
  if(variant.startsWith("sources-")){
    for(const ext of ["mp4","webm"]){const source=document.createElement("source");source.src="/family-motion-v1."+ext;source.type="video/"+ext;
      source.addEventListener("error",()=>probe.events.push({event:"source-error",source:source.src,type:source.type,...snapshot(media)}));
      probe.sourceUrls.push(source.src);media.append(source);}
    if(variant==="sources-load")media.load();
  }else{const ext=media.canPlayType("video/mp4")?"mp4":"webm";probe.selectedDirectSource={ext,reportedSupport:media.canPlayType("video/"+ext)};media.src="/family-motion-v1."+ext;probe.sourceUrls.push(media.src);}
  const playing=media.play();probe.playPromise="pending";
  playing?.then(()=>{probe.playPromise="resolved";probe.events.push({event:"play-promise-resolved",...snapshot(media)});},error=>{
    probe.playPromise={status:"rejected",name:error.name,message:error.message};probe.events.push({event:"play-promise-rejected",...snapshot(media)});});
  window.__probeTimer=setInterval(()=>probe.samples.push(snapshot(media)),250);
});
window.__probeFinish=()=>{clearInterval(window.__probeTimer);const media=window.__probeMedia;probe.final=media?snapshot(media):null;return probe;};
`;
function serve(protocol) {
  return (request, response) => {
    const path = new URL(request.url, `${protocol}://localhost`).pathname;
    if (path === "/probe.html") {
      response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      response.end(`<!doctype html><html><head><meta charset="utf-8">${csp}<title>WebKit media diagnostic</title></head><body><button id="start" type="button">Start the local clip</button><div id="stage"></div><script src="/probe-client.js"></script></body></html>`); return;
    }
    if (path === "/probe-client.js") { response.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }).end(client); return; }
    const ext = path.match(/^\/family-motion-v1\.(mp4|webm)$/)?.[1];
    if (!ext) { response.writeHead(404).end(); return; }
    const bytes = sourceBytes[ext], size = bytes.length;
    const entry = { protocol, at: new Date().toISOString(), method: request.method, path, range: request.headers.range ?? null,
      userAgent: request.headers["user-agent"] ?? "", status: 200, size };
    report.serverRequests.push(entry);
    const headers = { "content-type": `video/${ext}`, "cache-control": "no-store", "accept-ranges": "bytes" };
    let start = 0, end = size - 1;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      start = match?.[1] ? Number(match[1]) : 0; end = match?.[2] ? Number(match[2]) : size - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
      if (!match || !match[1] && !match[2] || start >= size || start > end) {
        entry.status = 416; response.writeHead(416, { ...headers, "content-range": `bytes */${size}` }).end(); return;
      }
      end = Math.min(end, size - 1); entry.status = 206; headers["content-range"] = `bytes ${start}-${end}/${size}`;
    }
    entry.contentRange = headers["content-range"] ?? null; entry.contentLength = end - start + 1;
    response.writeHead(entry.status, { ...headers, "content-length": entry.contentLength });
    response.end(request.method === "HEAD" ? undefined : bytes.subarray(start, end + 1));
  };
}
const http = httpServer(serve("http"));
const https = httpsServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, serve("https"));
https.on("tlsClientError", error => report.serverErrors.push({protocol:"https",event:"tlsClientError",code:error.code,message:error.message,at:new Date().toISOString()}));
http.on("clientError", (error, socket) => {
  report.serverErrors.push({protocol:"http",event:"clientError",code:error.code,message:error.message,at:new Date().toISOString()});
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
await Promise.all([http, https].map(server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve))));
let browser;
try {
  browser = await webkit.launch({ headless: true });
  report.browserVersion = browser.version();
  for (const [protocol, server] of [["http", http], ["https", https]]) {
    for (const { variant, interception } of [
      { variant: "sources-no-load", interception: true }, { variant: "sources-load", interception: true },
      { variant: "direct-reported", interception: true }, { variant: "direct-reported", interception: false }
    ]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block", viewport: { width: 800, height: 700 } });
      const origin = `${protocol}://127.0.0.1:${server.address().port}`;
      if (interception) await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
      const network = { requests: [], responses: [], failed: [] }, pageErrors = [], consoleMessages = [];
      try {
        const page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(10000);
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("console", message => { if (["error", "warning"].includes(message.type())) consoleMessages.push({type:message.type(),text:message.text()}); });
        page.on("request", request => { if (/family-motion/.test(request.url())) network.requests.push({url:request.url(),method:request.method(),type:request.resourceType(),range:request.headers().range??null}); });
        page.on("response", response => { if (/family-motion/.test(response.url())) network.responses.push({url:response.url(),status:response.status(),headers:response.headers()}); });
        page.on("requestfailed", request => network.failed.push({url:request.url(),failure:request.failure()}));
        await page.goto(`${origin}/probe.html?variant=${variant}`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__probe?.ready);
        const serverStart = report.serverRequests.length;
        await page.locator("#start").click();
        await page.waitForTimeout(5000);
        const result = await page.evaluate(() => window.__probeFinish());
        const item = { protocol, variant, interception, origin, observationMs: 5000, pageErrors, consoleMessages, network,
          serverRequestIndexes: [serverStart, report.serverRequests.length], ...result };
        report.cases.push(item);
        console.log(JSON.stringify({protocol,variant,interception,support:result.support,playPromise:result.playPromise,final:result.final,
          serverRequests:report.serverRequests.length-serverStart,cspViolations:result.cspViolations,pageErrors}));
      } catch (error) {
        report.cases.push({protocol,variant,interception,origin,error:error.stack,network,pageErrors,consoleMessages});
        console.error(`${protocol}/${variant}/route=${interception}: ${error.message}`);
      } finally { await context.close(); }
      writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    }
  }
} finally {
  await browser?.close();
  await Promise.all([http, https].map(server => new Promise(resolve => server.close(resolve))));
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.headEnd = head(); report.hashesEnd = hashes();
  report.assetsUnchanged = JSON.stringify(report.hashesStart) === JSON.stringify(report.hashesEnd);
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({purpose:report.purpose,cases:report.cases.length,assetsUnchanged:report.assetsUnchanged,report:join(output,"report.json")}));
