# Counter service contract

The original 2026-10-13 implementation was local-only. The opt-in hosted entrypoint
is described in [HOSTING.md](HOSTING.md); adding it does not itself publish a service
or change the static site's customer entry URL.

Node 24, SQLite on a persistent filesystem. The service serves the existing menu from the repository's public integrity allowlist, plus `/counter/guest.html`, `/counter/staff.html` and their explicit static assets from `counter/public/`. It overrides `/counter-config.json` with `{ "enabled": true, "checkoutUrl": "/counter/guest.html" }`; the checked-in static config is disabled. Existing strict CSP remains unchanged. Counter pages never register a service worker; API responses are no-store.

API prefix `/api/counter`. All errors are JSON `{ "error": "stable_code" }`. All write requests are bounded JSON and same-origin. Staff writes additionally require `X-CSRF-Token` from the authenticated session. Authentication uses a HttpOnly SameSite=Strict cookie, Secure outside explicit loopback development. No production default credentials.

* `GET /health`: `{ ok: true }`.
* `POST /login` `{ username, password }`: `{ user: { username, role }, csrfToken }`; roles `cashier` and `barista`.
* `GET /session`: same response, or 401.
* `POST /logout` `{}`: 204; invalidate session.
* `POST /orders?lang=ru` `{ ticketPayload, guestKey }`: `{ order }`, 201 new / 200 identical retry. `ticketPayload` is the existing encoded order ticket. `guestKey` is a browser-generated 32-byte base64url secret, stored only as a hash server-side. Stable client ticket ID + composition + guest key gives idempotency; a conflicting payload/key must not disclose the existing order. Server decodes and validates the canonical catalog, ignores/rejects client prices/status. Store immutable quoted groups in all three languages, with server creation time. Order view uses requested `lang` (tr/en/ru).
* `GET /orders/:id?lang=ru`: `{ order }`. Guest uses `Authorization: Bearer <guestKey>`; staff uses session cookie. Unauthorized requests disclose no order data.
* `GET /queue?lang=ru`: staff only `{ orders }`, oldest first. Cashier sees awaiting_payment/preparing/ready and recent issued orders. Barista sees preparing/ready (no unpaid orders). Bounded results.
* `POST /orders/:id/pay?lang=ru` `{ version }`: cashier only; atomic awaiting_payment -> preparing with paidAt, staff identity and audit entry. It records staff acknowledgement of actual external payment, never charges a card.
* `POST /orders/:id/status?lang=ru` `{ version, status }`: only preparing -> ready, ready -> issued; cashier/barista. Stale concurrent version gets 409; already-applied same action is idempotent and creates no duplicate audit/payment record. Cannot skip, reverse, pay twice, or change composition.

Order view: `{ id, number, status, version, createdAt, updatedAt, paidAt, totalMinor, currency: "TRY", groups }`. `groups` is the localized `quoteOrderTicket(...).groups` shape (quantity, items with name/variantName/quantity, unitTotalMinor, lineTotalMinor). Status values: `awaiting_payment`, `preparing`, `ready`, `issued`. Dates are epoch milliseconds. IDs are server-generated opaque random strings; displayed numbers are server-assigned and stable.

Guest entry `/counter/guest.html#ticket=<encodedPayload>`. Create or retry with a persistent guestKey scoped to this ticket; retain key/receipt for reload. Once created, replace URL hash with `id=<orderId>&key=<guestKey>&lang=ru` for reload/bookmark. Read capability must never appear in server logs/query parameters or the cashier QR. Cashier QR contains same-origin `/counter/staff.html#order=<orderId>` only. Staff phone camera opens that URL; staff page also accepts scan/paste with constrained same-origin URL parsing, and camera scanning only when supported/explicitly started. Guest polling ~2 seconds; staff ~3 seconds with visible stale/retry indicators. New-order action clears only the old ticket identity before returning to the menu, preserving unrelated storage.

Account provisioning is a local CLI with scrypt password hashing and per-user roles; passwords never in repository, CLI arguments or logs. Tests provision temporary accounts directly through exported server helpers. Server test API should export createCounterServer({ dbPath, rootDir, host, secureCookies, ... }) or equivalently documented helpers without starting on import.

Required tests: actual HTTP auth, role boundaries, CSRF/origin, catalog validation, no client status trust, guest isolation, idempotent retries, stale concurrent transitions, payment and sequential status workflow, queue visibility, logout, rate limits, data survival after server restart. No fake shared state in browser localStorage.
