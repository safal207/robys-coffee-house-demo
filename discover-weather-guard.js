// Compatibility placeholder: the Discover interaction guard is bundled into
// discover-journeys-v2.js, which is already part of the service-worker precache.
const wordmarkStylesheet = document.createElement("link");
wordmarkStylesheet.rel = "stylesheet";
wordmarkStylesheet.href = "wordmark-responsive.css?v=20260704-1";
document.head.appendChild(wordmarkStylesheet);
