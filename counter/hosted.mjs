import { chownSync, chmodSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCounterServer } from "./server.mjs";

// Railway supplies the mount variable only for an attached volume. Check the
// kernel mount table too: an ordinary /data directory is not persistent storage.
export function hostedConfiguration(env, mountInfo) {
  if (env.RAILWAY_VOLUME_MOUNT_PATH !== "/data"
    || !mountInfo.split("\n").some(line => line.split(" ")[4] === "/data")) {
    throw new Error("Counter requires a persistent volume mounted at /data");
  }
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid hosted PORT");
  let origin;
  try { origin = new URL(env.COUNTER_PUBLIC_ORIGIN); } catch { throw new Error("Explicit HTTPS COUNTER_PUBLIC_ORIGIN is required"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("COUNTER_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials");
  }
  return { port, host: "0.0.0.0", secureCookies: true, publicOrigin: origin.origin,
    healthcheckHost: "healthcheck.railway.app", dbPath: "/data/orders/counter.sqlite" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = hostedConfiguration(process.env, readFileSync("/proc/self/mountinfo", "utf8"));
  process.umask(0o077);
  if (realpathSync("/data") !== "/data") throw new Error("Counter volume must not be a symlink");
  mkdirSync("/data/orders", { recursive: true, mode: 0o700 });
  if (realpathSync("/data/orders") !== "/data/orders") throw new Error("Counter data directory must not be a symlink");
  // Railway volumes arrive owned by root. Initialize only our private directory,
  // then drop all supplemental groups and root before opening the DB or socket.
  if (process.getuid() === 0) {
    chownSync("/data/orders", 1000, 1000);
    chmodSync("/data/orders", 0o700);
    process.setgroups([]);
    process.setgid(1000);
    process.setuid(1000);
  }
  const server = createCounterServer(config);
  server.listen(config.port, config.host, () => console.log(`Counter ready at ${config.publicOrigin}`));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => server.closeAllConnections(), 9000);
    deadline.unref();
    server.close(() => clearTimeout(deadline));
    server.closeIdleConnections();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
