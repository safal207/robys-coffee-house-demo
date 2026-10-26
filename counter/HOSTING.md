# Hosted Counter deployment

The opt-in container serves the menu, guest checkout, staff screen and API on
one HTTPS origin, preserving the same-origin checkout, CSRF, roles and Secure
cookies. The Pages copy stays static until the customer entry URL is switched
to the verified hosted menu.

## Image and service

Build from the repository root with `counter/Dockerfile`. The image rebuilds
reviewed sources, verifies the public integrity manifest and copies only public
allowlisted files and required server modules. No database, environment file,
dependency tree or credentials are included in the final image.

| Railway service setting | Value |
| --- | --- |
| Repository root | `/` |
| Builder / Dockerfile | Dockerfile / `counter/Dockerfile` |
| Start command | Image default: `node counter/hosted.mjs` |
| Persistent volume | Attached to this service at `/data` |
| Replicas | One; SQLite is not shared between replicas |
| Healthcheck | `/api/counter/health` |
| Public origin | `COUNTER_PUBLIC_ORIGIN=https://<the-service-domain>` |
| Listen port | Railway's `PORT` (1024–65535); domain target must match |
| Volume initialization | `RAILWAY_RUN_UID=0`; startup drops to UID/GID 1000 before opening the DB or socket |
| Database | `/data/orders/counter.sqlite`; image sets `COUNTER_DB` for provisioning |
| Shutdown grace | At least 12 seconds |

Railway supplies `RAILWAY_VOLUME_MOUNT_PATH` for an attached volume. Do not set
it manually to imitate a mount: startup also checks the Linux mount table.
Create the domain and set its exact HTTPS origin before starting. Forwarded
headers grant no trust. The healthcheck hostname is allowed only on the exact
read-only health route, never on sessions, orders or menu pages.

Startup initializes only the private `/data/orders` directory and drops root.
An imported database may require an explicit ownership migration; never delete
or silently replace it to make startup succeed.

## First launch and site connection

1. Select the project, environment and service; attach the volume and apply the
   settings above. Deploy the reviewed commit and record commit SHA, image
   digest, service/domain and volume identity.
2. Wait for deployment success, verify public HTTPS health and compare the
   published manifest with that commit. Deployment healthchecks do not provide
   continuing uptime monitoring.
3. In an authenticated interactive service shell, run
   `node counter/provision.mjs <username> cashier` or
   `node counter/provision.mjs <username> barista`. Passwords are requested
   without echo; never put them in arguments, URLs, source code or build logs.
   Re-provisioning revokes that user's sessions.
4. Open `/menu.html` on the service domain. Uncached `/counter-config.json`
   enables `/counter/guest.html` on that same origin. Verify a designated test
   order through cashier acknowledgement, preparing, ready and issued before
   sharing the customer URL. Payment acknowledgement does not charge a card.
5. Confirm the order survives a deployment on the same volume, then switch the
   agreed customer entry URL to the hosted menu. Do not enable the Pages config
   against an unrelated origin.

## Data recovery

SQLite uses WAL. Back up the entire volume consistently with writes stopped,
or use SQLite's online-backup API. Copying only a live `.sqlite` file can lose
committed WAL transactions. Configure scheduled backups and prove restoration
into a separate service/volume before customer cutover. Restrict backup access
to cafe operators.

A deployment using a Railway volume has a short interruption while the old
instance releases it. SIGTERM drains requests and closes SQLite; lingering HTTP
connections are closed after nine seconds. Roll back the application image
against the same compatible database, without replacing the volume or restoring
a stale backup as an ordinary code rollback.

## Verification

`npm run test:counter` covers HTTP/store/guest/staff contracts and hosted
configuration rejection. The Counter workflow also builds the real image and
runs `node scripts/test-counter-hosted-container.mjs robys-counter-test`.
That test checks missing mounts, process UID, private-path denial, same-origin
checkout configuration, healthcheck isolation, graceful shutdown and an order
surviving replacement by a new container on the same temporary volume. Local
HTTP models the proxy's backend hop; public TLS, production accounts and backups
still require deployment verification.

Provider references: [volumes](https://docs.railway.com/volumes),
[healthchecks](https://docs.railway.com/deployments/healthchecks),
[backups](https://docs.railway.com/volumes/backups).
