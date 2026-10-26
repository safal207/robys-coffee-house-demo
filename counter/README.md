# Counter service

The default entrypoint runs locally. An opt-in hosted container and its deployment
steps are described in [HOSTING.md](HOSTING.md). Neither entrypoint charges a card.
The cashier records payment received at the counter; only then does the order
appear in the barista queue. Status changes are recorded in SQLite with the staff
identity and time.

Use Node 24.19 or newer from the repository root:

```sh
node counter/provision.mjs cashier cashier
node counter/provision.mjs barista barista
node counter/server.mjs
```

Provisioning requests the password twice in an interactive terminal without
echoing it. Passwords must contain 12–256 characters and are never passed on the
command line. There are no default credentials. Provisioning an existing username
changes its password and role and invalidates its sessions.

Open `http://127.0.0.1:8787/menu.html` for guests and
`http://127.0.0.1:8787/counter/staff.html` for staff. The local server enables
`/counter-config.json`; the static hosted website remains disabled. API traffic
and counter pages use `Cache-Control: no-store`.

Data is stored in `counter/data/counter.sqlite` by default. `COUNTER_DB` selects
another persistent path; use the same value for provisioning and the server.
`COUNTER_PORT` defaults to 8787, `COUNTER_HOST` to 127.0.0.1. Stop the server before
copying the database as a backup, or use a SQLite-aware backup tool that includes
the WAL. Keep the data directory private to the operating-system account running
the service. The server never exposes database files, backend files or tests.

This default binds only to loopback. Non-loopback configuration requires an
explicit HTTPS `COUNTER_PUBLIC_ORIGIN` and Secure cookies. For a TLS-terminating
host and persistent volume, use the opt-in `node counter/hosted.mjs` entrypoint
and [hosting instructions](HOSTING.md). Forwarded headers are not trusted.

Sessions expire after eight hours. Passwords use scrypt with a random salt;
session and guest bearer secrets are stored as hashes. Writes require the exact
request Origin and JSON. Staff writes also require the session CSRF token.
Default per-address limits per minute: 1200 API requests, 8 login attempts,
30 order submissions. Authenticated reads are also limited to 90 per minute per
session or valid guest capability, allowing normal polling from a shared café IP.
Invalid/over-limit requests return a stable JSON error.

Orders have immutable quotations in TR/EN/RU, calculated from the server catalog.
The ticket ID, canonical composition and guest secret identify a retry; conflicts
return no existing order data. Every accepted payment/status transition increments
the version and appends one audit row in a transaction. Retrying the same action
with its original version returns the current order without another audit entry;
other stale versions return 409.

The queue is ordered oldest first. Baristas see at most 200 preparing/ready
orders. Cashiers see at most 200 active orders plus the latest 30 issued orders
updated within the last 24 hours; completed history cannot crowd out active work.
Issued orders remain available by their authorized order link.

## Server/test API

```js
import { createCounterServer, provisionUser } from './counter/server.mjs';

// Provisioning is explicit; obtain the password privately, never commit/log it.
await provisionUser({ dbPath, username, password, role: 'cashier' });
const server = createCounterServer({ dbPath, rootDir, host: '127.0.0.1' });
server.listen(8787, '127.0.0.1');
```

`createCounterServer` synchronously returns a native Node HTTP server and never
listens on import. `server.provisionUser({ username, password, role })` is also
available as an asynchronous helper. Closing the server closes its SQLite handle.
Tests may inject `now`, `sessionTtlMs` and small `rateLimits` to verify expiry and
limits using real HTTP requests. Run focused backend tests with:

```sh
node --test counter/test/server.test.mjs
```

See [CONTRACT.md](CONTRACT.md) for the shared frontend API. `GET /health` in that
document means `/api/counter/health`; all other API routes share that prefix.
