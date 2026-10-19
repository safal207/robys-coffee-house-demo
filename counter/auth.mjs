import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const COST = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const dummyHash = `scrypt$32768$8$1$${randomBytes(16).toString("base64url")}$${randomBytes(64).toString("base64url")}`;
export const randomSecret = () => randomBytes(32).toString("base64url");
export const digest = value => createHash("sha256").update(value).digest("hex");
export const csrfForSession = token => createHmac("sha256", token).update("robys-counter-csrf-v1").digest("base64url");
export function equalSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function validSecret(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, "base64url").length === 32 && Buffer.from(value, "base64url").toString("base64url") === value;
}
export function normalizeUsername(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/.test(value) ? value.toLowerCase() : null;
}
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new Error("Password must contain 12–256 characters");
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, COST);
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
export async function verifyPassword(password, record) {
  const stored = record ?? dummyHash;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$32768$8$1") return false;
  const hash = await derive(password, Buffer.from(parts[4], "base64url"), 64, COST);
  return equalSecret(hash.toString("base64url"), parts[5]) && Boolean(record);
}
