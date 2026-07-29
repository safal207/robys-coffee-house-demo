import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const html = readFileSync(resolve(root, "chapter-01.html"), "utf8");
const css = readFileSync(resolve(root, "chapter-01.css"), "utf8");
const js = readFileSync(resolve(root, "chapter-01.js"), "utf8");

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const requiredScenes = ["teaser", "mood", "vote", "waiting", "reveal", "saved", "completed", "post-credit"];
for (const scene of requiredScenes) {
  check(html.includes(`data-scene="${scene}"`), `Missing scene: ${scene}`);
  check(js.includes(`"${scene}"`), `State machine does not mention scene: ${scene}`);
}

check(html.includes("src/brand/robys-primary-master-v1.svg"), "Chapter must use the master SVG logo");
check(!html.includes("data:image/svg+xml"), "Chapter HTML must not embed a reconstructed logo");
check(html.includes('meta name="robots" content="noindex,nofollow"'), "Prototype must remain noindex,nofollow");
check(!readFileSync(resolve(root, "index.html"), "utf8").includes("chapter-01.html"), "Production home page must not link to the closed prototype");

for (const language of ["tr", "en", "ru"]) {
  check(html.includes(`data-lang="${language}"`), `Missing language button: ${language}`);
  check(js.includes(`${language}: {`), `Missing copy dictionary: ${language}`);
}

check(html.includes("370 ₺"), "Visible pairing total must be 370 ₺");
check(js.includes('price: 370, currency: "TRY"'), "Moment Pass analytics must preserve 370 TRY");
check(html.includes("Скидка не заявлена"), "Russian reveal must explicitly avoid a discount claim");
check(js.includes("No discount is claimed"), "English reveal must explicitly avoid a discount claim");
check(js.includes("İndirim iddiası yoktur"), "Turkish reveal must explicitly avoid a discount claim");

check(!js.includes("Notification.requestPermission"), "Prototype must not request notification permission");
check(!js.includes("fetch("), "Prototype must not send network requests");
check(!js.includes("XMLHttpRequest"), "Prototype must not send XHR requests");
check(!js.includes("WebSocket"), "Prototype must not open sockets");
check(js.includes("localStorage"), "Prototype must preserve state locally");
check(js.includes("robys:chapter-event"), "Prototype must expose audit events");

for (const eventName of [
  "chapter_first_sign_opened",
  "chapter_mood_selected",
  "chapter_vote_submitted",
  "chapter_reveal_viewed",
  "moment_pass_created",
  "moment_pass_barista_opened",
  "chapter_visit_simulated",
  "chapter_post_credit_viewed",
  "next_chapter_interest_saved"
]) {
  check(js.includes(eventName), `Missing analytics event: ${eventName}`);
}

check(css.includes("prefers-reduced-motion:reduce"), "Reduced-motion contract is missing");
check(css.includes(":focus-visible"), "Visible keyboard focus contract is missing");
check(css.includes("--ruby:#E21B23"), "Canonical Roby's red token is missing");

const externalScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((src) => /^https?:/i.test(src));
check(externalScripts.length === 0, `External script dependencies are not allowed: ${externalScripts.join(", ")}`);

if (failures.length) {
  console.error("Roby's Chapter 01 contract audit failed:\n");
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "PASS",
    scenes: requiredScenes.length,
    languages: 3,
    networkBoundary: "local-only",
    price: "370 ₺"
  }, null, 2));
}
