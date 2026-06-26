import { readFileSync, writeFileSync } from "node:fs";

const INDEX_PATH = "index.html";
let html = readFileSync(INDEX_PATH, "utf8");

if (html.includes('id="community"')) {
  throw new Error("The community reel section is already installed.");
}

html = html.replace(
  '<meta name="robys-build" content="20260626-7" />',
  '<meta name="robys-build" content="20260626-8" />'
);

html = html.replace(
  '  <link rel="stylesheet" href="social-offer.css?v=20260626-1" />',
  '  <link rel="stylesheet" href="social-offer.css?v=20260626-1" />\n  <link rel="stylesheet" href="community-reel.css?v=20260626-1" />'
);

html = html.replace(
  '  <script defer src="social-offer.js?v=e3ddc10b7a06"></script>',
  '  <script defer src="social-offer.js?v=e3ddc10b7a06"></script>\n  <script defer src="community-reel.js?v=bootstrap"></script>'
);

const anchor = '    <aside class="social-offer" id="daily-offer" aria-live="polite" aria-labelledby="daily-offer-title" hidden></aside>';
if (!html.includes(anchor)) throw new Error("Could not find the daily offer anchor.");

const section = `    <section class="community-reel" id="community" aria-labelledby="community-reel-title">
      <div class="container community-reel-grid">
        <div class="community-reel-copy">
          <p class="eyebrow" data-localized data-tr="ROBY'S TOPLULUĞU" data-en="ROBY'S COMMUNITY" data-ru="СООБЩЕСТВО ROBY'S">ROBY'S TOPLULUĞU</p>
          <h2 id="community-reel-title"><span data-localized data-tr="Kahve anları" data-en="Coffee moments" data-ru="Кофейные моменты">Kahve anları</span><br /><em data-localized data-tr="birlikte daha güzel." data-en="are better together." data-ru="лучше вместе.">birlikte daha güzel.</em></h2>
          <p data-localized data-tr="Roby's'deki anlarını paylaş, bizi etiketle ve Gazipaşa'daki kahve topluluğuna katıl." data-en="Share your moments at Roby's, tag us and join Gazipaşa's coffee community." data-ru="Делись моментами в Roby's, отмечай нас и присоединяйся к кофейному сообществу Газипаши.">Roby's'deki anlarını paylaş, bizi etiketle ve Gazipaşa'daki kahve topluluğuna katıl.</p>
          <div class="community-reel-actions">
            <a class="button community-reel-button" href="https://www.instagram.com/robyscoffeehouse/" target="_blank" rel="noopener noreferrer"><span class="community-instagram-icon" aria-hidden="true"></span><span data-localized data-tr="Topluluğa katıl" data-en="Join the community" data-ru="Вступить в сообщество">Topluluğa katıl</span></a>
            <a class="community-reel-text-link" href="https://www.instagram.com/reel/C0qYxxmIY9t/" target="_blank" rel="noopener noreferrer"><span data-localized data-tr="Reel'i Instagram'da izle" data-en="Watch the reel on Instagram" data-ru="Смотреть Reel в Instagram">Reel'i Instagram'da izle</span><span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <a class="community-reel-card" href="https://www.instagram.com/reel/C0qYxxmIY9t/" target="_blank" rel="noopener noreferrer" aria-label="Watch Roby's Coffee House reel on Instagram" data-community-reel-card>
          <video class="community-reel-video" muted loop playsinline preload="none" poster="src/robys-community-reel-poster.webp?v=20260626-1" aria-hidden="true" data-community-reel-video><source data-src="src/robys-community-reel.mp4?v=20260626-1" type="video/mp4" /></video>
          <span class="community-reel-overlay" aria-hidden="true"></span>
          <span class="community-reel-handle"><span class="community-instagram-icon" aria-hidden="true"></span>@robyscoffeehouse</span>
          <span class="community-reel-watch"><span data-localized data-tr="Reel'i izle" data-en="Watch the reel" data-ru="Смотреть Reel">Reel'i izle</span><span aria-hidden="true">↗</span></span>
        </a>
      </div>
    </section>
`;

html = html.replace(anchor, `${section}${anchor}`);
writeFileSync(INDEX_PATH, html);
console.log("Installed the Roby's community reel section.");
