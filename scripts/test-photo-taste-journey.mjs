import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const file = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const digest = text => createHash("sha256").update(text).digest("hex").slice(0,12);

test("taste experience uses authored bytes and exact stylesheet revision", () => {
  const authored=file("src/pairing-taste-journey.js"), runtime=file("pairing-taste-journey.js");
  assert.equal(runtime,authored,"Source-first runtime must be reproducible from authored file");
  assert.ok(runtime.includes("pairing-taste-journey.css?v="+digest(file("pairing-taste-journey.css"))));
  for(const marker of ["const KNOWN = new Set","pair_share_skipped","taste_unlike","pair_share_cancelled","pair_direct_choice","oldMark?.remove()"]){
    assert.ok(runtime.includes(marker),marker);
  }
  assert.ok(!runtime.includes("publicLikes"),"Do not fabricate social proof");
});

test("list, photo-grid and offline cache use same revisioned taste journey", () => {
  const js=digest(file("pairing-taste-journey.js")),css=digest(file("pairing-taste-journey.css"));
  for(const html of [file("menu.html"),file("menu-grid.html")]){
    assert.ok(html.includes('src="pairing-taste-journey.js?v='+js+'"'));
    assert.ok(html.indexOf("pairing-posters.js") < html.indexOf("pairing-taste-journey.js"));
  }
  const sw=file("sw-core-v64.js");
  assert.ok(sw.includes('"./pairing-taste-journey.js?v='+js+'"'));
  assert.ok(sw.includes('"./pairing-taste-journey.css?v='+css+'"'));
  assert.match(sw,/-taste-journey-[a-f0-9]{12}/);
});

test("photo grid still matches the generated list-to-grid transform", () => {
  const list=file("menu.html"),grid=file("menu-grid.html");
  const css=digest(file("menu-grid.css")),prepaint=digest(file("menu-grid-prepaint.js")),
    merch=digest(file("menu-grid-merchandising.js"));
  const styles=list.match(/href="(menu-runtime[.]css[?]v=[a-f0-9]{12})"/)?.[1];
  assert.ok(styles);
  const nl=String.fromCharCode(10);
  const expected=list
    .replace(/(<script src="bootstrap-v2[.]js[?]v=[a-f0-9]+"><[/]script>)/,
      '<script src="menu-grid-prepaint.js?v='+prepaint+'"></script>'+nl+'  $1')
    .replace('<body class="menu-page">','<body class="menu-page menu-photo-grid">')
    .replace('data-menu-view="list" aria-current="page"','data-menu-view="list"')
    .replace('data-menu-view="grid"','data-menu-view="grid" aria-current="page"')
    .replace('href="'+styles+'" />','href="'+styles+'" /><link rel="stylesheet" href="menu-grid.css?v='+css+'" />')
    .replace("</body>",'  <script type="module" src="menu-grid-merchandising.js?v='+merch+'"></script>'+nl+"</body>");
  assert.equal(grid,expected,"Generated photo grid drifted from list; rerun npm run build");
});
