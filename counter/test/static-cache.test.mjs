import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { createCounterServer } from "../server.mjs";

async function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "robys-static-cache-"));
  const rootDir = resolve(directory, "public");
  mkdirSync(resolve(rootDir, "counter/public"), { recursive: true });
  mkdirSync(resolve(rootDir, "counter/data"), { recursive: true });
  writeFileSync(resolve(rootDir, "index.html"), "<!doctype html><title>Menu</title>");
  writeFileSync(resolve(rootDir, "menu.css"), "body{color:red}");
  writeFileSync(resolve(rootDir, "private.txt"), "private");
  writeFileSync(resolve(rootDir, "counter/data/secret.json"), '{"private":true}');
  for (const name of ["guest.html", "guest.js", "guest.css", "staff.html", "staff.js", "staff.css"]) {
    writeFileSync(resolve(rootDir, "counter/public", name), `public ${name}`);
  }
  writeFileSync(resolve(rootDir, "integrity-manifest.json"), JSON.stringify({
    files: ["index.html", "menu.css", "counter/data/secret.json"].map(path => ({ path }))
  }));
  const server = createCounterServer({ rootDir, dbPath: resolve(directory, "private/orders.sqlite") });
  t.after(async () => {
    await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    const resolved = realpathSync(directory);
    assert(resolved.startsWith(`${realpathSync(tmpdir())}${sep}robys-static-cache-`));
    rmSync(resolved, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { rootDir, request: (path, options) => fetch(`${origin}${path}`, options) };
}

test("unchanged public assets return an empty 304 for GET and HEAD validators", async t => {
  const f = await fixture(t);
  const first = await f.request("/menu.css");
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "body{color:red}");
  const tag = first.headers.get("etag");
  assert.match(tag, /^W\/"[^\"]+"$/);
  assert.equal(first.headers.get("cache-control"), "no-cache");
  for (const method of ["GET", "HEAD"]) {
    for (const validator of [tag, tag.slice(2), `"outdated", ${tag}`, "*"]) {
      const response = await f.request("/menu.css", { method, headers: { "If-None-Match": validator } });
      assert.equal(response.status, 304);
      assert.equal(await response.text(), "");
      assert.equal(response.headers.get("etag"), tag);
      assert.equal(response.headers.get("cache-control"), "no-cache");
      assert.equal(response.headers.get("content-length"), null);
    }
  }
});

test("a changed file invalidates the previous ETag even when its size stays the same", async t => {
  const f = await fixture(t);
  const first = await f.request("/menu.css");
  const tag = first.headers.get("etag");
  await first.text();
  const file = resolve(f.rootDir, "menu.css");
  writeFileSync(file, "body{color:tan}");
  const changedTime = new Date(Date.now() + 2000);
  utimesSync(file, changedTime, changedTime);
  const changed = await f.request("/menu.css", { headers: { "If-None-Match": tag } });
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), "body{color:tan}");
  assert.notEqual(changed.headers.get("etag"), tag);
});

test("unknown and private paths cannot use a wildcard to bypass the public allowlist", async t => {
  const f = await fixture(t);
  for (const path of ["/missing.webp", "/private.txt", "/counter/data/secret.json", "/.git/config"]) {
    const response = await f.request(path, { headers: { "If-None-Match": "*" } });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("etag"), null);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }
});

test("live API, runtime config and counter pages ignore cache validators and stay no-store", async t => {
  const f = await fixture(t);
  for (const [path, status] of [["/api/counter/health", 200], ["/api/counter/session", 401],
    ["/api/counter/queue", 401], ["/api/counter/orders/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 404],
    ["/counter-config.json", 200], ["/counter/guest.html", 200], ["/counter/staff.html", 200]]) {
    const response = await f.request(path, { headers: { "If-None-Match": "*" } });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal(response.headers.get("etag"), null, path);
    assert.notEqual(await response.text(), "", path);
  }
});

test("range requests and ordinary HEAD requests retain their existing behavior", async t => {
  const f = await fixture(t);
  const range = await f.request("/menu.css", { headers: { Range: "bytes=0-3", "If-None-Match": 'W/"outdated"' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 0-3/15");
  assert.equal(await range.text(), "body");
  const head = await f.request("/menu.css", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "15");
  assert.equal(await head.text(), "");
});
