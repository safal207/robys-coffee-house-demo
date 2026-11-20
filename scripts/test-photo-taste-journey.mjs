import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const digest=text=>createHash("sha256").update(text).digest("hex").slice(0,12);

test("taste experience ships authored bytes and current stylesheet hash",()=>{
 const source=file("src/pairing-taste-journey.js");
 const runtime=file("pairing-taste-journey.js");
 const css=file("pairing-taste-journey.css");
 assert.equal(runtime,source,"Source-first file must match delivered runtime");
 assert.match(source,new RegExp(`pairing-taste-journey\\.css\\?v=${digest(css)}`));
 assert.match(source,/const KNOWN = new Set/);
 assert.match(source,/pair_share_skipped/);
 assert.match(source,/taste_unlike/);
 assert.match(source,/pair_share_cancelled/);
 assert.match(source,/pair_direct_choice/);
 assert.match(source,/oldMark\\?\\.remove\\(\\)/);
 assert.ok(!source.includes("publicLikes"),"Do not fabricate public popularity");
});

test("list, photo-grid and offline precache load exact same taste module",()=>{
 const js=digest(file("pairing-taste-journey.js"));
 const css=digest(file("pairing-taste-journey.css"));
 const menu=file("menu.html"),grid=file("menu-grid.html"),sw=file("sw-core-v64.js");
 for(const [name,html]of [["list",menu],["grid",grid]]){
   assert.ok(html.includes(`src="pairing-taste-journey.js?v=${js}"`),name);
   assert.ok(html.indexOf("pairing-posters.js")<html.indexOf("pairing-taste-journey.js"),
     "Original order action must initialize before progressive enhancement");
 }
 assert.ok(sw.includes(`"./pairing-taste-journey.js?v=${js}"`));
 assert.ok(sw.includes(`"./pairing-taste-journey.css?v=${css}"`));
 assert.match(sw,/-taste-journey-[a-f0-9]{12}/);
});

test("generated photo-grid is the exact build transform of list page",()=>{
 const list=file("menu.html"),grid=file("menu-grid.html"),css=digest(file("menu-grid.css")),prepaint=digest(file("menu-grid-prepaint.js")),
     merch=digest(file("menu-grid-merchandising.js"));
 const styles=list.match(/href="(menu-runtime\\.css\\?v=[a-f0-9]{12})"/)?.[1];
 assert.ok(styles);
 const expected=list
   .replace(/(<script src="bootstrap-v2\\.js\\?v=[a-f0-9]+"><\\/script>)/,
     `<script src="menu-grid-prepaint.js?v=${prepaint}"></script>\\n  $1`)
   .replace('<body class="menu-page">','<body class="menu-page menu-photo-grid">')
   .replace('data-menu-view="list" aria-current="page"','data-menu-view="list"')
   .replace('data-menu-view="grid"','data-menu-view="grid" aria-current="page"')
   .replace(`href="${styles}" />`,`href="${styles}" /><link rel="stylesheet" href="menu-grid.css?v=${css}" />`)
   .replace("</body>",`  <script type="module" src="menu-grid-merchandising.js?v=${merch}"></script>\\n</body>`);
 assert.equal(grid,expected,"Generated grid drifted from list; rerun build");
});
