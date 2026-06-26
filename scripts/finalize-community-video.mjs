import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const chunkPaths = [
  "scripts/.community-video/part.00",
  "scripts/.community-video/part.01",
  "scripts/.community-video/part.020",
  "scripts/.community-video/part.021",
  "scripts/.community-video/part.03",
  "scripts/.community-video/part.04",
  "scripts/.community-video/part.050",
  "scripts/.community-video/part.051",
  "scripts/.community-video/part.060",
  "scripts/.community-video/part.061",
  "scripts/.community-video/part.070",
  "scripts/.community-video/part.071"
];

const encoded = chunkPaths.map((path) => readFileSync(path, "utf8")).join("");
const video = Buffer.from(encoded, "base64");
const digest = createHash("sha256").update(video).digest("hex");
const expectedDigest = "9fdaac53bd2f76b8acee7eddc41ed3105096fdd9ddb30919509cb276daa7e1e4";
if (digest !== expectedDigest) {
  throw new Error(`Community reel checksum mismatch: ${digest}`);
}
writeFileSync("src/robys-community-reel.mp4", video);

const iframeMarkup = `        <div class="community-reel-card">
          <iframe class="community-reel-embed" title="Roby's Coffee House Instagram reel" src="https://www.instagram.com/reel/C0qYxxmIY9t/embed/" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>`;
const videoMarkup = `        <a class="community-reel-card" href="https://www.instagram.com/reel/C0qYxxmIY9t/" target="_blank" rel="noopener noreferrer" aria-label="Watch Roby's Coffee House reel on Instagram">
          <video class="community-reel-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true"><source src="src/robys-community-reel.mp4?v=20260626-1" type="video/mp4" /></video>
          <span class="community-reel-overlay" aria-hidden="true"></span>
          <span class="community-reel-handle"><span class="community-instagram-icon" aria-hidden="true"></span>@robyscoffeehouse</span>
          <span class="community-reel-watch"><span data-localized data-tr="Reel'i izle" data-en="Watch the reel" data-ru="Смотреть Reel">Reel'i izle</span><span aria-hidden="true">↗</span></span>
        </a>`;

let html = readFileSync("index.html", "utf8");
if (!html.includes(iframeMarkup)) throw new Error("Instagram iframe markup not found");
html = html.replace(iframeMarkup, videoMarkup);
html = html.replace(
  "frame-src https://maps.google.com https://www.instagram.com;",
  "frame-src https://maps.google.com;"
);
writeFileSync("index.html", html);

const iframeCss = ".community-reel-embed{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}";
const videoCss = `.community-reel-video{width:100%;height:100%;object-fit:cover;background:#2a201e}
.community-reel-overlay{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(20,14,13,.38),transparent 24%,transparent 62%,rgba(20,14,13,.82))}
.community-reel-handle,.community-reel-watch{position:absolute;z-index:2;display:inline-flex;align-items:center;gap:9px;pointer-events:none;backdrop-filter:blur(14px)}
.community-reel-handle{top:18px;left:18px;padding:10px 13px;background:rgba(24,17,16,.64);border:1px solid rgba(255,255,255,.18);border-radius:999px;font-size:.76rem;font-weight:800}
.community-reel-handle .community-instagram-icon{width:17px;height:17px}
.community-reel-watch{right:18px;bottom:18px;left:18px;justify-content:space-between;padding:14px 16px;background:rgba(24,17,16,.7);border:1px solid rgba(255,255,255,.2);border-radius:18px;font-size:.82rem;font-weight:800}`;
let css = readFileSync("community-reel.css", "utf8");
if (!css.includes(iframeCss)) throw new Error("Instagram iframe CSS not found");
css = css.replace(iframeCss, videoCss);
writeFileSync("community-reel.css", css);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
packageJson.scripts["verify:media"] = "node scripts/verify-media.mjs && node scripts/verify-media.mjs src/robys-community-reel.mp4";
writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

rmSync("scripts/.community-video", { recursive: true, force: true });
console.log(JSON.stringify({ file: "src/robys-community-reel.mp4", bytes: video.length, sha256: digest }, null, 2));
