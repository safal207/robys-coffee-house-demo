import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { request } from "node:http";
import { randomBytes } from "node:crypto";
import { encodeOrderTicket, getOrCreateOrderTicket } from "../src/order-ticket.js";

const image = process.argv[2] ?? "robys-counter-test";
const suffix = randomBytes(6).toString("hex");
const name = `robys-counter-${suffix}`, volume = `${name}-data`;
const publicOrigin = "https://counter.example.test";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000 }).trim();
let port;
const api = (path, { method = "GET", body, headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = request({ host: "127.0.0.1", port, path, method, timeout: 3000,
    headers: { Host: "counter.example.test", ...(body ? { "Content-Type": "application/json", Origin: publicOrigin } : {}), ...headers } }, response => {
    const chunks = [];
    response.on("data", chunk => chunks.push(chunk));
    response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") }));
    response.on("error", reject);
  });
  req.on("error", reject);
  req.on("timeout", () => req.destroy(new Error("HTTP timeout")));
  req.end(body ? JSON.stringify(body) : undefined);
});
async function start() {
  docker("run", "--detach", "--name", name, "--publish", "127.0.0.1::8787",
    "--mount", `type=volume,source=${volume},target=/data`, "--env", "RAILWAY_VOLUME_MOUNT_PATH=/data",
    "--env", "PORT=8787", "--env", `COUNTER_PUBLIC_ORIGIN=${publicOrigin}`, image);
  const bindings = JSON.parse(docker("inspect", "--format", '{{json .NetworkSettings.Ports}}', name));
  port = Number(bindings["8787/tcp"][0].HostPort);
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await api("/api/counter/health")).status === 200) return; } catch { /* Wait only for bounded startup. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Container healthcheck did not pass: ${docker("logs", name)}`);
}
try {
  const withoutVolume = spawnSync("docker", ["run", "--rm", "--env", "RAILWAY_VOLUME_MOUNT_PATH=/data",
    "--env", `COUNTER_PUBLIC_ORIGIN=${publicOrigin}`, image], { encoding: "utf8", timeout: 30000 });
  assert.equal(withoutVolume.status, 1);
  assert.match(withoutVolume.stderr, /persistent volume mounted at \/data/);
  docker("volume", "create", volume);
  await start();
  const uid = docker("exec", name, "node", "--input-type=module", "-e",
    'import {readFileSync} from "node:fs"; console.log(readFileSync("/proc/1/status", "utf8").match(/^Uid:\\s+(.+)$/m)[1]);');
  assert.deepEqual(uid.split(/\s+/), ["1000", "1000", "1000", "1000"]);
  assert.equal((await api("/api/counter/health", { headers: { Host: "healthcheck.railway.app" } })).status, 200);
  assert.equal((await api("/api/counter/session", { headers: { Host: "healthcheck.railway.app" } })).status, 403);
  assert.deepEqual(JSON.parse((await api("/counter-config.json")).text), { enabled: true, checkoutUrl: "/counter/guest.html" });
  assert.equal((await api("/menu.html")).status, 200);
  assert.equal((await api("/counter/guest.html")).status, 200);
  for (const path of ["/counter/hosted.mjs", "/counter/data/counter.sqlite", "/counter/store.mjs", "/package.json"]) {
    assert.equal((await api(path)).status, 404, path);
  }
  const guestKey = randomBytes(32).toString("base64url");
  const ticket = getOrCreateOrderTicket({ version: 1, groups: [{ quantity: 1, items: [{ id: "brew-hot:black-tea", quantity: 1 }] }] });
  const created = await api("/api/counter/orders?lang=en", { method: "POST", body: { ticketPayload: encodeOrderTicket(ticket, "en"), guestKey } });
  assert.equal(created.status, 201);
  const order = JSON.parse(created.text).order;
  docker("stop", "--time", "12", name);
  assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", name), "0");
  docker("rm", name);
  await start();
  const persisted = await api(`/api/counter/orders/${order.id}?lang=en`, { headers: { Authorization: `Bearer ${guestKey}` } });
  assert.equal(persisted.status, 200);
  assert.deepEqual(JSON.parse(persisted.text).order, order);
  assert.equal((await api(`/api/counter/orders/${order.id}?lang=en`)).status, 404);
  console.log("PASS: hosted image refuses ephemeral storage, drops root, serves same-origin checkout and persists an order across container replacement.");
} finally {
  spawnSync("docker", ["rm", "--force", name], { stdio: "ignore", timeout: 30000 });
  spawnSync("docker", ["volume", "rm", volume], { stdio: "ignore", timeout: 30000 });
}
