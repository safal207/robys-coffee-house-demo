// The destination is authored from the catalog at build time. Ignore incoming
// query/hash data, and keep a usable photo and link when JavaScript is disabled.
const entry = document.querySelector("#menu-share-open");
if (entry) {
  const destination = new URL(entry.href);
  if (destination.origin === location.origin && /\/menu-feed\.html$/.test(destination.pathname)) {
    location.replace(destination.href);
  }
}
