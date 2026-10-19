import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodeOrderTicket, quoteOrderTicket, OrderTicketError } from "../src/order-ticket.js";
import { CounterError, openCounterStore, provisionUser } from "./store.mjs";
import { csrfForSession, digest, equalSecret, normalizeUsername, randomSecret, validSecret, verifyPassword } from "./auth.mjs";

export { provisionUser };
const PREFIX = "/api/counter";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const LANGUAGES = new Set(["tr", "en", "ru"]);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };
const PUBLIC_ASSETS = ["guest.html", "guest.js", "guest.css", "staff.html", "staff.js", "staff.css"];
const fail = (status, code) => { throw new CounterError(status, code); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function rateLimiter({ windowMs = 60000, max = 300 }, now) {
  const buckets = new Map();
  return key => {
    const at = now();
    if (buckets.size > 10000) for (const [id, bucket] of buckets) if (bucket.until <= at) buckets.delete(id);
    if (buckets.size > 10000 && !buckets.has(key)) fail(429, "rate_limited");
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= at) { bucket = { until: at + windowMs, count: 0 }; buckets.set(key, bucket); }
    if (++bucket.count > max) fail(429, "rate_limited");
  };
}

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(data === undefined ? undefined : JSON.stringify(data));
}
function readJson(request, limit = 8192) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) fail(415, "json_required");
  if (request.headers["content-encoding"] && request.headers["content-encoding"] !== "identity") fail(415, "unsupported_encoding");
  if (Number(request.headers["content-length"]) > limit) { request.resume(); fail(413, "body_too_large"); }
  return new Promise((resolveBody, reject) => {
    let size = 0, chunks = [], exceeded = false;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) { exceeded = true; chunks = []; reject(new CounterError(413, "body_too_large")); }
      else if (!exceeded) chunks.push(chunk);
    });
    request.on("end", () => {
      if (exceeded) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new CounterError(400, "invalid_json")); }
    });
    request.on("error", () => reject(new CounterError(400, "invalid_request")));
    request.on("aborted", () => reject(new CounterError(400, "invalid_request")));
  });
}

export function createCounterServer({ dbPath, rootDir = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  host = "127.0.0.1", secureCookies = !LOOPBACK.has(host), publicOrigin, now = Date.now,
  sessionTtlMs = 8 * 60 * 60 * 1000, rateLimits = {} } = {}) {
  const loopback = LOOPBACK.has(host);
  if (!secureCookies && !loopback) throw new Error("Insecure cookies are allowed only on an explicit loopback host");
  const configuredOrigin = publicOrigin ? new URL(publicOrigin) : null;
  if ((!loopback && !configuredOrigin) || (configuredOrigin && (configuredOrigin.protocol !== (secureCookies ? "https:" : "http:")
    || configuredOrigin.username || configuredOrigin.password || configuredOrigin.pathname !== "/" || configuredOrigin.search || configuredOrigin.hash))) {
    throw new Error("Non-loopback service requires its explicit HTTPS publicOrigin");
  }
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 1 || sessionTtlMs > 24 * 60 * 60 * 1000) throw new Error("Invalid session lifetime");
  const root = realpathSync(rootDir);
  const manifest = JSON.parse(readFileSync(resolve(root, "integrity-manifest.json"), "utf8"));
  const staticFiles = new Map();
  for (const entry of manifest.files) {
    const path = entry.path;
    if (typeof path !== "string" || path.startsWith("counter/") || path.startsWith(".") || path.includes("\\")
      || path.split("/").some(segment => !segment || segment === ".." || segment.startsWith(".")) || !MIME[extname(path)]) continue;
    staticFiles.set(`/${path}`, resolve(root, path));
  }
  staticFiles.set("/", resolve(root, "index.html"));
  staticFiles.set("/integrity-manifest.json", resolve(root, "integrity-manifest.json"));
  for (const asset of PUBLIC_ASSETS) staticFiles.set(`/counter/${asset}`, resolve(root, "counter/public", asset));
  const store = openCounterStore(dbPath ?? resolve(root, "counter/data/counter.sqlite"));
  const cookieName = secureCookies ? "__Host-roby-counter-session" : "roby-counter-session";
  const apiLimit = rateLimiter({ max: 1200, ...rateLimits.api }, now);
  const readLimit = rateLimiter({ max: 90, ...rateLimits.read }, now);
  const loginLimit = rateLimiter({ max: 8, ...rateLimits.login }, now);
  const createLimit = rateLimiter({ max: 30, ...rateLimits.create }, now);
  const cookie = (token, maxAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  function authentication(request, required = false) {
    const matches = (request.headers.cookie ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    const token = matches.length === 1 ? matches[0].slice(cookieName.length + 1) : null;
    const user = validSecret(token) ? store.session(token, now()) : null;
    if (!user && required) fail(401, "unauthorized");
    return user ? { user, token, csrfToken: csrfForSession(token) } : null;
  }
  function staffWrite(request) {
    const auth = authentication(request, true);
    if (!equalSecret(request.headers["x-csrf-token"], auth.csrfToken)) fail(403, "invalid_csrf");
    return auth;
  }
  function requestOrigin(request) {
    const port = server.address()?.port;
    const expectedHosts = configuredOrigin ? [configuredOrigin.host] : [host === "::1" ? `[::1]:${port}` : `${host}:${port}`,
      ...(loopback ? [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`] : [])];
    if (!expectedHosts.includes(request.headers.host?.toLowerCase())) fail(403, "invalid_host");
    return configuredOrigin?.origin ?? `${secureCookies ? "https" : "http"}://${request.headers.host}`;
  }
  async function api(request, response, url, origin) {
    const ip = request.socket.remoteAddress ?? "unknown";
    const language = url.searchParams.get("lang") ?? "tr";
    if (!LANGUAGES.has(language) || [...url.searchParams.keys()].some(key => key !== "lang") || url.searchParams.getAll("lang").length > 1) {
      apiLimit(ip); fail(400, "invalid_query");
    }
    if (request.headers["sec-fetch-site"] === "cross-site") { apiLimit(ip); fail(403, "invalid_origin"); }
    const path = url.pathname.slice(PREFIX.length);
    const orderRead = request.method === "GET" && path.match(/^\/orders\/([A-Za-z0-9_-]{32})$/);
    let pollingAuth, pollingOrder, pollingToken;
    // Valid polling has its own session/capability budget. A café LAN or an
    // untrusted reverse proxy may give every guest the same socket address;
    // their routine reads must not exhaust the address budget for writes.
    // Never derive a principal from a forwarded header or token shape alone.
    if (request.method === "GET" && (path === "/session" || path === "/queue" || orderRead)) {
      try {
        pollingAuth = authentication(request, !orderRead);
        if (orderRead) {
          const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
          pollingOrder = store.readOrder(orderRead[1], { user: pollingAuth?.user,
            guestKey: validSecret(bearer) ? bearer : null, language });
          pollingToken = pollingAuth?.token ?? bearer;
        } else pollingToken = pollingAuth.token;
      } catch (error) {
        apiLimit(ip);
        throw error;
      }
    }
    // Keep this outside the verification catch: a throttled valid reader must
    // not spill into the shared address bucket on its next polling attempt.
    if (pollingToken) readLimit(digest(pollingToken));
    else apiLimit(ip);
    if (request.method === "GET") {
      if (path === "/health") return json(response, 200, { ok: true });
      if (path === "/session") {
        const { user, csrfToken } = pollingAuth;
        return json(response, 200, { user: { username: user.username, role: user.role }, csrfToken });
      }
      if (path === "/queue") {
        const { user } = pollingAuth;
        return json(response, 200, { orders: store.queue(user, language, now()) });
      }
      if (orderRead) return json(response, 200, { order: pollingOrder });
      fail(404, "not_found");
    }
    if (request.method !== "POST") fail(405, "method_not_allowed");
    if (request.headers.origin !== origin) fail(403, "invalid_origin");
    if (path === "/login") loginLimit(ip);
    if (path === "/orders") createLimit(ip);
    const body = await readJson(request);
    if (path === "/login") {
      if (!exactKeys(body, ["username", "password"]) || !normalizeUsername(body.username)
        || typeof body.password !== "string" || body.password.length < 1 || body.password.length > 256) fail(400, "invalid_request");
      const user = store.userByName(normalizeUsername(body.username));
      if (!await verifyPassword(body.password, user?.password_hash)) fail(401, "invalid_credentials");
      if (store.userByName(user.username)?.password_hash !== user.password_hash) fail(401, "invalid_credentials");
      const previous = authentication(request);
      if (previous) store.logout(previous.token);
      const token = randomSecret();
      store.createSession(token, user.id, now(), sessionTtlMs);
      response.setHeader("Set-Cookie", cookie(token, Math.floor(sessionTtlMs / 1000)));
      return json(response, 200, { user: { username: user.username, role: user.role }, csrfToken: csrfForSession(token) });
    }
    if (path === "/logout") {
      const { token } = staffWrite(request);
      if (!exactKeys(body, [])) fail(400, "invalid_request");
      store.logout(token);
      response.setHeader("Set-Cookie", cookie("", 0));
      return json(response, 204);
    }
    if (path === "/orders") {
      if (!exactKeys(body, ["ticketPayload", "guestKey"]) || !validSecret(body.guestKey)) fail(400, "invalid_request");
      let ticket;
      try { ({ ticket } = decodeOrderTicket(body.ticketPayload)); }
      catch (error) { if (error instanceof OrderTicketError) fail(400, "invalid_ticket"); throw error; }
      const quotes = Object.fromEntries([...LANGUAGES].map(lang => [lang, quoteOrderTicket(ticket, lang)]));
      const result = store.createOrder({ ticket, guestKey: body.guestKey, quotes, language, now: now() });
      return json(response, result.created ? 201 : 200, { order: result.order });
    }
    const match = path.match(/^\/orders\/([A-Za-z0-9_-]{32})\/(pay|status)$/);
    if (match) {
      const { user } = staffWrite(request);
      const action = match[2];
      if (action === "pay" && user.role !== "cashier") fail(403, "forbidden");
      if (!exactKeys(body, action === "pay" ? ["version"] : ["version", "status"])
        || !Number.isSafeInteger(body.version) || body.version < 1
        || (action === "status" && !["ready", "issued"].includes(body.status))) fail(400, "invalid_request");
      return json(response, 200, { order: store.transition(match[1], { user, action,
        version: body.version, status: body.status, language, now: now() }) });
    }
    fail(404, "not_found");
  }
  async function serveStatic(request, response, pathname) {
    if (!["GET", "HEAD"].includes(request.method)) fail(405, "method_not_allowed");
    if (pathname === "/counter-config.json") return json(response, 200, { enabled: true, checkoutUrl: "/counter/guest.html" });
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { fail(400, "invalid_path"); }
    if (decoded.includes("\\") || decoded.includes("\0")) fail(404, "not_found");
    if (decoded.endsWith("/") && staticFiles.has(`${decoded}index.html`)) decoded += "index.html";
    const file = staticFiles.get(decoded);
    if (!file) fail(404, "not_found");
    let actual, info;
    try { actual = await realpath(file); info = await stat(actual); } catch { fail(404, "not_found"); }
    if (actual !== file || !actual.startsWith(`${root}${sep}`) || !info.isFile()) fail(404, "not_found");
    const headers = { "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      "Cache-Control": decoded.startsWith("/counter/") ? "no-store" : "no-cache", "Accept-Ranges": "bytes" };
    if (headers["Cache-Control"] === "no-cache") {
      // Validate the current allowlisted file before reusing a browser's copy.
      // Counter pages and live API responses deliberately remain no-store.
      const tag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
      headers.ETag = `W/${tag}`;
      const validators = (request.headers["if-none-match"] ?? "").split(",").map(value => value.trim());
      if (validators.some(value => value === "*" || value.replace(/^W\//, "") === tag)) {
        response.writeHead(304, headers);
        response.end();
        return;
      }
    }
    if (decoded.startsWith("/counter/")) {
      headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'";
      headers["Permissions-Policy"] = `camera=${decoded === "/counter/staff.html" ? "(self)" : "()"}, microphone=(), geolocation=()`;
    }
    const bytes = await readFile(actual);
    let start = 0, end = bytes.length - 1, status = 200;
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!range || (!range[1] && !range[2])) fail(416, "invalid_range");
      if (!range[1]) start = Math.max(0, bytes.length - Number(range[2]));
      else start = Number(range[1]);
      if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) fail(416, "invalid_range");
      headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
      status = 206;
    }
    headers["Content-Length"] = Math.max(0, end - start + 1);
    response.writeHead(status, headers);
    response.end(request.method === "HEAD" ? undefined : bytes.subarray(start, end + 1));
  }
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    try {
      const origin = requestOrigin(request);
      const url = new URL(request.url, origin);
      if (url.origin !== origin) fail(403, "invalid_origin");
      if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) {
        response.setHeader("Cache-Control", "no-store");
        await api(request, response, url, origin);
      } else await serveStatic(request, response, url.pathname);
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.end(); return; }
      if (error.status === 429) response.setHeader("Retry-After", "60");
      json(response, error instanceof CounterError ? error.status : 500,
        { error: error instanceof CounterError ? error.code : "internal_error" });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on("close", () => store.close());
  server.provisionUser = user => store.provisionUser(user);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.COUNTER_HOST ?? "127.0.0.1";
  const port = Number(process.env.COUNTER_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid COUNTER_PORT");
  const server = createCounterServer({ host, dbPath: process.env.COUNTER_DB, publicOrigin: process.env.COUNTER_PUBLIC_ORIGIN });
  server.listen(port, host, () => console.log(`Local counter ready on ${host}:${port}`));
  const stop = () => server.close(() => { process.exitCode = 0; });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
