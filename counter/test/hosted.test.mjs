import test from "node:test";
import assert from "node:assert/strict";
import { hostedConfiguration } from "../hosted.mjs";

const mount = "31 24 0:27 / /data rw,relatime - ext4 /dev/volume rw\n";
const env = { RAILWAY_VOLUME_MOUNT_PATH: "/data", COUNTER_PUBLIC_ORIGIN: "https://counter.example.test", PORT: "8080" };

test("hosted startup binds a mounted database, explicit HTTPS origin and platform port", () => {
  assert.deepEqual(hostedConfiguration(env, mount), { port: 8080, host: "0.0.0.0", secureCookies: true,
    publicOrigin: env.COUNTER_PUBLIC_ORIGIN, healthcheckHost: "healthcheck.railway.app", dbPath: "/data/orders/counter.sqlite" });
});

test("hosted startup refuses ephemeral storage and missing or unsafe public origins", () => {
  for (const values of [{ ...env, RAILWAY_VOLUME_MOUNT_PATH: undefined }, { ...env, RAILWAY_VOLUME_MOUNT_PATH: "/app/data" }]) {
    assert.throws(() => hostedConfiguration(values, mount), /persistent volume/);
  }
  for (const mounts of ["", mount.replace(" /data ", " /data-other ")]) {
    assert.throws(() => hostedConfiguration(env, mounts), /persistent volume/);
  }
  for (const origin of [undefined, "", "http://counter.example.test", "https://user:pass@counter.example.test", "https://counter.example.test/menu", "https://counter.example.test/?q=1", "https://counter.example.test/#key"]) {
    assert.throws(() => hostedConfiguration({ ...env, COUNTER_PUBLIC_ORIGIN: origin }, mount), /HTTPS/);
  }
  for (const port of ["", "abc", "80", "65536", "8080.5"]) {
    assert.throws(() => hostedConfiguration({ ...env, PORT: port }, mount), /PORT/);
  }
});
