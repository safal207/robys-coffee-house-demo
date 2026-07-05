// Compatibility placeholder: the Discover interaction guard is bundled into
// discover-journeys-v2.js, which is already part of the service-worker precache.
const WORDMARK_STYLESHEET_ID = "robys-wordmark-responsive";
const WORDMARK_STYLESHEET_HREF = "wordmark-responsive.css?v=20260704-1";

if (!document.getElementById(WORDMARK_STYLESHEET_ID)) {
  const wordmarkStylesheet = document.createElement("link");
  wordmarkStylesheet.id = WORDMARK_STYLESHEET_ID;
  wordmarkStylesheet.rel = "stylesheet";
  wordmarkStylesheet.href = WORDMARK_STYLESHEET_HREF;
  document.head.appendChild(wordmarkStylesheet);
}
